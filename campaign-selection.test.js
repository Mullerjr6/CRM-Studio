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
