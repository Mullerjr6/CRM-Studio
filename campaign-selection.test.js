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
    responsaveis: ["Patrícia", "Sirlene", "Marines"],
    cotas: [25, 25, 10],
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
  assert.deepEqual(
    ["Patrícia", "Sirlene", "Marines"].map((responsavel) => (
      resultado.baseFinal.filter((cliente) => cliente.responsavel === responsavel).length
    )),
    [125, 125, 50]
  );
});
