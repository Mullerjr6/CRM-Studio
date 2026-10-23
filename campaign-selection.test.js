import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function criarElementoFalso() {
  const classes = new Set();
  const rotulo = {
    childNodes: [],
    hidden: false,
    classList: { add() {}, remove() {} }
  };

  return {
    value: "",
    checked: false,
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    readOnly: false,
    style: {},
    classList: {
      add: (...nomes) => nomes.forEach((nome) => classes.add(nome)),
      remove: (...nomes) => nomes.forEach((nome) => classes.delete(nome)),
      contains: (nome) => classes.has(nome),
      toggle() {}
    },
    addEventListener() {},
    setAttribute() {},
    closest: () => rotulo,
    scrollIntoView() {}
  };
}

function carregarContexto() {
  const elementos = new Map();
  const document = {
    getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, criarElementoFalso());
      return elementos.get(id);
    }
  };
  const window = {
    localStorage: { getItem: () => null, setItem() {} }
  };
  const contexto = vm.createContext({
    window,
    document,
    console,
    Date,
    Intl,
    Set,
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    Blob,
    URL
  });

  vm.runInContext(readFileSync("crm-studio.js", "utf8"), contexto);
  vm.runInContext('modoGeradorAtual = "multi"', contexto);
  return contexto;
}

test("redistribui vagas sobrepostas e mantém 300 CPFs únicos", () => {
  const contexto = carregarContexto();
  let sequencia = 1;
  const criarCliente = () => ({
    cpf: String(sequencia++).padStart(11, "0"),
    nome: "Cliente",
    telefones: ["51999999999"],
    loja: "SCR",
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 0,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  });
  const clientes = [];
  const aniversarios = Array.from({ length: 43 }, () => {
    const cliente = criarCliente();
    cliente.nascimento = new Date(1990, 7, 5);
    clientes.push(cliente);
    return cliente;
  });

  for (const cliente of aniversarios.slice(0, 2)) {
    cliente.proximaCompra = true;
    cliente.previsaoNoPeriodo = true;
  }
  for (let indice = 0; indice < 51; indice++) {
    const cliente = criarCliente();
    cliente.proximaCompra = true;
    cliente.previsaoNoPeriodo = true;
    clientes.push(cliente);
  }
  for (let indice = 0; indice < 100; indice++) {
    const cliente = criarCliente();
    cliente.percentualDesconto = 30;
    clientes.push(cliente);
  }
  for (let indice = 0; indice < 100; indice++) {
    const cliente = criarCliente();
    cliente.percentualDesconto = 10;
    clientes.push(cliente);
  }
  for (let indice = 0; indice < 100; indice++) {
    const cliente = criarCliente();
    cliente.diasInativo = 100;
    clientes.push(cliente);
  }

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojaFinal: "SCR"
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  assert.equal(resultado.baseFinal.length, 300);
  assert.equal(new Set(resultado.baseFinal.map((cliente) => cliente.cpf)).size, 300);
  assert.equal(resultado.metasCampanha["Aniversário"], 43);
  assert.equal(resultado.metasCampanha["Próxima Compra"], 51);
  assert.equal(resultado.redistribuicoesSobreposicao.length, 2);
  assert.equal(resultado.baseFinal.every((cliente) => cliente.lojaFinal === "SCR"), true);
  assert.equal(resultado.distribuicaoVendedoras["SIRLENE SCHAFER"], 150);
  assert.equal(resultado.distribuicaoVendedoras["MARINES BRANT"], 150);
  for (const campanha of resultado.campanhasAtivas) {
    const clientesCampanha = resultado.porCampanha[campanha];
    const sirlene = clientesCampanha.filter(
      (cliente) => cliente.vendedoraBase === "SIRLENE SCHAFER"
    ).length;
    const marines = clientesCampanha.filter(
      (cliente) => cliente.vendedoraBase === "MARINES BRANT"
    ).length;
    assert.equal(Math.abs(sirlene - marines) <= 1, true);
  }
});

test("configuração por loja não cria grupos nem cotas de vendedoras", () => {
  const contexto = carregarContexto();
  const elementos = [
    ["allowedStores", "CGO, SCR, SRO"],
    ["birthdayStart", "2026-07-14"],
    ["birthdayEnd", "2026-07-21"],
    ["discountLimit", "8"],
    ["inactiveDays", "90"],
    ["recentPurchaseDays", "7"],
    ["finalStore", "SCR"]
  ];

  for (const [id, valor] of elementos) {
    vm.runInContext(`obterElemento("${id}").value = ${JSON.stringify(valor)}`, contexto);
  }

  const configuracao = vm.runInContext("obterConfiguracao()", contexto);

  assert.equal(configuracao.lojaFinal, "SCR");
  assert.equal(configuracao.lojasPermitidas.has("SCR"), true);
  assert.equal("responsaveis" in configuracao, false);
  assert.equal("cotas" in configuracao, false);
});

test("gerador CRM antigo permanece fixo em Santo Cristo com 300 clientes", () => {
  const contexto = carregarContexto();
  vm.runInContext('modoGeradorAtual = "legacy"', contexto);
  const elementos = [
    ["allowedStores", "TUC, DMC"],
    ["birthdayStart", "2026-07-14"],
    ["birthdayEnd", "2026-07-21"],
    ["discountLimit", "8"],
    ["inactiveDays", "90"],
    ["recentPurchaseDays", "7"],
    ["desiredTotal", "25"],
    ["quantityMode", "storeCampaign"],
    ["campaignMode", "specific"]
  ];

  for (const [id, valor] of elementos) {
    vm.runInContext(`obterElemento("${id}").value = ${JSON.stringify(valor)}`, contexto);
  }

  const configuracao = vm.runInContext("obterConfiguracao()", contexto);
  assert.equal(configuracao.modoGerador, "legacy");
  assert.deepEqual([...configuracao.lojasBase], ["CGO", "SCR", "SRO"]);
  assert.equal(configuracao.lojaFinal, "SCR");
  assert.equal(configuracao.totalDesejado, 300);
  assert.equal(configuracao.modoQuantidade, "general");
  assert.equal(configuracao.selecaoCampanhasAtiva, false);
  assert.equal(configuracao.campanhasSelecionadas.size, 5);
});

test("gerador antigo direciona clientes de CGO, SCR e SRO para a base SCR", () => {
  const contexto = carregarContexto();
  const origens = ["CGO", "SCR", "SRO", "CGO", "SCR", "SRO"];
  contexto.clientesTeste = origens.map((loja, indice) => ({
    cpf: String(indice + 1).padStart(11, "0"),
    nome: `Cliente ${indice + 1}`,
    telefones: ["55999999999"],
    loja,
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 120,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  }));
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojasBase: new Set(["CGO", "SCR", "SRO"]),
    lojaFinal: "SCR",
    modoGerador: "legacy",
    totalDesejado: 6,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Inativos"]),
    modoQuantidade: "general"
  };

  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );
  assert.equal(resultado.baseFinal.every((cliente) => cliente.lojaFinal === "SCR"), true);
  assert.equal(resultado.distribuicaoVendedoras["SIRLENE SCHAFER"], 3);
  assert.equal(resultado.distribuicaoVendedoras["MARINES BRANT"], 3);
});

test("reconhece as oito lojas por sigla, número e nome completo", () => {
  const contexto = carregarContexto();
  contexto.lojasTeste = [
    "05-TUC",
    "LOJAS HOJE GUARANI DAS MISSOES",
    "16-DMC",
    "LOJAS HOJE ROQUE GONZALES",
    "10-CMI",
    "LOJAS HOJE CATUIPE",
    "09-SPM",
    "LOJAS HOJE SANTO CRISTO"
  ];

  const codigos = vm.runInContext(
    "lojasTeste.map((loja) => normalizarLoja(loja))",
    contexto
  );

  assert.deepEqual([...codigos], ["TUC", "GMI", "DMC", "RGO", "CMI", "CAT", "SPM", "SCR"]);
});

test("carrega sigla, nome e gerente da loja selecionada", () => {
  const contexto = carregarContexto();
  const elementos = [
    ["allowedStores", "DMC"],
    ["birthdayStart", "2026-07-14"],
    ["birthdayEnd", "2026-07-21"],
    ["discountLimit", "8"],
    ["inactiveDays", "90"],
    ["recentPurchaseDays", "7"],
    ["finalStore", "DMC"],
    ["desiredTotal", "100"],
    ["quantityMode", "general"]
  ];

  for (const [id, valor] of elementos) {
    vm.runInContext(`obterElemento("${id}").value = ${JSON.stringify(valor)}`, contexto);
  }

  const configuracao = vm.runInContext("obterConfiguracao()", contexto);

  assert.equal(configuracao.lojaFinal, "DMC");
  assert.equal(configuracao.lojaFinalSigla, "16-DMC");
  assert.equal(configuracao.lojaFinalNome, "LOJAS HOJE DOUTOR MAURÍCIO CARDOSO");
  assert.equal(configuracao.gerenteFinal, "FRANCIELI DE GODOY RIBEIRO");
});

test("seleção de lojas permite uma, várias ou todas as unidades", () => {
  const contexto = carregarContexto();

  vm.runInContext(`
    for (const codigo of CODIGOS_LOJAS) {
      obterElemento(CAMPOS_LOJAS[codigo]).checked = ["TUC", "DMC", "SCR"].includes(codigo);
    }
    sincronizarSelecaoLojas();
  `, contexto);

  assert.equal(
    vm.runInContext('obterElemento("allowedStores").value', contexto),
    "TUC, DMC, SCR"
  );
  assert.equal(
    vm.runInContext('obterElemento("selectAllStores").indeterminate', contexto),
    true
  );

  vm.runInContext(`
    obterElemento("selectAllStores").checked = true;
    sincronizarSelecaoLojas(true);
  `, contexto);

  assert.equal(
    vm.runInContext('obterElemento("allowedStores").value', contexto),
    "TUC, GMI, DMC, RGO, CMI, CAT, SPM, SCR"
  );
  assert.equal(
    vm.runInContext('obterElemento("selectAllStores").indeterminate', contexto),
    false
  );
});

test("modo específico exige ao menos uma campanha marcada", () => {
  const contexto = carregarContexto();
  const elementos = [
    ["allowedStores", "CGO, SCR, SRO"],
    ["birthdayStart", "2026-07-14"],
    ["birthdayEnd", "2026-07-21"],
    ["discountLimit", "8"],
    ["inactiveDays", "90"],
    ["recentPurchaseDays", "7"],
    ["finalStore", "SCR"],
    ["campaignMode", "specific"]
  ];

  for (const [id, valor] of elementos) {
    vm.runInContext(`obterElemento("${id}").value = ${JSON.stringify(valor)}`, contexto);
  }

  assert.throws(
    () => vm.runInContext("obterConfiguracao()", contexto),
    /Selecione pelo menos uma campanha específica/
  );

  vm.runInContext('obterElemento("campaignInactive").checked = true', contexto);
  const configuracao = vm.runInContext("obterConfiguracao()", contexto);
  assert.equal(configuracao.selecaoCampanhasAtiva, true);
  assert.equal(configuracao.campanhasSelecionadas.has("Inativos"), true);
  assert.equal(configuracao.campanhasSelecionadas.size, 1);
});

test("seleção específica de Inativos gera somente até 300 clientes inativos", () => {
  const contexto = carregarContexto();
  const clientes = Array.from({ length: 340 }, (_, indice) => ({
    cpf: String(indice + 1).padStart(11, "0"),
    nome: `Cliente ${indice + 1}`,
    telefones: ["51999999999"],
    loja: "SCR",
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 120 + indice,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  }));

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojaFinal: "SCR",
    totalDesejado: 300,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Inativos"])
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  assert.equal(resultado.baseFinal.length, 300);
  assert.equal(resultado.porCampanha.Inativos.length, 300);
  assert.equal(resultado.baseFinal.every((cliente) => cliente.campanha === "Inativos"), true);
  assert.deepEqual([...resultado.campanhasAtivas], ["Inativos"]);
  assert.equal(resultado.metasCampanha["Aniversário"], 0);
  assert.equal(resultado.distribuicaoVendedoras["SIRLENE SCHAFER"], 150);
  assert.equal(resultado.distribuicaoVendedoras["MARINES BRANT"], 150);
});

test("seleção específica gera somente os aniversários disponíveis quando há menos de 300", () => {
  const contexto = carregarContexto();
  const clientes = Array.from({ length: 43 }, (_, indice) => ({
    cpf: String(indice + 1).padStart(11, "0"),
    nome: `Aniversariante ${indice + 1}`,
    telefones: ["51999999999"],
    loja: "SCR",
    nascimento: new Date(1990, 7, 5),
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 0,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  }));

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojaFinal: "SCR",
    totalDesejado: 300,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Aniversário"])
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  assert.equal(resultado.baseFinal.length, 43);
  assert.equal(resultado.porCampanha["Aniversário"].length, 43);
  assert.equal(resultado.totalDesejado, 43);
  assert.equal(new Set(resultado.baseFinal.map((cliente) => cliente.cpf)).size, 43);
  assert.equal(resultado.distribuicaoVendedoras["SIRLENE SCHAFER"], 22);
  assert.equal(resultado.distribuicaoVendedoras["MARINES BRANT"], 21);
});

test("quantidade geral personalizada limita a base e mantém a divisão equilibrada", () => {
  const contexto = carregarContexto();
  const clientes = Array.from({ length: 180 }, (_, indice) => ({
    cpf: String(indice + 1).padStart(11, "0"),
    nome: `Cliente ${indice + 1}`,
    telefones: ["51999999999"],
    loja: "SCR",
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 120 + indice,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  }));

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojaFinal: "SCR",
    totalDesejado: 75,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Inativos"]),
    modoQuantidade: "general"
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  assert.equal(resultado.baseFinal.length, 75);
  assert.equal(resultado.totalSolicitado, 75);
  assert.equal(resultado.distribuicaoVendedoras["SIRLENE SCHAFER"], 38);
  assert.equal(resultado.distribuicaoVendedoras["MARINES BRANT"], 37);
});

test("outras lojas atribuem a base à gerente cadastrada", () => {
  const contexto = carregarContexto();
  const clientes = Array.from({ length: 12 }, (_, indice) => ({
    cpf: String(indice + 1).padStart(11, "0"),
    nome: `Cliente ${indice + 1}`,
    telefones: ["55999999999"],
    loja: "DMC",
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 120,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  }));

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojaFinal: "DMC",
    totalDesejado: 10,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Inativos"]),
    modoQuantidade: "general"
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  assert.deepEqual([...resultado.responsaveisBase], ["FRANCIELI DE GODOY RIBEIRO"]);
  assert.equal(resultado.distribuicaoVendedoras["FRANCIELI DE GODOY RIBEIRO"], 10);
  assert.equal(
    resultado.baseFinal.every(
      (cliente) => cliente.vendedoraBase === "FRANCIELI DE GODOY RIBEIRO"
    ),
    true
  );
});

test("seleção múltipla mantém cada cliente na loja-base correspondente à origem", () => {
  const contexto = carregarContexto();
  const clientes = Array.from({ length: 6 }, (_, indice) => ({
    cpf: String(indice + 1).padStart(11, "0"),
    nome: `Cliente ${indice + 1}`,
    telefones: ["55999999999"],
    loja: indice < 3 ? "SCR" : "DMC",
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 120,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  }));

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojasBase: new Set(["SCR", "DMC"]),
    lojaFinal: "MULTI",
    totalDesejado: 6,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Inativos"]),
    modoQuantidade: "general"
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  assert.equal(
    resultado.baseFinal.every((cliente) => cliente.lojaFinal === cliente.loja),
    true
  );
  assert.equal(
    resultado.baseFinal
      .filter((cliente) => cliente.lojaFinal === "DMC")
      .every((cliente) => cliente.vendedoraBase === "FRANCIELI DE GODOY RIBEIRO"),
    true
  );
  assert.equal(resultado.distribuicaoVendedoras["SIRLENE SCHAFER"], 2);
  assert.equal(resultado.distribuicaoVendedoras["MARINES BRANT"], 1);
});

test("quantidades por loja e campanha respeitam cada célula sem repetir CPF", () => {
  const contexto = carregarContexto();
  const clientes = Array.from({ length: 12 }, (_, indice) => ({
    cpf: String(indice + 1).padStart(11, "0"),
    nome: `Cliente ${indice + 1}`,
    telefones: ["55999999999"],
    loja: indice < 6 ? "SCR" : "DMC",
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: 30,
    diasInativo: 120,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0
  }));

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojasBase: new Set(["SCR", "DMC"]),
    lojaFinal: "MULTI",
    totalDesejado: 6,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Promoção", "Inativos"]),
    modoQuantidade: "storeCampaign",
    metasPersonalizadas: {
      "Aniversário": 0,
      "Próxima Compra": 0,
      "Promoção": 3,
      "Novidade": 0,
      "Inativos": 3
    },
    metasPorLojaCampanha: {
      SCR: { "Aniversário": 0, "Próxima Compra": 0, "Promoção": 2, "Novidade": 0, "Inativos": 1 },
      DMC: { "Aniversário": 0, "Próxima Compra": 0, "Promoção": 1, "Novidade": 0, "Inativos": 2 }
    }
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  const contar = (loja, campanha) => resultado.baseFinal.filter(
    (cliente) => cliente.lojaFinal === loja && cliente.campanha === campanha
  ).length;
  assert.equal(contar("SCR", "Promoção"), 2);
  assert.equal(contar("SCR", "Inativos"), 1);
  assert.equal(contar("DMC", "Promoção"), 1);
  assert.equal(contar("DMC", "Inativos"), 2);
  assert.equal(new Set(resultado.baseFinal.map((cliente) => cliente.cpf)).size, 6);
  assert.equal(resultado.modoQuantidade, "storeCampaign");
});

test("quantidades por campanha são respeitadas sem redistribuir para outra campanha", () => {
  const contexto = carregarContexto();
  let sequencia = 1;
  const criarCliente = (dados) => ({
    cpf: String(sequencia++).padStart(11, "0"),
    nome: "Cliente",
    telefones: ["51999999999"],
    loja: "SCR",
    nascimento: null,
    dataUltimaCompra: new Date(2026, 0, 1),
    valorUltimaCompra: 100,
    valorTotal: 100,
    percentualDesconto: null,
    diasInativo: 0,
    proximaCompra: false,
    previsaoNoPeriodo: false,
    previsaoExataNoPeriodo: false,
    historicoProprio: false,
    confiancaPrevisao: 0,
    regularidadeCompras: 0,
    ciclosProjetados: 0,
    distanciaPeriodo: 0,
    ...dados
  });
  const clientes = [
    ...Array.from({ length: 80 }, () => criarCliente({ percentualDesconto: 30 })),
    ...Array.from({ length: 100 }, () => criarCliente({ diasInativo: 120 }))
  ];

  contexto.clientesTeste = clientes;
  contexto.configuracaoTeste = {
    inicioAcao: new Date(2026, 7, 3),
    fimAcao: new Date(2026, 7, 10),
    limiteDesconto: 20,
    diasInatividade: 90,
    lojaFinal: "SCR",
    totalDesejado: 110,
    selecaoCampanhasAtiva: true,
    campanhasSelecionadas: new Set(["Promoção", "Inativos"]),
    modoQuantidade: "campaign",
    metasPersonalizadas: {
      "Aniversário": 0,
      "Próxima Compra": 0,
      "Promoção": 40,
      "Novidade": 0,
      "Inativos": 70
    }
  };
  const resultado = vm.runInContext(
    "selecionarCampanhas(clientesTeste, configuracaoTeste)",
    contexto
  );

  assert.equal(resultado.baseFinal.length, 110);
  assert.equal(resultado.porCampanha["Promoção"].length, 40);
  assert.equal(resultado.porCampanha.Inativos.length, 70);
  assert.equal(resultado.distribuicaoVendedoras["SIRLENE SCHAFER"], 55);
  assert.equal(resultado.distribuicaoVendedoras["MARINES BRANT"], 55);
});

test("configuração aceita quantidades individuais e soma somente campanhas ativas", () => {
  const contexto = carregarContexto();
  const valores = [
    ["allowedStores", "CGO, SCR, SRO"],
    ["birthdayStart", "2026-07-14"],
    ["birthdayEnd", "2026-07-21"],
    ["discountLimit", "8"],
    ["inactiveDays", "90"],
    ["recentPurchaseDays", "7"],
    ["finalStore", "SCR"],
    ["campaignMode", "specific"],
    ["quantityMode", "campaign"],
    ["quantityPromotion", "35"],
    ["quantityInactive", "85"]
  ];

  for (const [id, valor] of valores) {
    vm.runInContext(`obterElemento("${id}").value = ${JSON.stringify(valor)}`, contexto);
  }
  vm.runInContext('obterElemento("campaignPromotion").checked = true', contexto);
  vm.runInContext('obterElemento("campaignInactive").checked = true', contexto);

  const configuracao = vm.runInContext("obterConfiguracao()", contexto);

  assert.equal(configuracao.totalDesejado, 120);
  assert.equal(configuracao.metasPersonalizadas["Promoção"], 35);
  assert.equal(configuracao.metasPersonalizadas.Inativos, 85);
  assert.deepEqual([...configuracao.campanhasSelecionadas], ["Promoção", "Inativos"]);
});

test("aba de controle combina CPF com a vendedora atribuída", () => {
  const contexto = carregarContexto();
  contexto.clientesTeste = [
    { cpf: "89998332087", vendedoraBase: "SIRLENE SCHAFER" },
    { cpf: "01167355032", vendedoraBase: "MARINES BRANT" }
  ];
  contexto.dataTeste = new Date(2026, 9, 22);

  const resultado = vm.runInContext(
    "montarLinhasCpfsDaBase(clientesTeste, dataTeste)",
    contexto
  );

  assert.equal(resultado.cabecalho, "22/out");
  assert.equal(resultado.valores[1][0], "899.983.320-87 - SIRLENE SCHAFER");
  assert.equal(resultado.valores[2][0], "011.673.550-32 - MARINES BRANT");
});

test("localiza automaticamente uma aba com registros na Base 600", () => {
  const contexto = carregarContexto();
  const XLSX = {
    utils: {
      decode_range(referencia) {
        return referencia === "A1:A1"
          ? { s: { r: 0 }, e: { r: 0 } }
          : { s: { r: 0 }, e: { r: 2 } };
      },
      sheet_to_json(planilha) {
        return planilha.registros;
      }
    }
  };

  contexto.XLSX = XLSX;
  contexto.window.XLSX = XLSX;
  contexto.arquivoTeste = {
    nomesAbas: ["Capa", "600 17_08"],
    pastaTrabalho: {
      Sheets: {
        Capa: { "!ref": "A1:A1", registros: [] },
        "600 17_08": {
          "!ref": "A1:C3",
          registros: [
            { CPF: "89998332087", "Data Compra": "17/08/2026", "Valor da Venda": 45 },
            { CPF: "01167355032", "Data Compra": "16/08/2026", "Valor da Venda": 90 }
          ]
        }
      }
    }
  };

  const registros = vm.runInContext(`
    estado.arquivos["600"] = arquivoTeste;
    obterElemento("sheet600").value = "";
    obterRegistros("600");
  `, contexto);

  assert.equal(registros.length, 2);
  assert.equal(
    vm.runInContext('obterElemento("sheet600").value', contexto),
    "600 17_08"
  );
  assert.equal(
    vm.runInContext('estado.arquivos["600"].abaSelecionada', contexto),
    "600 17_08"
  );
});

test("leitor otimizado envia somente os campos necessários da Base 600", () => {
  const mensagens = [];
  const planilha = {
    "!ref": "A1:E3",
    linhas: [
      ["CPF", "Produto", "Data Compra", "Valor da Venda", "Desconto Produto"],
      ["89998332087", "Produto A", 46200, 45, 5],
      ["01167355032", "Produto B", 46201, 90, 10]
    ]
  };
  const XLSX = {
    read() {
      return {
        SheetNames: ["600 17_08"],
        Sheets: { "600 17_08": planilha }
      };
    },
    utils: {
      decode_range() {
        return { s: { r: 0, c: 0 }, e: { r: 2, c: 4 } };
      },
      sheet_to_json(aba, opcoes) {
        const linhas = aba.linhas
          .slice(opcoes.range.s.r, opcoes.range.e.r + 1)
          .map((linha) => linha.slice(opcoes.range.s.c, opcoes.range.e.c + 1));

        return opcoes.blankrows === false
          ? linhas.filter((linha) => linha.some((valor) => valor !== ""))
          : linhas;
      }
    }
  };
  const self = {
    postMessage(mensagem) {
      mensagens.push(mensagem);
    }
  };
  const contexto = vm.createContext({
    XLSX,
    self,
    importScripts() {},
    console
  });

  vm.runInContext(readFileSync("crm-xlsx-worker.js", "utf8"), contexto);
  contexto.self.onmessage({ data: { buffer: new ArrayBuffer(0) } });

  const lote = mensagens.find((mensagem) => mensagem.tipo === "lote");
  const concluido = mensagens.find((mensagem) => mensagem.tipo === "concluido");

  assert.equal(JSON.stringify(lote.linhas), JSON.stringify([
    ["89998332087", 46200, 45, 5],
    ["01167355032", 46201, 90, 10]
  ]));
  assert.equal(concluido.nomeAba, "600 17_08");
  assert.equal(concluido.quantidade, 2);
});
