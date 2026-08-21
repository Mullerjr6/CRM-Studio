import test from "node:test";
import assert from "node:assert/strict";
import { validateResultPayload } from "./validation.js";

const validPayload = {
  generatedAt: "2026-07-22T14:00:00.000Z",
  windowDays: 30,
  dataOrigin: "base-loja-venda-real",
  baseStore: "SCR",
  totalSent: 300,
  sellers: [
    { sellerKey: "sirlene-schafer", sellerName: "Sirlene Schafer", clientsSent: 300, conversions: 30, revenue: 12500 },
    { sellerKey: "amanda", sellerName: "Amanda", clientsSent: 300, conversions: 18, revenue: 7200 },
    { sellerKey: "marines-brant", sellerName: "Marines Brant", clientsSent: 300, conversions: 10, revenue: 4100 }
  ]
};

test("normaliza vendedoras dinâmicas e usa a base da loja uma única vez", () => {
  const result = validateResultPayload(validPayload);
  assert.equal(result.totals.sent, 300);
  assert.equal(result.totals.conversions, 58);
  assert.equal(result.totals.revenue, 23800);
  assert.equal(result.sellers.some((seller) => seller.sellerName === "Amanda"), true);
  assert.equal(result.sourceKey.length, 64);
});

test("rejeita Patricia com variações de caixa e espaço", () => {
  assert.throws(
    () => validateResultPayload({
      ...validPayload,
      sellers: [
        ...validPayload.sellers,
        { sellerKey: "patricia-ullmann", sellerName: "  PATRICIA   ULLMANN ", clientsSent: 300, conversions: 1, revenue: 100 }
      ]
    }),
    /Vendedora excluída/
  );
});

test("rejeita denominador por vendedora diferente da base total", () => {
  const payload = structuredClone(validPayload);
  payload.sellers[0].clientsSent = 150;
  assert.throws(() => validateResultPayload(payload), /total da base da loja/);
});

test("rejeita soma de conversões maior que a base da loja", () => {
  const payload = structuredClone(validPayload);
  payload.sellers[0].conversions = 290;
  assert.throws(() => validateResultPayload(payload), /soma das conversões/);
});

test("gera a mesma chave para o mesmo processamento", () => {
  assert.equal(
    validateResultPayload(validPayload).sourceKey,
    validateResultPayload(structuredClone(validPayload)).sourceKey
  );
});
