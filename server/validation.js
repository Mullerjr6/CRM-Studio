import { createHash } from "node:crypto";

const SELLERS = new Map([
  ["marines", "Marines"],
  ["sirlene", "Sirlene"],
  ["patricia", "Patrícia"]
]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function integer(value, label, maximum = 10_000_000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw validationError(`${label} deve ser um número inteiro entre 0 e ${maximum}.`);
  }
  return parsed;
}

function decimal(value, label, maximum = 1_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw validationError(`${label} deve ser um número válido entre 0 e ${maximum}.`);
  }
  return Math.round(parsed * 100) / 100;
}

export function validateResultPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("O corpo da requisição deve ser um objeto JSON.");
  }

  const generatedAt = new Date(payload.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    throw validationError("A data de geração é inválida.");
  }

  const windowDays = integer(payload.windowDays, "A janela de conversão", 3650);
  if (windowDays < 1) throw validationError("A janela de conversão deve ter pelo menos um dia.");

  const dataOrigin = String(payload.dataOrigin || "base600-real-seller").trim();
  if (!/^[a-z0-9-]{3,40}$/i.test(dataOrigin)) {
    throw validationError("A origem dos dados é inválida.");
  }

  if (!Array.isArray(payload.sellers) || payload.sellers.length !== SELLERS.size) {
    throw validationError("Informe os resultados de Marines, Sirlene e Patrícia.");
  }

  const seen = new Set();
  const sellers = payload.sellers.map((seller) => {
    const sellerKey = String(seller && seller.sellerKey || "").trim().toLowerCase();
    if (!SELLERS.has(sellerKey) || seen.has(sellerKey)) {
      throw validationError("As responsáveis informadas são inválidas ou estão duplicadas.");
    }
    seen.add(sellerKey);
    const clientsSent = integer(seller.clientsSent, `Clientes enviados de ${SELLERS.get(sellerKey)}`);
    const conversions = integer(seller.conversions, `Conversões de ${SELLERS.get(sellerKey)}`);
    const revenue = decimal(seller.revenue, `Receita de ${SELLERS.get(sellerKey)}`);
    const conversionRate = clientsSent ? Math.round(conversions / clientsSent * 100_000) / 1000 : 0;
    return {
      sellerKey,
      sellerName: SELLERS.get(sellerKey),
      clientsSent,
      conversions,
      revenue,
      conversionRate
    };
  }).sort((left, right) => left.sellerKey.localeCompare(right.sellerKey));

  const totals = sellers.reduce((result, seller) => ({
    sent: result.sent + seller.clientsSent,
    conversions: result.conversions + seller.conversions,
    revenue: Math.round((result.revenue + seller.revenue) * 100) / 100
  }), { sent: 0, conversions: 0, revenue: 0 });

  const normalized = {
    generatedAt: generatedAt.toISOString(),
    windowDays,
    dataOrigin,
    sellers,
    totals
  };
  normalized.sourceKey = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  return normalized;
}
