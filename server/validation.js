import { createHash } from "node:crypto";

const VENDEDORES_EXCLUIDOS = new Set(["patricia", "patricia ullmann"]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizarTexto(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function criarChaveVendedora(value) {
  return normalizarTexto(value).replace(/\s+/g, "-").slice(0, 30);
}

function vendedorExcluido(value) {
  const name = normalizarTexto(value);
  return VENDEDORES_EXCLUIDOS.has(name) || VENDEDORES_EXCLUIDOS.has(name.split(" ")[0]);
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

  const dataOrigin = String(payload.dataOrigin || "base-loja-venda-real").trim();
  if (!/^[a-z0-9-]{3,40}$/i.test(dataOrigin)) {
    throw validationError("A origem dos dados é inválida.");
  }

  const totalSent = integer(payload.totalSent, "O total da base da loja");
  if (!Array.isArray(payload.sellers) || payload.sellers.length > 100) {
    throw validationError("Informe uma lista válida de resultados por vendedora.");
  }

  const seen = new Set();
  const sellers = payload.sellers.map((seller) => {
    const sellerName = String(seller && seller.sellerName || "").trim();
    const sellerKey = criarChaveVendedora(seller && (seller.sellerKey || sellerName));
    if (!sellerName || sellerName.length > 80 || !sellerKey || seen.has(sellerKey)) {
      throw validationError("As vendedoras informadas são inválidas ou estão duplicadas.");
    }
    if (vendedorExcluido(sellerName) || vendedorExcluido(sellerKey)) {
      throw validationError("Vendedora excluída não pode ser contabilizada nos resultados.");
    }
    seen.add(sellerKey);
    const clientsSent = integer(seller.clientsSent, `Clientes da base de ${sellerName}`);
    if (clientsSent !== totalSent) {
      throw validationError(`O denominador de ${sellerName} deve ser o total da base da loja.`);
    }
    const conversions = integer(seller.conversions, `Conversões de ${sellerName}`);
    if (conversions > totalSent) {
      throw validationError(`As conversões de ${sellerName} não podem superar o total da base.`);
    }
    const revenue = decimal(seller.revenue, `Receita de ${sellerName}`);
    const conversionRate = totalSent ? Math.round(conversions / totalSent * 100_000) / 1000 : 0;
    return { sellerKey, sellerName, clientsSent: totalSent, conversions, revenue, conversionRate };
  }).sort((left, right) => left.sellerKey.localeCompare(right.sellerKey));

  const totals = sellers.reduce((result, seller) => ({
    sent: totalSent,
    conversions: result.conversions + seller.conversions,
    revenue: Math.round((result.revenue + seller.revenue) * 100) / 100
  }), { sent: totalSent, conversions: 0, revenue: 0 });

  if (totals.conversions > totalSent) {
    throw validationError("A soma das conversões por vendedora não pode superar a base da loja.");
  }

  const normalized = {
    generatedAt: generatedAt.toISOString(),
    windowDays,
    dataOrigin,
    baseStore: String(payload.baseStore || "").trim().toUpperCase(),
    sellers,
    totals
  };
  normalized.sourceKey = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  return normalized;
}
