import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function carregarApi() {
  const janela = {};
  const documento = {
    readyState: "complete",
    getElementById() { return null; },
    addEventListener() {}
  };
  const contexto = vm.createContext({
    window: janela,
    document: documento,
    console,
    Date,
    Map,
    Set,
    Option: function Option() {}
  });
  vm.runInContext(fs.readFileSync("crm-conversions.js", "utf8"), contexto);
  return janela.ConversionStudio;
}

const registroScr = { storeFinal: "SCR", storeOriginal: "SCR" };

test("cenários B e C: Sirlene e Amanda convertem pela venda real de SCR", () => {
  const api = carregarApi();
  for (const seller of ["Sirlene Schafer", "Amanda"]) {
    const result = api.classifyConversion(
      registroScr,
      { store: "LOJAS HOJE COM VEST LTDA -SCR", seller },
      "Base 600"
    );
    assert.equal(result.valid, true);
    assert.equal(result.type, "valid");
  }
});

test("cenário D: compra em outra loja não converte SCR", () => {
  const result = carregarApi().classifyConversion(
    registroScr,
    { store: "CGO", seller: "Amanda" },
    "Base 600"
  );
  assert.equal(result.valid, false);
  assert.equal(result.type, "other-store");
});

test("cenário E: Patricia é excluída com normalização robusta", () => {
  const api = carregarApi();
  for (const seller of ["Patricia", "  PATRICIA   ULLMANN ", "Patrícia Ullmann"]) {
    const result = api.classifyConversion(registroScr, { store: "SCR", seller }, "Base 600");
    assert.equal(result.valid, false);
    assert.equal(result.type, "excluded-seller");
  }
});

test("cenário F: cliente sem compra permanece não convertido", () => {
  const result = carregarApi().classifyConversion(registroScr, null, "Não identificado");
  assert.equal(result.valid, false);
  assert.equal(result.type, "not-converted");
});

test("cenário G: um CPF com várias conversões conta como um cliente", () => {
  const api = carregarApi();
  const results = [
    {
      cpf: "12345678900", converted: true, firstConversionDate: new Date("2026-08-01"),
      lastConversionDate: new Date("2026-08-01"), lastConversionValue: 100,
      lastConversionSeller: "Sirlene", sendDate: new Date("2026-07-30"), sourceRow: 1,
      convertedRevenue: 100, convertedPurchases: 1
    },
    {
      cpf: "12345678900", converted: true, firstConversionDate: new Date("2026-08-10"),
      lastConversionDate: new Date("2026-08-10"), lastConversionValue: 80,
      lastConversionSeller: "Amanda", sendDate: new Date("2026-08-08"), sourceRow: 2,
      convertedRevenue: 80, convertedPurchases: 1
    }
  ];
  api.consolidateConversionsByCpf(results);
  assert.equal(results.filter((result) => result.converted).length, 1);
  assert.equal(results[0].convertedRevenue, 180);
  assert.equal(results[0].convertedPurchases, 2);
  assert.equal(results[1].conversionType, "duplicate-conversion");
});

test("cenário H: a soma por vendedora bate com 58 CPFs convertidos", () => {
  const api = carregarApi();
  const distribuicao = [["Sirlene", 30], ["Amanda", 18], ["Marines", 10]];
  const results = distribuicao.flatMap(([seller, amount], sellerIndex) => (
    Array.from({ length: amount }, (_, index) => ({
      cpf: String(sellerIndex * 100 + index).padStart(11, "0"),
      converted: true,
      conversionSeller: seller,
      convertedRevenue: 100,
      convertedPurchases: 1
    }))
  ));
  const groups = api.groupResults(results, (result) => result.conversionSeller);
  assert.equal(groups.reduce((total, group) => total + group.converted, 0), 58);
  assert.equal(JSON.stringify(groups.map((group) => group.converted)), JSON.stringify([30, 18, 10]));
});

test("filtro por vendedora preserva o denominador da base da loja", () => {
  const api = carregarApi();
  const base = Array.from({ length: 6 }, (_, index) => ({
    cpf: String(index + 1).padStart(11, "0"),
    storeFinal: "SCR",
    campaign: "Novidade",
    sendDate: new Date("2026-08-01"),
    converted: index === 0,
    conversionSeller: index === 0 ? "Amanda" : "",
    convertedRevenue: index === 0 ? 200 : 0,
    convertedPurchases: index === 0 ? 1 : 0
  }));
  const filtroAmanda = base.filter((result) => result.conversionSeller === "Amanda");
  const indicators = api.calculateIndicators(filtroAmanda, base.length, base);
  assert.equal(indicators.totalSent, 6);
  assert.equal(indicators.converted, 1);
  assert.equal(Math.round(indicators.rate * 10) / 10, 16.7);
  assert.equal(Math.round(indicators.bestStoreRate.rate * 10) / 10, 16.7);
});
