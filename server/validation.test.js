import test from "node:test";
import assert from "node:assert/strict";
import { validateResultPayload } from "./validation.js";

const validPayload = {
  generatedAt: "2026-07-22T14:00:00.000Z",
  windowDays: 30,
  dataOrigin: "base600-real-seller",
  sellers: [
    { sellerKey: "marines", clientsSent: 2, conversions: 2, revenue: 611.34 },
    { sellerKey: "sirlene", clientsSent: 71, conversions: 71, revenue: 45529.39 },
    { sellerKey: "patricia", clientsSent: 84, conversions: 84, revenue: 47986.08 }
  ]
};

test("normaliza e totaliza um resultado válido", () => {
  const result = validateResultPayload(validPayload);
  assert.equal(result.totals.sent, 157);
  assert.equal(result.totals.conversions, 157);
  assert.equal(result.totals.revenue, 94126.81);
  assert.equal(result.sellers[0].sellerKey, "marines");
  assert.equal(result.sourceKey.length, 64);
});

test("rejeita responsáveis ausentes", () => {
  assert.throws(
    () => validateResultPayload({ ...validPayload, sellers: validPayload.sellers.slice(0, 2) }),
    /Marines, Sirlene e Patrícia/
  );
});

test("gera a mesma chave para o mesmo processamento", () => {
  assert.equal(
    validateResultPayload(validPayload).sourceKey,
    validateResultPayload(structuredClone(validPayload)).sourceKey
  );
});
