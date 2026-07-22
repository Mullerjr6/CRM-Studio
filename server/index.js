import http from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { validateResultPayload } from "./validation.js";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL
  || "postgresql://crm_studio:crm_studio_local@127.0.0.1:5432/crm_studio";
const JSON_LIMIT = 64 * 1024;
const STATIC_EXTENSIONS = new Set([".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".map"]);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8"
};

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on("error", (error) => {
  console.error("Erro inesperado em uma conexão ociosa do PostgreSQL:", error);
});

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > JSON_LIMIT) {
      const error = new Error("O corpo da requisição excede 64 KB.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch (_) {
    const error = new Error("O corpo da requisição não contém um JSON válido.");
    error.statusCode = 400;
    throw error;
  }
}

function mapRun(row) {
  return {
    id: Number(row.id),
    generatedAt: new Date(row.generated_at).toISOString(),
    windowDays: row.window_days,
    dataOrigin: row.data_origin,
    totalSent: row.total_sent,
    totalConversions: row.total_conversions,
    totalRevenue: Number(row.total_revenue),
    createdAt: new Date(row.created_at).toISOString(),
    sellers: (row.sellers || []).map((seller) => ({
      sellerKey: seller.sellerKey,
      sellerName: seller.sellerName,
      clientsSent: Number(seller.clientsSent),
      conversions: Number(seller.conversions),
      revenue: Number(seller.revenue),
      conversionRate: Number(seller.conversionRate)
    }))
  };
}

async function saveResult(request, response) {
  const result = validateResultPayload(await readJson(request));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const runQuery = await client.query(`
      INSERT INTO conversion_runs (
        source_key, generated_at, window_days, data_origin,
        total_sent, total_conversions, total_revenue
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (source_key) DO UPDATE SET
        generated_at = EXCLUDED.generated_at,
        window_days = EXCLUDED.window_days,
        data_origin = EXCLUDED.data_origin,
        total_sent = EXCLUDED.total_sent,
        total_conversions = EXCLUDED.total_conversions,
        total_revenue = EXCLUDED.total_revenue,
        updated_at = NOW()
      RETURNING id
    `, [
      result.sourceKey,
      result.generatedAt,
      result.windowDays,
      result.dataOrigin,
      result.totals.sent,
      result.totals.conversions,
      result.totals.revenue
    ]);
    const runId = runQuery.rows[0].id;
    await client.query("DELETE FROM seller_results WHERE run_id = $1", [runId]);
    for (const seller of result.sellers) {
      await client.query(`
        INSERT INTO seller_results (
          run_id, seller_key, seller_name, clients_sent,
          conversions, revenue, conversion_rate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        runId,
        seller.sellerKey,
        seller.sellerName,
        seller.clientsSent,
        seller.conversions,
        seller.revenue,
        seller.conversionRate
      ]);
    }
    await client.query("COMMIT");
    sendJson(response, 201, { ok: true, id: Number(runId), sourceKey: result.sourceKey });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listResults(url, response) {
  const requestedLimit = Number(url.searchParams.get("limit") || 20);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 20;
  const query = await pool.query(`
    SELECT
      run.id,
      run.generated_at,
      run.window_days,
      run.data_origin,
      run.total_sent,
      run.total_conversions,
      run.total_revenue,
      run.created_at,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'sellerKey', seller.seller_key,
            'sellerName', seller.seller_name,
            'clientsSent', seller.clients_sent,
            'conversions', seller.conversions,
            'revenue', seller.revenue,
            'conversionRate', seller.conversion_rate
          ) ORDER BY seller.seller_name
        ) FILTER (WHERE seller.id IS NOT NULL),
        '[]'::JSON
      ) AS sellers
    FROM conversion_runs AS run
    LEFT JOIN seller_results AS seller ON seller.run_id = run.id
    GROUP BY run.id
    ORDER BY run.generated_at DESC, run.id DESC
    LIMIT $1
  `, [limit]);
  sendJson(response, 200, { ok: true, results: query.rows.map(mapRun) });
}

async function serveStatic(url, response, headOnly) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_) {
    sendJson(response, 400, { ok: false, error: "Endereço inválido." });
    return;
  }
  const relativePath = pathname === "/" ? "GERADOR_CRM_SCR.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);
  const rootPrefix = `${ROOT}${path.sep}`;
  const extension = path.extname(filePath).toLowerCase();
  if ((!filePath.startsWith(rootPrefix) && filePath !== ROOT) || !STATIC_EXTENSIONS.has(extension)) {
    sendJson(response, 404, { ok: false, error: "Arquivo não encontrado." });
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not-file");
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
      "Content-Length": fileStat.size,
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    });
    if (headOnly) response.end();
    else createReadStream(filePath).pipe(response);
  } catch (_) {
    sendJson(response, 404, { ok: false, error: "Arquivo não encontrado." });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    const health = await pool.query("SELECT NOW() AS now, CURRENT_DATABASE() AS database");
    sendJson(response, 200, {
      ok: true,
      database: health.rows[0].database,
      time: health.rows[0].now
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/resultados") {
    await listResults(url, response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/resultados") {
    await saveResult(request, response);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { ok: false, error: "Endpoint não encontrado." });
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { ok: false, error: "Método não permitido." });
    return;
  }
  await serveStatic(url, response, request.method === "HEAD");
}

async function initializeDatabase() {
  const schema = await readFile(path.join(ROOT, "server", "db", "init.sql"), "utf8");
  const attempts = 20;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query(schema);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`PostgreSQL ainda indisponível; nova tentativa ${attempt}/${attempts}...`);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

await initializeDatabase();

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, error.statusCode || 500, {
        ok: false,
        error: error.statusCode ? error.message : "Erro interno do servidor."
      });
    } else response.end();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CRM Studio disponível em http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`Encerrando por ${signal}...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
