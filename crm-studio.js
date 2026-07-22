"use strict";

// Configuração geral

const CAMPANHAS = [
  "Aniversário",
  "Próxima Compra",
  "Promoção",
  "Novidade",
  "Inativos"
];

const LIMITE_POR_CAMPANHA = 60;
const TOTAL_GERAL = 300;
const RESPONSAVEIS = ["Patrícia", "Sirlene", "Marines"];
const COTAS_RESPONSAVEIS = [25, 25, 10];
const LIMITE_INTERVALOS_RECENTES = 6;
const LIMITE_CICLOS_HISTORICO = 3;
const LIMITE_CICLOS_MEDIANA = 1;
const ANO_INICIAL_BASE = 2023;

const estado = {
  arquivos: {},
  resultado: null,
  logs: []
};

const CAMPOS = {
  cpf: ["cpf", "cpfcliente", "documento", "cnpjcpf"],
  nome: ["nome", "nomecliente", "cliente", "razaosocial"],
  loja: ["loja", "filial", "lojaoriginal", "empresa"],
  nascimento: ["datanascimento", "nascimento", "dtnascimento"],
  dataCompra: ["datacompra", "datavenda", "dataemissao", "data", "dtvenda"],
  valorCompra: ["valorvenda", "valordavenda", "valortotal", "valorcompra", "total", "valor"],
  desconto: ["desconto", "descontoproduto", "valordesconto", "descontototal"]
};

// Funções de apoio

const obterElemento = (id) => document.getElementById(id);
const esperar = (tempo) => new Promise((resolver) => setTimeout(resolver, tempo));
const limparTexto = (valor) => String(valor ?? "").trim();

const criarChave = (valor) => limparTexto(valor)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .split(/\s+/)
  .filter((palavra) => palavra && !["de", "da", "do", "das", "dos"].includes(palavra))
  .join("");

const normalizarCpf = (valor) => {
  const numeros = limparTexto(valor).replace(/\D/g, "");
  return numeros.length >= 9 && numeros.length <= 11
    ? numeros.padStart(11, "0")
    : "";
};

const normalizarTelefone = (valor) => {
  const numeros = limparTexto(valor).replace(/\D/g, "");
  return numeros.length >= 8 && numeros.length <= 13 ? numeros : "";
};

const formatarCpf = (valor) => normalizarCpf(valor)
  .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

const formatarTelefone = (valor) => {
  const numeros = normalizarTelefone(valor).replace(/^55(?=\d{10,11}$)/, "");

  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  if (numeros.length === 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  if (numeros.length === 9) {
    return `${numeros.slice(0, 5)}-${numeros.slice(5)}`;
  }

  if (numeros.length === 8) {
    return `${numeros.slice(0, 4)}-${numeros.slice(4)}`;
  }

  return numeros;
};

function criarDataValida(ano, mes, dia) {
  if (![ano, mes, dia].every(Number.isInteger)) {
    return null;
  }

  const data = new Date(ano, mes - 1, dia);
  const componentesCorretos = data.getFullYear() === ano
    && data.getMonth() === mes - 1
    && data.getDate() === dia;

  return componentesCorretos ? data : null;
}

function interpretarData(valor) {
  if (valor instanceof Date && !isNaN(valor)) {
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }

  if (typeof valor === "number" && window.XLSX) {
    const dataExcel = XLSX.SSF.parse_date_code(valor);
    return dataExcel
      ? criarDataValida(dataExcel.y, dataExcel.m, dataExcel.d)
      : null;
  }

  const texto = limparTexto(valor);
  let partes = texto.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/
  );

  if (partes) {
    let ano = Number(partes[3]);

    if (ano < 100) {
      ano += 2000;
    }

    return criarDataValida(ano, Number(partes[2]), Number(partes[1]));
  }

  partes = texto.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/
  );

  if (partes) {
    return criarDataValida(
      Number(partes[1]),
      Number(partes[2]),
      Number(partes[3])
    );
  }

  const data = new Date(texto);
  return isNaN(data) ? null : data;
}

const formatarData = (data) => data
  ? new Intl.DateTimeFormat("pt-BR").format(data)
  : "";

const converterDataParaExcel = (data) => data
  ? Math.round(Date.UTC(
    data.getFullYear(),
    data.getMonth(),
    data.getDate()
  ) / 864e5 + 25569)
  : null;

const calcularDiferencaDias = (dataFinal, dataInicial) => Math.round(
  (dataFinal - dataInicial) / 864e5
);

const adicionarDias = (data, quantidade) => new Date(
  data.getFullYear(),
  data.getMonth(),
  data.getDate() + Math.round(quantidade)
);

const limitarNumero = (valor, minimo, maximo) => Math.min(
  maximo,
  Math.max(minimo, valor)
);

const estaNoPeriodo = (data, inicio, fim) => Boolean(
  data && data >= inicio && data <= fim
);

function calcularQuantil(valores, proporcao) {
  if (!valores.length) {
    return null;
  }

  const ordenados = [...valores].sort((primeiro, segundo) => primeiro - segundo);
  const posicao = (ordenados.length - 1) * proporcao;
  const indiceInferior = Math.floor(posicao);
  const indiceSuperior = Math.ceil(posicao);

  if (indiceInferior === indiceSuperior) {
    return ordenados[indiceInferior];
  }

  const fracao = posicao - indiceInferior;
  return ordenados[indiceInferior]
    + (ordenados[indiceSuperior] - ordenados[indiceInferior]) * fracao;
}

const calcularMediana = (valores) => calcularQuantil(valores, 0.5);

function calcularMediaPonderadaRecente(valores) {
  if (!valores.length) {
    return null;
  }

  let somaValores = 0;
  let somaPesos = 0;

  valores.forEach((valor, indice) => {
    const peso = indice + 1;
    somaValores += valor * peso;
    somaPesos += peso;
  });

  return somaValores / somaPesos;
}

function retirarIntervalosAtipicos(intervalos) {
  if (intervalos.length < 4) {
    return [...intervalos];
  }

  const primeiroQuartil = calcularQuantil(intervalos, 0.25);
  const terceiroQuartil = calcularQuantil(intervalos, 0.75);
  const amplitude = terceiroQuartil - primeiroQuartil;
  const limiteInferior = primeiroQuartil - 1.5 * amplitude;
  const limiteSuperior = terceiroQuartil + 1.5 * amplitude;
  const intervalosValidos = intervalos.filter(
    (intervalo) => intervalo >= limiteInferior && intervalo <= limiteSuperior
  );

  return intervalosValidos.length ? intervalosValidos : [...intervalos];
}

function resumirIntervalos(intervalos) {
  const recentes = intervalos.slice(-LIMITE_INTERVALOS_RECENTES);
  const considerados = retirarIntervalosAtipicos(recentes);

  if (!considerados.length) {
    return null;
  }

  const mediana = calcularMediana(considerados);
  const mediaPonderada = calcularMediaPonderadaRecente(considerados);
  const estimativa = mediana * 0.6 + mediaPonderada * 0.4;
  const desvios = considerados.map((intervalo) => Math.abs(intervalo - mediana));
  const desvioAbsolutoMediano = calcularMediana(desvios) || 0;
  const margem = limitarNumero(
    Math.ceil(Math.max(3, 1.4826 * desvioAbsolutoMediano)),
    3,
    30
  );
  const regularidade = limitarNumero(
    1 - desvioAbsolutoMediano / Math.max(estimativa, 1),
    0,
    1
  );

  return {
    intervalosRecentes: recentes,
    intervalosConsiderados: considerados,
    mediana,
    mediaPonderada,
    estimativa,
    desvioAbsolutoMediano,
    margem,
    regularidade
  };
}

function resumirGrupoIntervalos(valores) {
  if (!valores.length) {
    return null;
  }

  const mediana = calcularMediana(valores);
  const desvios = valores.map((valor) => Math.abs(valor - mediana));
  const desvioAbsolutoMediano = calcularMediana(desvios) || 0;

  return {
    estimativa: mediana,
    desvioAbsolutoMediano,
    margem: limitarNumero(
      Math.ceil(Math.max(3, 1.4826 * desvioAbsolutoMediano)),
      3,
      30
    ),
    regularidade: limitarNumero(
      1 - desvioAbsolutoMediano / Math.max(mediana, 1),
      0,
      1
    )
  };
}

function converterNumero(valor) {
  if (typeof valor === "number") {
    return isFinite(valor) ? valor : 0;
  }

  let texto = limparTexto(valor).replace(/R\$|\s/g, "");

  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  return Number(texto) || 0;
}

function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caractere]);
}

// Leitura e preparação dos arquivos

function lerTextoDelimitado(texto) {
  const linhas = limparTexto(texto).split(/\r?\n/).filter(Boolean);

  if (!linhas.length) {
    return [];
  }

  const separador = ["\t", ";", ","].sort(
    (primeiro, segundo) => linhas[0].split(segundo).length - linhas[0].split(primeiro).length
  )[0];

  const registros = linhas.map((linha) => linha.split(separador).map(limparTexto));
  const cabecalhos = registros.shift();

  return registros.map((registro) => Object.fromEntries(
    cabecalhos.map((cabecalho, indice) => [cabecalho, registro[indice] ?? ""])
  ));
}

function criarMapaCabecalhos(registro) {
  const camposNormalizados = {};

  for (const [cabecalho, valor] of Object.entries(registro)) {
    camposNormalizados[criarChave(cabecalho)] = valor;
  }

  return camposNormalizados;
}

function buscarCampo(registro, nomesAceitos) {
  for (const nome of nomesAceitos) {
    const valor = registro[criarChave(nome)];

    if (valor !== undefined && limparTexto(valor) !== "") {
      return valor;
    }
  }

  return "";
}

function normalizarLoja(valor) {
  const texto = limparTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  for (const codigo of ["ALE", "CGO", "SCR", "SRO"]) {
    const corresponde = new RegExp(`(^|[^A-Z0-9])${codigo}($|[^A-Z0-9])`).test(texto);

    if (corresponde) {
      return codigo;
    }
  }

  return texto;
}

function ehCabecalhoTelefone(cabecalho) {
  const nome = criarChave(cabecalho);

  return nome.startsWith("tel")
    || nome.includes("telefone")
    || nome.includes("fone")
    || nome.includes("celular")
    || nome.includes("whats")
    || nome.includes("contato")
    || nome === "numero1"
    || nome === "numero2";
}

function extrairTelefones(registroOriginal) {
  const encontrados = [];

  for (const [cabecalho, valor] of Object.entries(registroOriginal)) {
    if (!ehCabecalhoTelefone(cabecalho)) {
      continue;
    }

    const candidatos = limparTexto(valor).split(/[|;/,]+/);

    for (const candidato of candidatos) {
      const telefone = normalizarTelefone(candidato);

      if (telefone && !encontrados.includes(telefone)) {
        encontrados.push(telefone);
      }
    }
  }

  return encontrados.slice(0, 2);
}

function extrairCpfsBloqueados(registros) {
  const bloqueados = new Set();

  for (const registro of registros) {
    for (const valor of Object.values(registro)) {
      const cpf = normalizarCpf(valor);

      if (cpf) {
        bloqueados.add(cpf);
      }
    }
  }

  return bloqueados;
}

function possuiCampo(cabecalhos, nomesAceitos) {
  return nomesAceitos.some((nome) => cabecalhos.includes(criarChave(nome)));
}

function validarCabecalhos(registros, tipoBase) {
  if (!registros.length) {
    throw new Error(`${tipoBase}: nenhum registro encontrado.`);
  }

  if (tipoBase === "CPFs utilizados") {
    if (!extrairCpfsBloqueados(registros).size) {
      throw new Error("Arquivo de CPFs utilizados: nenhum CPF válido foi encontrado.");
    }

    return;
  }

  const cabecalhosOriginais = Object.keys(registros[0]);
  const cabecalhos = cabecalhosOriginais.map(criarChave);
  const camposObrigatorios = tipoBase === "Base 70"
    ? [
      ["CPF", CAMPOS.cpf],
      ["Nome", CAMPOS.nome],
      ["Loja", CAMPOS.loja]
    ]
    : [
      ["CPF", CAMPOS.cpf],
      ["Data da compra", CAMPOS.dataCompra],
      ["Valor da venda", CAMPOS.valorCompra]
    ];

  const camposAusentes = camposObrigatorios
    .filter(([, nomesAceitos]) => !possuiCampo(cabecalhos, nomesAceitos))
    .map(([nome]) => nome);

  if (tipoBase === "Base 70" && !cabecalhosOriginais.some(ehCabecalhoTelefone)) {
    camposAusentes.push("Telefone");
  }

  if (camposAusentes.length) {
    const encontrados = cabecalhosOriginais.slice(0, 12).join(", ") || "nenhum";

    throw new Error(
      `${tipoBase}: coluna(s) ausente(s): ${camposAusentes.join(", ")}. `
      + `Cabeçalhos encontrados: ${encontrados}.`
    );
  }
}

async function lerArquivo(arquivo) {
  const extensao = arquivo.name.split(".").pop().toLowerCase();

  if (["xlsx", "xls"].includes(extensao)) {
    if (!window.XLSX) {
      throw new Error("Leitor Excel indisponível. Verifique a internet ou use CSV.");
    }

    const pastaTrabalho = XLSX.read(await arquivo.arrayBuffer(), {
      type: "array",
      cellDates: true
    });

    return {
      pastaTrabalho,
      nomesAbas: pastaTrabalho.SheetNames
    };
  }

  return { texto: await arquivo.text() };
}

function obterLinhasPlanilha(pastaTrabalho, nomeAba) {
  return XLSX.utils.sheet_to_json(pastaTrabalho.Sheets[nomeAba], {
    defval: "",
    raw: true
  });
}

async function carregarFonte(tipo, arquivo) {
  const sufixo = tipo === "70" ? "70" : tipo === "600" ? "600" : "Used";
  const informacao = obterElemento(`info${sufixo}`);
  const seletorAba = obterElemento(`sheet${sufixo}`);
  const campoTexto = obterElemento(`txt${sufixo}`);

  try {
    informacao.textContent = `Lendo ${arquivo.name}...`;

    const dados = await lerArquivo(arquivo);
    estado.arquivos[tipo] = dados;

    if (dados.pastaTrabalho) {
      seletorAba.innerHTML = dados.nomesAbas
        .map((nome) => `<option>${escaparHtml(nome)}</option>`)
        .join("");

      seletorAba.classList.toggle("hidden", dados.nomesAbas.length < 2);
      campoTexto.value = "";
    } else {
      campoTexto.value = dados.texto;
      seletorAba.classList.add("hidden");
    }

    informacao.textContent = `✓ ${arquivo.name}`;
    informacao.closest(".upload-card").classList.add("ready");
  } catch (erro) {
    mostrarErro(erro.message);
    informacao.textContent = "Falha na leitura";
  }
}

function obterRegistros(tipo) {
  const sufixo = tipo === "70" ? "70" : tipo === "600" ? "600" : "Used";
  const arquivo = estado.arquivos[tipo];

  if (arquivo?.pastaTrabalho) {
    return obterLinhasPlanilha(
      arquivo.pastaTrabalho,
      obterElemento(`sheet${sufixo}`).value
    );
  }

  return lerTextoDelimitado(obterElemento(`txt${sufixo}`).value);
}

// Regras de seleção das campanhas

function obterConfiguracao() {
  const lojasPermitidas = new Set(
    obterElemento("allowedStores").value
      .split(/[,;]/)
      .map(normalizarLoja)
      .filter(Boolean)
  );

  if (!lojasPermitidas.size) {
    throw new Error("Informe pelo menos uma loja permitida.");
  }

  const inicioAcao = interpretarData(obterElemento("birthdayStart").value);
  const fimAcao = interpretarData(obterElemento("birthdayEnd").value);
  const textoLimiteDesconto = limparTexto(obterElemento("discountLimit").value);
  const textoDiasInatividade = limparTexto(obterElemento("inactiveDays").value);
  const limiteDesconto = Number(textoLimiteDesconto);
  const diasInatividade = Number(textoDiasInatividade);
  const lojaFinal = normalizarLoja(obterElemento("finalStore").value);

  const configuracao = {
    inicioAcao,
    fimAcao,
    dataCorteHistorico: inicioAcao ? adicionarDias(inicioAcao, -1) : null,
    limiteDesconto,
    diasInatividade,
    lojasPermitidas,
    lojaFinal,
    dataMinimaBase: new Date(ANO_INICIAL_BASE, 0, 1),
    totalDesejado: TOTAL_GERAL,
    limitePorCampanha: LIMITE_POR_CAMPANHA,
    cotas: [...COTAS_RESPONSAVEIS],
    responsaveis: [...RESPONSAVEIS]
  };

  const periodoInvalido = !inicioAcao || !fimAcao || inicioAcao > fimAcao;

  if (periodoInvalido) {
    throw new Error("Confira as datas de início e fim do período de ação.");
  }

  if (!textoLimiteDesconto
    || !Number.isFinite(limiteDesconto)
    || limiteDesconto < 0
    || limiteDesconto > 100) {
    throw new Error("O limite de desconto deve ser um número entre 0 e 100.");
  }

  if (!textoDiasInatividade
    || !Number.isInteger(diasInatividade)
    || diasInatividade < 1) {
    throw new Error("A inatividade mínima deve ser informada em dias inteiros, a partir de 1.");
  }

  if (!lojaFinal) {
    throw new Error("Informe a loja final da campanha.");
  }

  return configuracao;
}

function aniversarioNoPeriodo(dataNascimento, configuracao) {
  if (!dataNascimento) {
    return false;
  }

  for (
    let ano = configuracao.inicioAcao.getFullYear();
    ano <= configuracao.fimAcao.getFullYear();
    ano++
  ) {
    const aniversario = new Date(
      ano,
      dataNascimento.getMonth(),
      dataNascimento.getDate()
    );

    const dataExisteNoAno = aniversario.getMonth() === dataNascimento.getMonth()
      && aniversario.getDate() === dataNascimento.getDate();

    if (dataExisteNoAno && estaNoPeriodo(
      aniversario,
      configuracao.inicioAcao,
      configuracao.fimAcao
    )) {
      return true;
    }
  }

  return false;
}

function calcularDistanciaDoPeriodo(data, inicio, fim) {
  if (data < inicio) {
    return calcularDiferencaDias(inicio, data);
  }

  if (data > fim) {
    return calcularDiferencaDias(data, fim);
  }

  return 0;
}

function projetarProximaCompra(cliente, resumo, origem, confianca, configuracao) {
  const intervalo = resumo?.estimativa;

  if (!cliente.dataUltimaCompra || !intervalo || intervalo <= 0) {
    return null;
  }

  const diasAteInicio = calcularDiferencaDias(
    configuracao.inicioAcao,
    cliente.dataUltimaCompra
  );

  let ciclosProjetados = Math.max(
    1,
    Math.ceil((diasAteInicio - resumo.margem) / intervalo)
  );

  let dataPrevista = adicionarDias(
    cliente.dataUltimaCompra,
    intervalo * ciclosProjetados
  );

  // O arredondamento das datas pode deixar a faixa um dia antes da janela.
  while (
    adicionarDias(dataPrevista, resumo.margem) < configuracao.inicioAcao
    && ciclosProjetados < 10000
  ) {
    ciclosProjetados++;
    dataPrevista = adicionarDias(
      cliente.dataUltimaCompra,
      intervalo * ciclosProjetados
    );
  }

  const limiteCiclos = origem === "Histórico próprio"
    ? LIMITE_CICLOS_HISTORICO
    : LIMITE_CICLOS_MEDIANA;

  // Evita tratar como recorrente quem já deixou passar vários ciclos esperados.
  if (ciclosProjetados > limiteCiclos) {
    return null;
  }

  const inicioFaixa = adicionarDias(dataPrevista, -resumo.margem);
  const fimFaixa = adicionarDias(dataPrevista, resumo.margem);
  const previsaoExataNoPeriodo = estaNoPeriodo(
    dataPrevista,
    configuracao.inicioAcao,
    configuracao.fimAcao
  );
  const faixaAlcancaPeriodo = fimFaixa >= configuracao.inicioAcao
    && inicioFaixa <= configuracao.fimAcao;

  return {
    intervaloPrevisto: intervalo,
    margemPrevisao: resumo.margem,
    regularidadeCompras: resumo.regularidade,
    confiancaPrevisao: confianca,
    origemPrevisao: origem,
    historicoProprio: origem === "Histórico próprio",
    ciclosProjetados,
    proximaCompra: dataPrevista,
    inicioFaixaPrevisao: inicioFaixa,
    fimFaixaPrevisao: fimFaixa,
    previsaoExataNoPeriodo,
    previsaoNoPeriodo: faixaAlcancaPeriodo,
    distanciaPeriodo: calcularDistanciaDoPeriodo(
      dataPrevista,
      configuracao.inicioAcao,
      configuracao.fimAcao
    )
  };
}

function montarClientes(base70, vendas, bloqueados, configuracao, estatisticas) {
  const clientes = new Map();
  const historico = new Map();

  // Primeiro ficam apenas os clientes que podem entrar na seleção.

  for (const registroOriginal of base70) {
    const registro = criarMapaCabecalhos(registroOriginal);
    const cpf = normalizarCpf(buscarCampo(registro, CAMPOS.cpf));

    if (!cpf) {
      estatisticas.semCpf++;
      continue;
    }

    const telefones = extrairTelefones(registroOriginal);
    const loja = normalizarLoja(buscarCampo(registro, CAMPOS.loja));

    if (!telefones.length) {
      estatisticas.semTelefone++;
      continue;
    }

    if (!configuracao.lojasPermitidas.has(loja) || loja === "ALE") {
      estatisticas.lojaInvalida++;
      continue;
    }

    if (bloqueados.has(cpf)) {
      estatisticas.bloqueados++;
      continue;
    }

    if (!clientes.has(cpf)) {
      clientes.set(cpf, {
        cpf,
        nome: limparTexto(buscarCampo(registro, CAMPOS.nome)),
        telefones,
        loja,
        nascimento: interpretarData(buscarCampo(registro, CAMPOS.nascimento))
      });
    } else {
      estatisticas.duplicados++;
    }
  }

  // Depois as vendas são agrupadas por CPF.
  for (const registroOriginal of vendas) {
    const registro = criarMapaCabecalhos(registroOriginal);
    const cpf = normalizarCpf(buscarCampo(registro, CAMPOS.cpf));

    if (!cpf) {
      continue;
    }

    const data = interpretarData(buscarCampo(registro, CAMPOS.dataCompra));

    if (!data) {
      continue;
    }

    const compra = {
      data,
      valor: converterNumero(buscarCampo(registro, CAMPOS.valorCompra)),
      desconto: converterNumero(buscarCampo(registro, CAMPOS.desconto))
    };

    if (!historico.has(cpf)) {
      historico.set(cpf, []);
    }

    historico.get(cpf).push(compra);
  }

  // Consolida compras do mesmo dia e prepara os intervalos individuais.
  for (const cliente of clientes.values()) {
    const comprasOriginais = (historico.get(cliente.cpf) || [])
      .filter((compra) => compra.data <= configuracao.dataCorteHistorico)
      .sort((primeira, segunda) => primeira.data - segunda.data);

    const comprasPorDia = new Map();

    for (const compra of comprasOriginais) {
      const chaveDia = [
        compra.data.getFullYear(),
        String(compra.data.getMonth() + 1).padStart(2, "0"),
        String(compra.data.getDate()).padStart(2, "0")
      ].join("-");

      const consolidada = comprasPorDia.get(chaveDia) || {
        data: compra.data,
        valor: 0,
        desconto: 0
      };

      consolidada.valor += compra.valor;
      consolidada.desconto += compra.desconto;
      comprasPorDia.set(chaveDia, consolidada);
    }

    const compras = [...comprasPorDia.values()]
      .sort((primeira, segunda) => primeira.data - segunda.data);

    const ultimaCompra = compras.at(-1);
    const comprasRecentes = compras.filter((compra) => {
      const diferenca = calcularDiferencaDias(
        configuracao.dataCorteHistorico,
        compra.data
      );

      return diferenca <= 365 && diferenca >= 0;
    });

    const intervalos = [];

    for (let indice = 1; indice < compras.length; indice++) {
      const intervalo = calcularDiferencaDias(
        compras[indice].data,
        compras[indice - 1].data
      );

      if (intervalo > 0) {
        intervalos.push(intervalo);
      }
    }

    const intervaloMedio = intervalos.length
      ? intervalos.reduce((total, intervalo) => total + intervalo, 0) / intervalos.length
      : null;

    const resumoIntervalos = resumirIntervalos(intervalos);

    const valorTotal = compras.reduce((total, compra) => total + compra.valor, 0);
    const descontoTotal = compras.reduce((total, compra) => total + compra.desconto, 0);

    Object.assign(cliente, {
      compras,
      dataUltimaCompra: ultimaCompra?.data || null,
      valorUltimaCompra: ultimaCompra?.valor || 0,
      quantidadeCompras: compras.length,
      quantidadeComprasRecentes: comprasRecentes.length,
      intervalosCompras: intervalos,
      resumoIntervalos,
      intervaloMedio,
      intervaloPrevisto: null,
      margemPrevisao: null,
      regularidadeCompras: null,
      confiancaPrevisao: null,
      origemPrevisao: "",
      historicoProprio: false,
      ciclosProjetados: null,
      proximaCompra: null,
      inicioFaixaPrevisao: null,
      fimFaixaPrevisao: null,
      previsaoExataNoPeriodo: false,
      previsaoNoPeriodo: false,
      distanciaPeriodo: null,
      valorTotal,
      descontoTotal,
      percentualDesconto: valorTotal > 0 ? descontoTotal / valorTotal * 100 : null,
      diasInativo: ultimaCompra
        ? calcularDiferencaDias(configuracao.dataCorteHistorico, ultimaCompra.data)
        : null
    });
  }

  // A base operacional começa em 2023, considerando a última compra do cliente.
  for (const [cpf, cliente] of clientes) {
    if (!cliente.dataUltimaCompra) {
      estatisticas.semCompraValida++;
      clientes.delete(cpf);
      continue;
    }

    if (cliente.dataUltimaCompra < configuracao.dataMinimaBase) {
      estatisticas.ultimaCompraAntesDe2023++;
      clientes.delete(cpf);
    }
  }

  // A mediana de cada loja atende clientes que ainda possuem uma única compra.
  const estimativasGlobais = [];
  const estimativasPorLoja = new Map();

  for (const cliente of clientes.values()) {
    if (!cliente.resumoIntervalos) {
      continue;
    }

    estimativasGlobais.push(cliente.resumoIntervalos.estimativa);

    if (!estimativasPorLoja.has(cliente.loja)) {
      estimativasPorLoja.set(cliente.loja, []);
    }

    estimativasPorLoja.get(cliente.loja).push(cliente.resumoIntervalos.estimativa);
  }

  const resumoGlobal = resumirGrupoIntervalos(estimativasGlobais);
  const resumosPorLoja = new Map(
    [...estimativasPorLoja.entries()].map(([loja, valores]) => [
      loja,
      resumirGrupoIntervalos(valores)
    ])
  );

  for (const cliente of clientes.values()) {
    let resumoPrevisao = null;
    let origemPrevisao = "";
    let confiancaPrevisao = null;

    if (cliente.quantidadeCompras >= 2 && cliente.resumoIntervalos) {
      resumoPrevisao = cliente.resumoIntervalos;
      origemPrevisao = "Histórico próprio";
      confiancaPrevisao = limitarNumero(
        0.5 + cliente.resumoIntervalos.intervalosConsiderados.length * 0.08,
        0,
        0.98
      );
    } else if (cliente.quantidadeCompras === 1) {
      const resumoLoja = resumosPorLoja.get(cliente.loja);

      if (resumoLoja) {
        resumoPrevisao = resumoLoja;
        origemPrevisao = "Mediana da loja";
        confiancaPrevisao = 0.3;
      } else if (resumoGlobal) {
        resumoPrevisao = resumoGlobal;
        origemPrevisao = "Mediana geral";
        confiancaPrevisao = 0.2;
      }
    }

    const previsao = projetarProximaCompra(
      cliente,
      resumoPrevisao,
      origemPrevisao,
      confiancaPrevisao,
      configuracao
    );

    if (previsao) {
      Object.assign(cliente, previsao);
    }
  }

  estatisticas.validos = clientes.size;
  return [...clientes.values()];
}

function calcularMetasCampanhas(quantidadeCandidatos) {
  const metas = Object.fromEntries(
    CAMPANHAS.map((campanha) => [
      campanha,
      Math.min(LIMITE_POR_CAMPANHA, quantidadeCandidatos[campanha])
    ])
  );
  let totalMetas = Object.values(metas).reduce((total, quantidade) => (
    total + quantidade
  ), 0);

  // Quando uma campanha não alcança 60 candidatos reais, reparte a diferença.
  while (totalMetas < TOTAL_GERAL) {
    let adicionouVaga = false;

    for (const campanha of CAMPANHAS) {
      if (metas[campanha] >= quantidadeCandidatos[campanha]) {
        continue;
      }

      metas[campanha]++;
      totalMetas++;
      adicionouVaga = true;

      if (totalMetas === TOTAL_GERAL) {
        break;
      }
    }

    if (!adicionouVaga) {
      break;
    }
  }

  if (totalMetas !== TOTAL_GERAL) {
    throw new Error(
      `Os critérios atuais oferecem somente ${totalMetas} vagas para uma base de `
      + `${TOTAL_GERAL} clientes.`
    );
  }

  return metas;
}

function calcularCotasPorCampanha(metasCampanha, configuracao) {
  const cotasTotais = configuracao.cotas.map((cota) => cota * CAMPANHAS.length);
  const totalCotas = cotasTotais.reduce((total, cota) => total + cota, 0);
  const valoresIdeais = {};
  const cotasPorCampanha = {};

  CAMPANHAS.forEach((campanha, indiceCampanha) => {
    const quantidadeCampanha = metasCampanha[campanha];
    const ideais = cotasTotais.map(
      (cotaTotal) => quantidadeCampanha * cotaTotal / totalCotas
    );
    const cotas = ideais.map(Math.floor);
    let vagasRestantes = quantidadeCampanha
      - cotas.reduce((total, cota) => total + cota, 0);
    const ordemRestos = ideais
      .map((valor, indice) => ({
        indice,
        fracao: valor - Math.floor(valor),
        desempate: (indice - indiceCampanha + configuracao.responsaveis.length)
          % configuracao.responsaveis.length
      }))
      .sort((primeiro, segundo) => segundo.fracao - primeiro.fracao
        || primeiro.desempate - segundo.desempate);

    for (const item of ordemRestos) {
      if (!vagasRestantes) {
        break;
      }

      cotas[item.indice]++;
      vagasRestantes--;
    }

    valoresIdeais[campanha] = ideais;
    cotasPorCampanha[campanha] = cotas;
  });

  const totaisAtuais = configuracao.responsaveis.map((_, indice) => (
    CAMPANHAS.reduce(
      (total, campanha) => total + cotasPorCampanha[campanha][indice],
      0
    )
  ));

  // Corrige arredondamentos para manter exatamente 125, 125 e 50 na base final.
  while (totaisAtuais.some((total, indice) => total !== cotasTotais[indice])) {
    const indiceDeficit = totaisAtuais.findIndex(
      (total, indice) => total < cotasTotais[indice]
    );
    const indicesSuperavit = totaisAtuais
      .map((total, indice) => ({ total, indice }))
      .filter((item) => item.total > cotasTotais[item.indice])
      .map((item) => item.indice);
    let melhorTroca = null;

    for (const campanha of CAMPANHAS) {
      for (const indiceSuperavit of indicesSuperavit) {
        if (!cotasPorCampanha[campanha][indiceSuperavit]) {
          continue;
        }

        const cotas = cotasPorCampanha[campanha];
        const ideais = valoresIdeais[campanha];
        const custoAtual = Math.abs(cotas[indiceSuperavit] - ideais[indiceSuperavit])
          + Math.abs(cotas[indiceDeficit] - ideais[indiceDeficit]);
        const custoNovo = Math.abs(cotas[indiceSuperavit] - 1 - ideais[indiceSuperavit])
          + Math.abs(cotas[indiceDeficit] + 1 - ideais[indiceDeficit]);
        const aumentoCusto = custoNovo - custoAtual;

        if (!melhorTroca || aumentoCusto < melhorTroca.aumentoCusto) {
          melhorTroca = { campanha, indiceSuperavit, aumentoCusto };
        }
      }
    }

    if (!melhorTroca || indiceDeficit < 0) {
      throw new Error("Não foi possível equilibrar as cotas dos responsáveis.");
    }

    cotasPorCampanha[melhorTroca.campanha][melhorTroca.indiceSuperavit]--;
    cotasPorCampanha[melhorTroca.campanha][indiceDeficit]++;
    totaisAtuais[melhorTroca.indiceSuperavit]--;
    totaisAtuais[indiceDeficit]++;
  }

  return { cotasPorCampanha, cotasTotais };
}

function selecionarCampanhas(clientes, configuracao) {
  const compararCpf = (primeiro, segundo) => primeiro.cpf.localeCompare(segundo.cpf);

  const compararProximaCompra = (primeiro, segundo) => (
    Number(segundo.previsaoExataNoPeriodo) - Number(primeiro.previsaoExataNoPeriodo)
    || Number(segundo.historicoProprio) - Number(primeiro.historicoProprio)
    || segundo.confiancaPrevisao - primeiro.confiancaPrevisao
    || segundo.regularidadeCompras - primeiro.regularidadeCompras
    || primeiro.ciclosProjetados - segundo.ciclosProjetados
    || primeiro.distanciaPeriodo - segundo.distanciaPeriodo
    || segundo.valorTotal - primeiro.valorTotal
    || compararCpf(primeiro, segundo)
  );

  const comparadores = {
    "Aniversário": (primeiro, segundo) => (
      segundo.valorTotal - primeiro.valorTotal || compararCpf(primeiro, segundo)
    ),
    "Próxima Compra": compararProximaCompra,
    "Promoção": (primeiro, segundo) => (
      segundo.percentualDesconto - primeiro.percentualDesconto
      || segundo.valorTotal - primeiro.valorTotal
      || compararCpf(primeiro, segundo)
    ),
    "Novidade": (primeiro, segundo) => (
      segundo.valorTotal - primeiro.valorTotal || compararCpf(primeiro, segundo)
    ),
    "Inativos": (primeiro, segundo) => (
      primeiro.diasInativo - segundo.diasInativo
      || segundo.valorTotal - primeiro.valorTotal
      || compararCpf(primeiro, segundo)
    )
  };

  const candidatosPorCampanha = {
    "Aniversário": clientes.filter(
      (cliente) => aniversarioNoPeriodo(cliente.nascimento, configuracao)
    ),
    "Próxima Compra": clientes.filter(
      (cliente) => cliente.proximaCompra && cliente.previsaoNoPeriodo
    ),
    "Promoção": clientes.filter(
      (cliente) => cliente.percentualDesconto !== null
        && cliente.percentualDesconto > configuracao.limiteDesconto
    ),
    "Novidade": clientes.filter(
      (cliente) => cliente.percentualDesconto !== null
        && cliente.percentualDesconto <= configuracao.limiteDesconto
    ),
    "Inativos": clientes.filter(
      (cliente) => cliente.dataUltimaCompra
        && cliente.diasInativo >= configuracao.diasInatividade
    )
  };

  for (const campanha of CAMPANHAS) {
    candidatosPorCampanha[campanha].sort(comparadores[campanha]);
  }

  const quantidadeCandidatos = Object.fromEntries(
    CAMPANHAS.map((campanha) => [campanha, candidatosPorCampanha[campanha].length])
  );
  const metasCampanha = calcularMetasCampanhas(quantidadeCandidatos);

  // Cada vaga procura um CPF e pode realocar ocupantes até encontrar a combinação global.
  const ordemCampanhas = [...CAMPANHAS].sort(
    (primeira, segunda) => (
      quantidadeCandidatos[primeira] - metasCampanha[primeira]
      - (quantidadeCandidatos[segunda] - metasCampanha[segunda])
    )
      || CAMPANHAS.indexOf(primeira) - CAMPANHAS.indexOf(segunda)
  );
  const vagas = [];
  const maiorMeta = Math.max(...Object.values(metasCampanha));

  for (let posicao = 0; posicao < maiorMeta; posicao++) {
    for (const campanha of ordemCampanhas) {
      if (posicao < metasCampanha[campanha]) {
        vagas.push({ campanha, cliente: null });
      }
    }
  }

  const vagaPorCpf = new Map();

  function tentarPreencherVaga(vaga, cpfsVisitados) {
    for (const cliente of candidatosPorCampanha[vaga.campanha]) {
      if (cpfsVisitados.has(cliente.cpf)) {
        continue;
      }

      cpfsVisitados.add(cliente.cpf);
      const vagaAnterior = vagaPorCpf.get(cliente.cpf);

      if (!vagaAnterior || tentarPreencherVaga(vagaAnterior, cpfsVisitados)) {
        vaga.cliente = cliente;
        vagaPorCpf.set(cliente.cpf, vaga);
        return true;
      }
    }

    return false;
  }

  let quantidadePreenchida = 0;

  for (const vaga of vagas) {
    if (tentarPreencherVaga(vaga, new Set())) {
      quantidadePreenchida++;
    }
  }

  if (quantidadePreenchida !== TOTAL_GERAL) {
    const detalheCandidatos = CAMPANHAS.map(
      (campanha) => (
        `${campanha}: ${quantidadeCandidatos[campanha]} candidatos para `
        + `${metasCampanha[campanha]} vagas`
      )
    ).join("; ");

    throw new Error(
      `Não foi possível formar as ${TOTAL_GERAL} vagas sem repetir CPF. `
      + `O cruzamento preencheu ${quantidadePreenchida} vagas. `
      + `Candidatos pelos critérios — ${detalheCandidatos}.`
    );
  }

  const selecionadosPorCampanha = Object.fromEntries(
    CAMPANHAS.map((campanha) => [
      campanha,
      vagas
        .filter((vaga) => vaga.campanha === campanha)
        .map((vaga) => vaga.cliente)
        .sort(comparadores[campanha])
    ])
  );
  const { cotasPorCampanha, cotasTotais } = calcularCotasPorCampanha(
    metasCampanha,
    configuracao
  );

  function distribuirResponsaveis(clientesSelecionados, campanha) {
    const quantidades = configuracao.responsaveis.map(() => 0);
    const cotasCampanha = cotasPorCampanha[campanha];

    return clientesSelecionados.map((cliente) => {
      const indicesDisponiveis = configuracao.responsaveis
        .map((_, indice) => indice)
        .filter((indice) => quantidades[indice] < cotasCampanha[indice])
        .sort((primeiro, segundo) => (
          quantidades[primeiro] / cotasCampanha[primeiro]
          - quantidades[segundo] / cotasCampanha[segundo]
          || primeiro - segundo
        ));

      const indiceResponsavel = indicesDisponiveis[0];
      quantidades[indiceResponsavel]++;

      return {
        ...cliente,
        campanha,
        responsavel: configuracao.responsaveis[indiceResponsavel],
        lojaFinal: configuracao.lojaFinal
      };
    });
  }

  const porCampanha = Object.fromEntries(
    CAMPANHAS.map((campanha) => [
      campanha,
      distribuirResponsaveis(selecionadosPorCampanha[campanha], campanha)
    ])
  );
  const baseFinal = CAMPANHAS.flatMap((campanha) => porCampanha[campanha]);

  return {
    porCampanha,
    baseFinal,
    limitePorCampanha: LIMITE_POR_CAMPANHA,
    quantidadeCandidatos,
    metasCampanha,
    cotasPorCampanha,
    cotasTotais
  };
}

function montarValidacoes(selecao, configuracao, bloqueados) {
  const baseFinal = selecao.baseFinal;
  const cpfsUnicos = new Set(baseFinal.map((cliente) => cliente.cpf));
  const cotasCorretas = CAMPANHAS.every((campanha) => (
    configuracao.responsaveis.every((responsavel, indice) => (
      selecao.porCampanha[campanha].filter(
        (cliente) => cliente.responsavel === responsavel
      ).length === selecao.cotasPorCampanha[campanha][indice]
    ))
  ));
  const cotasTotaisCorretas = configuracao.responsaveis.every(
    (responsavel, indice) => baseFinal.filter(
      (cliente) => cliente.responsavel === responsavel
    ).length === selecao.cotasTotais[indice]
  );

  return [
    [`Base final possui exatamente ${TOTAL_GERAL} clientes`, baseFinal.length === TOTAL_GERAL],
    [
      "Todos possuem CPF e telefone",
      baseFinal.every((cliente) => cliente.cpf && cliente.telefones.length)
    ],
    [
      "Nenhum CPF bloqueado foi selecionado",
      baseFinal.every((cliente) => !bloqueados.has(cliente.cpf))
    ],
    [
      "Somente lojas permitidas; ALE excluída",
      baseFinal.every((cliente) => configuracao.lojasPermitidas.has(cliente.loja)
        && cliente.loja !== "ALE")
    ],
    [
      `Todos direcionados para ${configuracao.lojaFinal}`,
      baseFinal.every((cliente) => cliente.lojaFinal === configuracao.lojaFinal)
    ],
    ["CPFs sem duplicidade entre campanhas", cpfsUnicos.size === baseFinal.length],
    [
      `Todas as últimas compras são de ${ANO_INICIAL_BASE} em diante`,
      baseFinal.every(
        (cliente) => cliente.dataUltimaCompra >= configuracao.dataMinimaBase
      )
    ],
    [
      "Aniversários dentro do período",
      selecao.porCampanha["Aniversário"].every(
        (cliente) => aniversarioNoPeriodo(cliente.nascimento, configuracao)
      )
    ],
    [
      "Próxima Compra possui previsão compatível com o período de ação",
      selecao.porCampanha["Próxima Compra"].every(
        (cliente) => cliente.previsaoNoPeriodo
      )
    ],
    [
      "Promoção e Novidade respeitam o limite",
      selecao.porCampanha["Promoção"].every(
        (cliente) => cliente.percentualDesconto > configuracao.limiteDesconto
      ) && selecao.porCampanha.Novidade.every(
        (cliente) => cliente.percentualDesconto <= configuracao.limiteDesconto
      )
    ],
    [
      "Inativos respeitam o prazo mínimo e priorizam os mais recentes",
      selecao.porCampanha.Inativos.every(
        (cliente) => cliente.dataUltimaCompra
          && cliente.diasInativo >= configuracao.diasInatividade
      ) && selecao.porCampanha.Inativos.every(
        (cliente, indice, inativos) => indice === 0
          || inativos[indice - 1].diasInativo <= cliente.diasInativo
      )
    ],
    ["Cotas proporcionais corretas em cada campanha", cotasCorretas],
    ["Cotas totais da base: 125, 125 e 50", cotasTotaisCorretas],
    ...CAMPANHAS.map((campanha) => [
      `${campanha}: ${selecao.porCampanha[campanha].length} selecionados de `
        + `${selecao.quantidadeCandidatos[campanha]} candidatos`,
      selecao.porCampanha[campanha].length === selecao.metasCampanha[campanha]
    ])
  ];
}

// Processamento principal
function atualizarProgresso(valor, texto) {
  obterElemento("progress").classList.remove("hidden");
  obterElemento("progressBar").style.width = `${valor}%`;
  obterElemento("progressValue").textContent = `${valor}%`;
  obterElemento("progressLabel").textContent = texto;
}

async function gerarCampanhas() {
  ocultarErro();
  estado.resultado = null;
  estado.logs = [];
  obterElemento("results").classList.add("hidden");

  const botao = obterElemento("generateBtn");
  botao.disabled = true;

  try {
    atualizarProgresso(5, "Lendo arquivos");
    await esperar(80);

    const base70 = obterRegistros("70");
    const base600 = obterRegistros("600");
    const registrosUtilizados = obterRegistros("used");

    validarCabecalhos(base70, "Base 70");
    validarCabecalhos(base600, "Base 600");
    validarCabecalhos(registrosUtilizados, "CPFs utilizados");

    const configuracao = obterConfiguracao();

    atualizarProgresso(22, "Normalizando CPFs e telefones");
    await esperar(50);

    const bloqueados = extrairCpfsBloqueados(registrosUtilizados);
    const estatisticas = {
      lidosBase70: base70.length,
      lidosBase600: base600.length,
      quantidadeBloqueados: bloqueados.size,
      semCpf: 0,
      semTelefone: 0,
      lojaInvalida: 0,
      bloqueados: 0,
      duplicados: 0,
      semCompraValida: 0,
      ultimaCompraAntesDe2023: 0,
      validos: 0
    };

    atualizarProgresso(45, "Cruzando cadastros e histórico");

    const clientes = montarClientes(
      base70,
      base600,
      bloqueados,
      configuracao,
      estatisticas
    );

    await esperar(60);
    atualizarProgresso(68, "Calculando recorrência e distribuindo campanhas");

    const selecao = selecionarCampanhas(clientes, configuracao);
    const validacoes = montarValidacoes(selecao, configuracao, bloqueados);

    atualizarProgresso(84, "Validando a Base Final");

    estado.resultado = {
      ...selecao,
      clientes,
      estatisticas,
      configuracao,
      bloqueados,
      validacoes,
      geradoEm: new Date()
    };
    salvarResumoAtribuicoesEquipe();

    renderizarResultado();
    await esperar(80);

    atualizarProgresso(100, "Finalizado com sucesso");
    estado.logs = montarLog(estado.resultado);
  } catch (erro) {
    mostrarErro(erro.message);
    atualizarProgresso(0, "Processamento interrompido");
  } finally {
    botao.disabled = false;
  }
}

function mostrarErro(mensagem) {
  obterElemento("alert").textContent = mensagem;
  obterElemento("alert").classList.remove("hidden");
}

function ocultarErro() {
  obterElemento("alert").classList.add("hidden");
}

// Exibição do resultado
function renderizarResultado() {
  const resultado = estado.resultado;
  const estatisticas = resultado.estatisticas;
  const total = resultado.baseFinal.length;

  const quantidadePorResponsavel = Object.fromEntries(
    resultado.configuracao.responsaveis.map((responsavel) => [
      responsavel,
      resultado.baseFinal.filter((cliente) => cliente.responsavel === responsavel).length
    ])
  );

  const quantidadePorLoja = Object.fromEntries(
    [...resultado.configuracao.lojasPermitidas].map((loja) => [
      loja,
      resultado.baseFinal.filter((cliente) => cliente.loja === loja).length
    ])
  );

  obterElemento("results").classList.remove("hidden");
  obterElemento("resultSubtitle").textContent = (
    `${total} clientes para a ação de `
    + `${formatarData(resultado.configuracao.inicioAcao)} a `
    + `${formatarData(resultado.configuracao.fimAcao)}, com todos os critérios atendidos.`
  );

  const indicadores = [
    ["Registros Base 70", estatisticas.lidosBase70],
    ["Vendas Base 600", estatisticas.lidosBase600],
    ["Clientes válidos", estatisticas.validos],
    ["Base Final", total]
  ];

  obterElemento("metrics").innerHTML = indicadores.map(([nome, valor]) => (
    `<div class="metric"><span>${nome}</span>`
    + `<strong>${valor.toLocaleString("pt-BR")}</strong></div>`
  )).join("");

  obterElemento("campaignCards").innerHTML = CAMPANHAS.map((campanha) => (
    `<div class="campaign"><i></i>`
    + `<strong>${resultado.porCampanha[campanha].length}</strong>`
    + `<span>${campanha} · ${resultado.quantidadeCandidatos[campanha]} candidatos</span></div>`
  )).join("");

  const resumo = [
    ["CPFs no arquivo de bloqueio", estatisticas.quantidadeBloqueados],
    ["Removidos sem CPF", estatisticas.semCpf],
    ["Removidos sem telefone", estatisticas.semTelefone],
    ["Removidos por loja", estatisticas.lojaInvalida],
    ["Removidos por CPF usado", estatisticas.bloqueados],
    ["Removidos sem compra válida", estatisticas.semCompraValida],
    [
      `Removidos — última compra antes de ${ANO_INICIAL_BASE}`,
      estatisticas.ultimaCompraAntesDe2023
    ],
    ["Duplicidades consolidadas", estatisticas.duplicados],
    ["Início mínimo da base", formatarData(resultado.configuracao.dataMinimaBase)],
    [
      "Período da ação",
      `${formatarData(resultado.configuracao.inicioAcao)} a `
        + formatarData(resultado.configuracao.fimAcao)
    ],
    ["Corte do histórico", formatarData(resultado.configuracao.dataCorteHistorico)],
    ...Object.entries(quantidadePorResponsavel).map(([nome, valor]) => [
      `Responsável: ${nome}`,
      valor
    ]),
    ...Object.entries(quantidadePorLoja).map(([loja, valor]) => [
      `Origem: ${loja}`,
      valor
    ])
  ];

  obterElemento("summary").innerHTML = resumo.map(([nome, valor]) => (
    `<div><span>${nome}</span><strong>${valor}</strong></div>`
  )).join("");

  obterElemento("validations").innerHTML = resultado.validacoes
    .map(([texto, aprovada]) => (
      `<div class="check ${aprovada ? "" : "warn"}">`
      + `<i>${aprovada ? "✓" : "!"}</i><span>${texto}</span></div>`
    ))
    .join("");

  renderizarTabela(resultado.baseFinal);
  obterElemento("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function montarLinhaSaida(cliente) {
  return {
    "LOJA ORIGINAL": cliente.loja,
    "LOJA FINAL": cliente.lojaFinal,
    "CAMPANHA": cliente.campanha,
    "RESPONSÁVEL": cliente.responsavel,
    "NOME": cliente.nome,
    "CPF": formatarCpf(cliente.cpf),
    "TEL 1": formatarTelefone(cliente.telefones[0]),
    "TEL 2": formatarTelefone(cliente.telefones[1] || ""),
    "NASCIMENTO": formatarData(cliente.nascimento),
    "ÚLTIMA COMPRA": formatarData(cliente.dataUltimaCompra),
    "VALOR ÚLTIMA COMPRA": cliente.valorUltimaCompra,
    "DIAS SEM COMPRA": cliente.diasInativo ?? "",
    "QTD COMPRAS": cliente.quantidadeCompras,
    "INTERVALO PREVISTO": cliente.intervaloPrevisto === null
      ? ""
      : Math.round(cliente.intervaloPrevisto),
    "PRÓXIMA COMPRA": formatarData(cliente.proximaCompra),
    "MARGEM PREVISÃO": cliente.margemPrevisao === null
      ? ""
      : `±${cliente.margemPrevisao} dias`,
    "FAIXA PREVISTA": cliente.inicioFaixaPrevisao
      ? `${formatarData(cliente.inicioFaixaPrevisao)} a ${formatarData(cliente.fimFaixaPrevisao)}`
      : "",
    "CONFIANÇA": cliente.confiancaPrevisao === null
      ? ""
      : `${Math.round(cliente.confiancaPrevisao * 100)}%`,
    "ORIGEM PREVISÃO": cliente.origemPrevisao,
    "CICLOS PROJETADOS": cliente.ciclosProjetados ?? "",
    "% DESCONTO": cliente.percentualDesconto === null
      ? ""
      : cliente.percentualDesconto
  };
}

function renderizarTabela(clientes) {
  const pesquisa = criarChave(obterElemento("previewSearch").value);
  const linhas = clientes
    .filter((cliente) => !pesquisa || criarChave(
      `${cliente.nome} ${cliente.cpf} ${cliente.campanha}`
    ).includes(pesquisa))
    .slice(0, 50)
    .map(montarLinhaSaida);

  if (!linhas.length) {
    obterElemento("preview").innerHTML = "<p style='padding:18px'>Nenhum registro encontrado.</p>";
    return;
  }

  const cabecalhos = Object.keys(linhas[0]);
  const cabecalhoTabela = cabecalhos.map((cabecalho) => `<th>${cabecalho}</th>`).join("");
  const corpoTabela = linhas.map((linha) => {
    const colunas = cabecalhos.map((cabecalho) => {
      const valor = cabecalho.includes("VALOR")
        ? converterNumero(linha[cabecalho]).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL"
        })
        : escaparHtml(linha[cabecalho]);

      return `<td>${valor}</td>`;
    }).join("");

    return `<tr>${colunas}</tr>`;
  }).join("");

  obterElemento("preview").innerHTML = (
    `<table><thead><tr>${cabecalhoTabela}</tr></thead>`
    + `<tbody>${corpoTabela}</tbody></table>`
  );
}

// Log e ações da tela

function montarLog(resultado) {
  return [
    "CRM Studio — Log de processamento",
    `Gerado em: ${resultado.geradoEm.toLocaleString("pt-BR")}`,
    `Base 70: ${resultado.estatisticas.lidosBase70}`,
    `Base 600: ${resultado.estatisticas.lidosBase600}`,
    `CPFs bloqueados: ${resultado.estatisticas.quantidadeBloqueados}`,
    `Clientes válidos: ${resultado.estatisticas.validos}`,
    `Sem compra válida: ${resultado.estatisticas.semCompraValida}`,
    `Última compra anterior a ${ANO_INICIAL_BASE}: ${resultado.estatisticas.ultimaCompraAntesDe2023}`,
    `Base final: ${resultado.baseFinal.length}`,
    `Início mínimo da base: ${formatarData(resultado.configuracao.dataMinimaBase)}`,
    `Período da ação: ${formatarData(resultado.configuracao.inicioAcao)} a ${formatarData(resultado.configuracao.fimAcao)}`,
    `Corte do histórico: ${formatarData(resultado.configuracao.dataCorteHistorico)}`,
    "Próxima Compra: 6 intervalos, IQR, mediana ponderada, margem MAD e limite de recência",
    ...CAMPANHAS.map((campanha) => (
      `${campanha}: ${resultado.porCampanha[campanha].length} selecionados de `
      + `${resultado.quantidadeCandidatos[campanha]} candidatos`
    )),
    ...CAMPANHAS.flatMap((campanha) => resultado.configuracao.responsaveis.map(
      (responsavel) => (
        `${campanha} — ${responsavel}: `
        + resultado.porCampanha[campanha].filter(
          (cliente) => cliente.responsavel === responsavel
        ).length
      )
    )),
    "",
    ...resultado.validacoes.map(([texto, aprovada]) => (
      `${aprovada ? "OK" : "ATENÇÃO"}: ${texto}`
    ))
  ].join("\r\n");
}

function baixarArquivo(conteudo, nome, tipo) {
  const link = document.createElement("a");
  const endereco = URL.createObjectURL(new Blob([conteudo], { type: tipo }));

  link.href = endereco;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(endereco), 1000);
}

function baixarLog() {
  if (estado.resultado) {
    baixarArquivo(
      estado.logs,
      `log_crm_${Date.now()}.txt`,
      "text/plain;charset=utf-8"
    );
  }
}

function limparTudo() {
  if (!confirm("Limpar arquivos, configurações e resultado?")) {
    return;
  }

  try {
    window.localStorage.removeItem("crmStudio.teamAssignments.v1");
  } catch (_) {
    // O armazenamento local pode estar indisponível em alguns navegadores.
  }
  location.reload();
}

function formatarDataParaCampo(data) {
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0")
  ].join("-");
}

function sincronizarDatasAcao(campoAlterado = "inicio") {
  const campoInicio = obterElemento("birthdayStart");
  const campoFim = obterElemento("birthdayEnd");

  if (campoInicio.value && campoFim.value && campoFim.value < campoInicio.value) {
    if (campoAlterado === "fim") {
      campoInicio.value = campoFim.value;
    } else {
      campoFim.value = campoInicio.value;
    }
  }

  campoFim.min = campoInicio.value;

  // Os campos antigos ficam sincronizados apenas por compatibilidade com a tela anterior.
  obterElemento("referenceDate").value = campoInicio.value;

  const inicio = interpretarData(campoInicio.value);
  const fim = interpretarData(campoFim.value);

  if (inicio && fim) {
    obterElemento("purchaseWindow").value = Math.max(
      1,
      calcularDiferencaDias(fim, inicio)
    );
  }
}

function prepararCamposFixos() {
  const trocarRotulo = (id, texto) => {
    const rotulo = obterElemento(id).closest("label");
    const noTexto = rotulo && [...rotulo.childNodes].find(
      (no) => no.nodeType === 3 && no.textContent.trim()
    );

    if (noTexto) {
      noTexto.textContent = `\n                  ${texto}\n                  `;
    }
  };

  trocarRotulo("birthdayStart", "Início do período de ação");
  trocarRotulo("birthdayEnd", "Fim do período de ação");
  trocarRotulo("desiredTotal", "Total da base (fixo)");
  trocarRotulo("quota1", "Patrícia — cota padrão por campanha");
  trocarRotulo("quota2", "Sirlene — cota padrão por campanha");
  trocarRotulo("quota3", "Marines — cota padrão por campanha");

  for (const id of ["referenceDate", "purchaseWindow"]) {
    const campo = obterElemento(id);
    const rotulo = campo.closest("label");

    campo.disabled = true;

    if (rotulo) {
      rotulo.hidden = true;
    }
  }

  for (const id of ["desiredTotal", "quota1", "quota2", "quota3"]) {
    obterElemento(id).readOnly = true;
  }
}

function aplicarPadroes() {
  const inicioAcao = new Date();
  inicioAcao.setHours(0, 0, 0, 0);
  const fimAcao = adicionarDias(inicioAcao, 7);
  const valoresPadrao = [
    ["birthdayStart", formatarDataParaCampo(inicioAcao)],
    ["birthdayEnd", formatarDataParaCampo(fimAcao)],
    ["referenceDate", formatarDataParaCampo(inicioAcao)],
    ["discountLimit", 8],
    ["purchaseWindow", 7],
    ["inactiveDays", 90],
    ["allowedStores", "CGO, SCR, SRO"],
    ["finalStore", "SCR"],
    ["desiredTotal", TOTAL_GERAL],
    ["quota1", COTAS_RESPONSAVEIS[0]],
    ["quota2", COTAS_RESPONSAVEIS[1]],
    ["quota3", COTAS_RESPONSAVEIS[2]]
  ];

  for (const [id, valor] of valoresPadrao) {
    obterElemento(id).value = valor;
  }

  sincronizarDatasAcao();
}

// Exportação no padrão visual das Lojas Hoje

function exportarExcel() {
  const resultado = estado.resultado;

  if (!resultado) {
    return;
  }

  if (!window.XLSX) {
    mostrarErro("A biblioteca do Excel não foi carregada.");
    return;
  }

  const pastaTrabalho = XLSX.utils.book_new();
  const nomesAbasCampanha = {
    "Aniversário": "ANIVERSARIO",
    "Próxima Compra": "PROXIMA_COMPRA",
    "Promoção": "PROMOCAO",
    "Novidade": "NOVIDADE",
    "Inativos": "INATIVOS"
  };

  const nomesCompletosResponsaveis = {
    patricia: "PATRICIA ULLMANN",
    sirlene: "SIRLENE SCHAFER",
    marines: "MARINES BRANT"
  };

  const montarLinhasCampanha = (clientes) => clientes.map((cliente) => ({
    "LOJA": `LOJAS HOJE COM VEST LTDA -${cliente.lojaFinal || resultado.configuracao.lojaFinal || "SCR"}`,
    "TIPO DE CAMPANHA": String(cliente.campanha || "").toLocaleUpperCase("pt-BR"),
    "VENDEDORA": nomesCompletosResponsaveis[criarChave(cliente.responsavel)]
      || String(cliente.responsavel || "").toLocaleUpperCase("pt-BR"),
    "NOME DO CLIENTE": String(cliente.nome || "").toLocaleUpperCase("pt-BR"),
    "CPF": formatarCpf(cliente.cpf),
    "TEL 1": formatarTelefone(cliente.telefones?.[0] || ""),
    "TEL 2": formatarTelefone(cliente.telefones?.[1] || ""),
    "DATA DE NASCIMENTO": converterDataParaExcel(cliente.nascimento),
    "DATA ULTIMA COMPRA": converterDataParaExcel(cliente.dataUltimaCompra),
    "VALOR ULTIMA COMPRA": cliente.dataUltimaCompra
      ? Number(cliente.valorUltimaCompra || 0)
      : null
  }));

  const estiloCabecalho = {
    fill: { patternType: "solid", fgColor: { rgb: "A71930" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "7F1024" } },
      bottom: { style: "thin", color: { rgb: "7F1024" } },
      left: { style: "thin", color: { rgb: "FFFFFF" } },
      right: { style: "thin", color: { rgb: "FFFFFF" } }
    }
  };

  const criarEstiloCorpo = (indiceLinha) => ({
    fill: {
      patternType: "solid",
      fgColor: { rgb: indiceLinha % 2 === 0 ? "FFF7F8" : "FFFFFF" }
    },
    font: { name: "Arial", sz: 10, color: { rgb: "17212B" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: false },
    border: {
      bottom: { style: "thin", color: { rgb: "E7D8DB" } },
      left: { style: "thin", color: { rgb: "F0E5E7" } },
      right: { style: "thin", color: { rgb: "F0E5E7" } }
    }
  });

  const largurasColunas = {
    "LOJA": 31,
    "TIPO DE CAMPANHA": 22,
    "VENDEDORA": 23,
    "NOME DO CLIENTE": 32,
    "CPF": 16,
    "TEL 1": 17,
    "TEL 2": 17,
    "DATA DE NASCIMENTO": 21,
    "DATA ULTIMA COMPRA": 21,
    "VALOR ULTIMA COMPRA": 23
  };

  function adicionarAba(nome, linhas, cabecalhosPreferidos, formatosPorCabecalho = {}) {
    const cabecalhos = cabecalhosPreferidos
      || Object.keys(linhas[0] || { "SEM DADOS": "" });

    const planilha = linhas.length
      ? XLSX.utils.json_to_sheet(linhas, { header: cabecalhos })
      : XLSX.utils.aoa_to_sheet([cabecalhos]);

    const intervalo = XLSX.utils.decode_range(planilha["!ref"] || "A1:A1");

    for (let linha = intervalo.s.r; linha <= intervalo.e.r; linha++) {
      for (let coluna = intervalo.s.c; coluna <= intervalo.e.c; coluna++) {
        const endereco = XLSX.utils.encode_cell({ r: linha, c: coluna });

        if (!planilha[endereco]) {
          planilha[endereco] = { t: "s", v: "" };
        }

        planilha[endereco].s = linha === 0
          ? estiloCabecalho
          : criarEstiloCorpo(linha);

        const cabecalho = cabecalhos[coluna] || "";

        if (linha > 0) {
          planilha[endereco].z = formatosPorCabecalho[cabecalho] || "@";
        }
      }
    }

    planilha["!rows"] = Array.from(
      { length: intervalo.e.r + 1 },
      (_, indice) => ({ hpt: indice === 0 ? 22 : 18 })
    );

    planilha["!cols"] = cabecalhos.map((cabecalho) => ({
      wch: largurasColunas[cabecalho]
        || Math.min(38, Math.max(14, String(cabecalho).length + 4))
    }));

    planilha["!autofilter"] = {
      ref: `A1:${XLSX.utils.encode_col(cabecalhos.length - 1)}${Math.max(1, intervalo.e.r + 1)}`
    };

    planilha["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen"
    };

    planilha["!margins"] = {
      left: 0.25,
      right: 0.25,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2
    };

    XLSX.utils.book_append_sheet(pastaTrabalho, planilha, nome.slice(0, 31));
  }

  const cabecalhosOperacionais = [
    "LOJA",
    "TIPO DE CAMPANHA",
    "VENDEDORA",
    "NOME DO CLIENTE",
    "CPF",
    "TEL 1",
    "TEL 2",
    "DATA DE NASCIMENTO",
    "DATA ULTIMA COMPRA",
    "VALOR ULTIMA COMPRA"
  ];

  const formatosOperacionais = {
    "DATA DE NASCIMENTO": "dd/mm/yyyy",
    "DATA ULTIMA COMPRA": "dd/mm/yyyy",
    "VALOR ULTIMA COMPRA": '"R$" #,##0.00'
  };

  adicionarAba(
    "FINAL",
    montarLinhasCampanha(resultado.baseFinal),
    cabecalhosOperacionais,
    formatosOperacionais
  );

  for (const campanha of CAMPANHAS) {
    adicionarAba(
      nomesAbasCampanha[campanha],
      montarLinhasCampanha(
        resultado.baseFinal.filter((cliente) => cliente.campanha === campanha)
      ),
      cabecalhosOperacionais,
      formatosOperacionais
    );
  }

  adicionarAba(
    "ORIGEM_DOS_CLIENTES",
    resultado.baseFinal.map((cliente) => ({
      "CPF": formatarCpf(cliente.cpf),
      "NOME DO CLIENTE": cliente.nome,
      "LOJA ORIGINAL": cliente.loja,
      "LOJA FINAL": cliente.lojaFinal,
      "RESPONSÁVEL FINAL": cliente.responsavel,
      "TIPO DE CAMPANHA": cliente.campanha
    }))
  );

  adicionarAba(
    "RESUMO_PROCESSAMENTO",
    [
      { "INDICADOR": "Registros Base 70", "VALOR": resultado.estatisticas.lidosBase70 },
      { "INDICADOR": "Registros Base 600", "VALOR": resultado.estatisticas.lidosBase600 },
      { "INDICADOR": "CPFs bloqueados", "VALOR": resultado.estatisticas.quantidadeBloqueados },
      { "INDICADOR": "Sem compra válida", "VALOR": resultado.estatisticas.semCompraValida },
      {
        "INDICADOR": `Última compra antes de ${ANO_INICIAL_BASE}`,
        "VALOR": resultado.estatisticas.ultimaCompraAntesDe2023
      },
      { "INDICADOR": "Clientes válidos", "VALOR": resultado.estatisticas.validos },
      { "INDICADOR": "Total final", "VALOR": resultado.baseFinal.length },
      ...CAMPANHAS.map((campanha) => ({
        "INDICADOR": campanha,
        "VALOR": resultado.porCampanha[campanha].length
      }))
    ],
    null,
    { "VALOR": "0" }
  );

  adicionarAba(
    "CRITERIOS",
    [
      {
        "CRITÉRIO": "Lojas permitidas",
        "VALOR": [...resultado.configuracao.lojasPermitidas].join(", ")
      },
      {
        "CRITÉRIO": "Loja final",
        "VALOR": resultado.configuracao.lojaFinal
      },
      {
        "CRITÉRIO": "Período da ação",
        "VALOR": `${formatarData(resultado.configuracao.inicioAcao)} a ${formatarData(resultado.configuracao.fimAcao)}`
      },
      {
        "CRITÉRIO": "Corte do histórico",
        "VALOR": formatarData(resultado.configuracao.dataCorteHistorico)
      },
      {
        "CRITÉRIO": "Início mínimo da base",
        "VALOR": formatarData(resultado.configuracao.dataMinimaBase)
      },
      {
        "CRITÉRIO": "Previsão de próxima compra",
        "VALOR": "Até 6 intervalos recentes; IQR; 60% mediana + 40% média ponderada"
      },
      {
        "CRITÉRIO": "Margem da previsão",
        "VALOR": "MAD limitado entre 3 e 30 dias; mediana da loja/geral para uma compra"
      },
      {
        "CRITÉRIO": "Limite de recência",
        "VALOR": "Até 3 ciclos com histórico próprio; 1 ciclo quando usada a mediana da loja/geral"
      },
      {
        "CRITÉRIO": "Volume fixo",
        "VALOR": `${TOTAL_GERAL} clientes; meta padrão de ${LIMITE_POR_CAMPANHA} por campanha`
      },
      {
        "CRITÉRIO": "Redistribuição de vagas",
        "VALOR": "Se uma campanha não alcançar 60 candidatos, as vagas passam para campanhas elegíveis"
      },
      {
        "CRITÉRIO": "Distribuição efetiva das campanhas",
        "VALOR": CAMPANHAS.map(
          (campanha) => `${campanha}: ${resultado.metasCampanha[campanha]}`
        ).join("; ")
      },
      {
        "CRITÉRIO": "Cotas totais dos responsáveis",
        "VALOR": RESPONSAVEIS.map(
          (responsavel, indice) => `${responsavel}: ${resultado.cotasTotais[indice]}`
        ).join("; ")
      },
      {
        "CRITÉRIO": "Limite desconto",
        "VALOR": `${resultado.configuracao.limiteDesconto}%`
      },
      {
        "CRITÉRIO": "Inatividade mínima",
        "VALOR": `${resultado.configuracao.diasInatividade} dias`
      },
      {
        "CRITÉRIO": "Prioridade dos inativos",
        "VALOR": "Mais recentes entre os clientes que já atingiram a inatividade mínima"
      },
      ...CAMPANHAS.map((campanha) => ({
        "CRITÉRIO": `Candidatos — ${campanha}`,
        "VALOR": resultado.quantidadeCandidatos[campanha]
      }))
    ]
  );

  XLSX.writeFile(
    pastaTrabalho,
    `CRM_SCR_${formatarDataParaCampo(new Date())}.xlsx`,
    { compression: true, cellStyles: true }
  );
}

function criarResumoAtribuicoesEquipe() {
  if (!estado.resultado) return null;
  return {
    generatedAt: estado.resultado.geradoEm.toISOString(),
    groups: estado.resultado.configuracao.responsaveis.map((responsavel) => ({
      label: responsavel,
      sent: estado.resultado.baseFinal.filter(
        (cliente) => cliente.responsavel === responsavel
      ).length,
      converted: 0,
      notConverted: 0,
      revenue: 0,
      purchases: 0,
      rate: 0
    }))
  };
}

function salvarResumoAtribuicoesEquipe() {
  const resumo = criarResumoAtribuicoesEquipe();
  if (!resumo) return;
  try {
    window.localStorage.setItem(
      "crmStudio.teamAssignments.v1",
      JSON.stringify(resumo)
    );
  } catch (_) {
    // O painel continua funcionando com o resultado mantido em memória.
  }
}

function obterResumoAtribuicoesEquipe() {
  const resumoAtual = criarResumoAtribuicoesEquipe();
  if (resumoAtual) return resumoAtual;
  try {
    const resumoSalvo = window.localStorage.getItem("crmStudio.teamAssignments.v1");
    return resumoSalvo ? JSON.parse(resumoSalvo) : null;
  } catch (_) {
    return null;
  }
}

window.CampaignStudio = Object.freeze({
  getTeamAssignmentSummary: obterResumoAtribuicoesEquipe
});

// Liga os controles da página às funções acima.

for (const tipoTela of ["70", "600", "Used"]) {
  const tipoInterno = tipoTela === "Used" ? "used" : tipoTela;

  obterElemento(`file${tipoTela}`).addEventListener("change", (evento) => {
    const arquivo = evento.target.files[0];

    if (arquivo) {
      carregarFonte(tipoInterno, arquivo);
    }
  });
}

obterElemento("generateBtn").addEventListener("click", gerarCampanhas);
obterElemento("clearBtn").addEventListener("click", limparTudo);
obterElemento("defaultsBtn").addEventListener("click", aplicarPadroes);
obterElemento("excelBtn").addEventListener("click", exportarExcel);
obterElemento("logBtn").addEventListener("click", baixarLog);
obterElemento("birthdayStart").addEventListener("change", () => {
  sincronizarDatasAcao("inicio");
});
obterElemento("birthdayEnd").addEventListener("change", () => {
  sincronizarDatasAcao("fim");
});
obterElemento("previewSearch").addEventListener("input", () => {
  if (estado.resultado) {
    renderizarTabela(estado.resultado.baseFinal);
  }
});

prepararCamposFixos();
aplicarPadroes();
