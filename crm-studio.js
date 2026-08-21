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
const MESES_ABREVIADOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez"
];
const LIMITE_INTERVALOS_RECENTES = 6;
const LIMITE_CICLOS_HISTORICO = 3;
const LIMITE_CICLOS_MEDIANA = 1;
const ANO_INICIAL_BASE = 2023;
const TODAS_AS_ABAS = "__todas_as_abas__";
const VERSAO_LEITOR_BASE_600 = "20260817-2";
const DDD_PADRAO_OPERACAO = "55";
const DDDS_BRASIL = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99"
]);

const estado = {
  arquivos: {},
  leiturasPendentes: {},
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

const normalizarDdd = (valor) => {
  const ddd = limparTexto(valor).replace(/\D/g, "").slice(-2);
  return DDDS_BRASIL.has(ddd) ? ddd : "";
};

const normalizarTelefone = (valor, dddPadrao = "") => {
  let numeros = limparTexto(valor).replace(/\D/g, "");

  // Remove o código internacional quando estiver junto do telefone brasileiro.

  if (numeros.startsWith("0055") && [14, 15].includes(numeros.length)) {
    numeros = numeros.slice(4);
  } else if (numeros.startsWith("55") && [12, 13].includes(numeros.length)) {
    numeros = numeros.slice(2);
  }

  // Remove o zero usado antes do DDD em alguns cadastros antigos.
  
  while (numeros.startsWith("0") && numeros.length > 9) {
    const semZero = numeros.slice(1);
    if (
      [10, 11].includes(semZero.length)
      && DDDS_BRASIL.has(semZero.slice(0, 2))
    ) {
      numeros = semZero;
      break;
    }
    if (numeros.startsWith("00")) {
      numeros = semZero;
      continue;
    }
    break;
  }

  if (
    [10, 11].includes(numeros.length)
    && DDDS_BRASIL.has(numeros.slice(0, 2))
  ) {
    return numeros;
  }

  const ddd = normalizarDdd(dddPadrao);
  if ([8, 9].includes(numeros.length)) {
    return ddd ? `${ddd}${numeros}` : numeros;
  }

  // Prefixos inválidos como 00 ou 05 são substituídos pelo DDD confirmado.
  
  if ([10, 11].includes(numeros.length) && ddd) {
    const ultimosNove = numeros.slice(-9);
    const numeroLocal = ultimosNove.startsWith("9")
      ? ultimosNove
      : numeros.slice(-8);
    return `${ddd}${numeroLocal}`;
  }

  return "";
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

  return "";
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
    || nome.startsWith("cel")
    || nome.includes("whats")
    || nome.includes("contato")
    || nome === "numero1"
    || nome === "numero2";
}

function extrairTelefones(registroOriginal, dddPadrao = DDD_PADRAO_OPERACAO) {
  const candidatos = [];

  for (const [cabecalho, valor] of Object.entries(registroOriginal)) {
    if (!ehCabecalhoTelefone(cabecalho)) {
      continue;
    }

    candidatos.push(...limparTexto(valor).split(/[|;/,]+/));
  }

  const telefonesComDdd = candidatos
    .map((candidato) => normalizarTelefone(candidato))
    .filter((telefone) => [10, 11].includes(telefone.length));
  const dddDoCliente = telefonesComDdd
    .map((telefone) => telefone.slice(0, 2))
    .find((ddd) => DDDS_BRASIL.has(ddd));
  const dddAplicado = dddDoCliente || normalizarDdd(dddPadrao) || DDD_PADRAO_OPERACAO;
  const encontrados = [];

  for (const candidato of candidatos) {
    const telefone = normalizarTelefone(candidato, dddAplicado);
    if (
      [10, 11].includes(telefone.length)
      && DDDS_BRASIL.has(telefone.slice(0, 2))
      && !encontrados.includes(telefone)
    ) {
      encontrados.push(telefone);
    }
  }

  return encontrados.slice(0, 2);
}

function mapearDddPredominantePorLoja(base70) {
  const contagensPorLoja = new Map();

  for (const registroOriginal of base70) {
    const registro = criarMapaCabecalhos(registroOriginal);
    const loja = normalizarLoja(buscarCampo(registro, CAMPOS.loja));
    if (!loja) continue;

    if (!contagensPorLoja.has(loja)) contagensPorLoja.set(loja, new Map());
    const contagens = contagensPorLoja.get(loja);

    for (const [cabecalho, valor] of Object.entries(registroOriginal)) {
      if (!ehCabecalhoTelefone(cabecalho)) continue;

      for (const candidato of limparTexto(valor).split(/[|;/,]+/)) {
        const telefone = normalizarTelefone(candidato);
        if (![10, 11].includes(telefone.length)) continue;

        const ddd = telefone.slice(0, 2);
        if (!DDDS_BRASIL.has(ddd)) continue;
        contagens.set(ddd, (contagens.get(ddd) || 0) + 1);
      }
    }
  }

  return new Map([...contagensPorLoja].map(([loja, contagens]) => {
    const dddPredominante = [...contagens.entries()]
      .sort((primeiro, segundo) => segundo[1] - primeiro[1])[0]?.[0]
      || DDD_PADRAO_OPERACAO;
    return [loja, dddPredominante];
  }));
}

// Identificação dos CPFs que não podem voltar para a seleção.

function ehCabecalhoCpf(cabecalho) {
  const chave = criarChave(cabecalho);
  return CAMPOS.cpf.some((nome) => chave === criarChave(nome))
    || chave.startsWith("cpf")
    || chave.endsWith("cpf");
}

function ehCabecalhoClaramenteNaoCpf(cabecalho) {
  const chave = criarChave(cabecalho);
  const termosIgnorados = [
    "nome",
    "cliente",
    "loja",
    "filial",
    "vendedor",
    "vendedora",
    "responsavel",
    "campanha",
    "nascimento",
    "valor",
    "produto",
    "desconto"
  ];

  return ehCabecalhoTelefone(cabecalho)
    || termosIgnorados.some((termo) => chave.includes(termo));
}

function analisarRegistrosCpfsUtilizados(registros, origem = "") {
  const cabecalhos = [...new Set(
    registros.flatMap((registro) => Object.keys(registro))
  )];
  const cabecalhosCpf = cabecalhos.filter(ehCabecalhoCpf);
  const perfis = cabecalhos.map((cabecalho) => {
    const valores = registros
      .map((registro) => registro[cabecalho])
      .filter((valor) => limparTexto(valor) !== "");
    const cpfs = valores.map(normalizarCpf).filter(Boolean);

    return {
      cabecalho,
      preenchidos: valores.length,
      cpfs: cpfs.length,
      proporcaoCpf: valores.length ? cpfs.length / valores.length : 0
    };
  });
  const colunasDetectadasPorConteudo = perfis
    .filter((perfil) => (
      perfil.cpfs > 0
      && perfil.proporcaoCpf >= 0.6
      && !ehCabecalhoClaramenteNaoCpf(perfil.cabecalho)
    ))
    .map((perfil) => perfil.cabecalho);
  const colunasDetectadas = [...new Set([
    ...cabecalhosCpf,
    ...colunasDetectadasPorConteudo
  ])];
  const cpfs = new Set();
  let ocorrenciasValidas = 0;
  let valoresInvalidos = 0;
  let duplicados = 0;

  for (const registro of registros) {
    for (const cabecalho of colunasDetectadas) {
      const valor = registro[cabecalho];
      if (limparTexto(valor) === "") continue;

      const cpf = normalizarCpf(valor);
      if (!cpf) {
        valoresInvalidos++;
        continue;
      }

      ocorrenciasValidas++;
      if (cpfs.has(cpf)) duplicados++;
      cpfs.add(cpf);
    }
  }

  return {
    origem,
    cpfs,
    registrosLidos: registros.length,
    colunasDetectadas,
    ocorrenciasValidas,
    valoresInvalidos,
    duplicados
  };
}

function extrairCpfsBloqueados(registros) {
  return analisarRegistrosCpfsUtilizados(registros).cpfs;
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

async function lerBase600Grande(arquivo, atualizarLeitura) {
  if (!window.Worker) {
    return null;
  }

  const buffer = await arquivo.arrayBuffer();

  return new Promise((resolver, rejeitar) => {
    const trabalhador = new Worker(
      `crm-xlsx-worker.js?v=${VERSAO_LEITOR_BASE_600}`
    );
    const registros = [];
    let finalizado = false;

    const encerrar = () => {
      if (!finalizado) {
        finalizado = true;
        trabalhador.terminate();
      }
    };

    trabalhador.addEventListener("message", (evento) => {
      const mensagem = evento.data || {};

      if (mensagem.tipo === "progresso") {
        atualizarLeitura(mensagem.etapa);
        return;
      }

      if (mensagem.tipo === "lote") {
        for (const linha of mensagem.linhas) {
          registros.push({
            "CPF": linha[0],
            "Data Compra": linha[1],
            "Valor da Venda": linha[2],
            "Desconto Produto": linha[3]
          });
        }

        atualizarLeitura(
          `Organizando ${Math.min(mensagem.processados, mensagem.total).toLocaleString("pt-BR")}`
          + ` de ${mensagem.total.toLocaleString("pt-BR")} registros`
        );
        return;
      }

      if (mensagem.tipo === "erro") {
        encerrar();
        rejeitar(new Error(mensagem.mensagem));
        return;
      }

      if (mensagem.tipo === "concluido") {
        encerrar();
        resolver({
          registrosDiretos: registros,
          nomesAbas: [mensagem.nomeAba],
          abaSelecionada: mensagem.nomeAba,
          nomeArquivo: arquivo.name
        });
      }
    });

    trabalhador.addEventListener("error", () => {
      encerrar();
      rejeitar(new Error(
        "A leitura da Base 600 foi interrompida pelo navegador. "
        + "Feche outras abas pesadas e carregue o arquivo novamente."
      ));
    });

    trabalhador.postMessage({ buffer }, [buffer]);
  });
}

async function lerArquivo(arquivo, tipo, atualizarLeitura = () => {}) {
  const extensao = arquivo.name.split(".").pop().toLowerCase();

  if (["xlsx", "xls"].includes(extensao)) {
    if (!window.XLSX) {
      throw new Error("Leitor Excel indisponível. Verifique a internet ou use CSV.");
    }

    if (tipo === "600") {
      const leituraOtimizada = await lerBase600Grande(arquivo, atualizarLeitura);

      if (leituraOtimizada) {
        return leituraOtimizada;
      }
    }

    const pastaTrabalho = XLSX.read(await arquivo.arrayBuffer(), {
      type: "array",
      dense: true,
      cellDates: false,
      cellText: false,
      cellStyles: false,
      cellNF: false
    });

    return {
      pastaTrabalho,
      nomesAbas: pastaTrabalho.SheetNames,
      nomeArquivo: arquivo.name
    };
  }

  return { texto: await arquivo.text(), nomeArquivo: arquivo.name };
}

function obterLinhasPlanilha(pastaTrabalho, nomeAba) {
  const planilha = pastaTrabalho?.Sheets?.[nomeAba];

  if (!planilha) {
    return [];
  }

  return XLSX.utils.sheet_to_json(planilha, {
    defval: "",
    raw: true
  });
}

function estimarQuantidadeRegistros(planilha) {
  if (!planilha?.["!ref"]) {
    return 0;
  }

  try {
    const intervalo = XLSX.utils.decode_range(planilha["!ref"]);
    return Math.max(0, intervalo.e.r - intervalo.s.r);
  } catch (_) {
    return 0;
  }
}

function localizarAbaComDados(arquivo, nomePreferido = "") {
  if (!arquivo?.pastaTrabalho) {
    return "";
  }

  const candidatas = [
    nomePreferido,
    arquivo.abaSelecionada,
    ...arquivo.nomesAbas
  ].filter((nome, indice, nomes) => nome && nomes.indexOf(nome) === indice);

  const abaComDados = candidatas.find((nomeAba) => {
    const planilha = arquivo.pastaTrabalho.Sheets[nomeAba];
    return planilha && estimarQuantidadeRegistros(planilha) > 0;
  });

  return abaComDados || candidatas.find(
    (nomeAba) => arquivo.pastaTrabalho.Sheets[nomeAba]
  ) || "";
}

function selecionarAbaDoArquivo(tipo, nomeAba) {
  const arquivo = estado.arquivos[tipo];

  if (!arquivo?.pastaTrabalho || !arquivo.pastaTrabalho.Sheets[nomeAba]) {
    return;
  }

  arquivo.abaSelecionada = nomeAba;
}

function obterAuditoriaCpfsUtilizados() {
  const arquivo = estado.arquivos.used;
  const seletorAba = obterElemento("sheetUsed");
  const fontes = [];

  if (arquivo?.pastaTrabalho) {
    const nomesAbas = seletorAba.value === TODAS_AS_ABAS
      ? arquivo.nomesAbas
      : [seletorAba.value].filter(Boolean);

    for (const nomeAba of nomesAbas) {
      fontes.push({
        nome: nomeAba,
        registros: obterLinhasPlanilha(arquivo.pastaTrabalho, nomeAba)
      });
    }
  } else {
    fontes.push({
      nome: arquivo?.nomeArquivo || "Dados colados",
      registros: lerTextoDelimitado(obterElemento("txtUsed").value)
    });
  }

  const cpfs = new Set();
  const detalhes = [];
  let ocorrenciasValidas = 0;
  let valoresInvalidos = 0;
  let duplicados = 0;

  for (const fonte of fontes) {
    const analise = analisarRegistrosCpfsUtilizados(fonte.registros, fonte.nome);
    detalhes.push(analise);
    ocorrenciasValidas += analise.ocorrenciasValidas;
    valoresInvalidos += analise.valoresInvalidos;
    duplicados += analise.duplicados;

    for (const cpf of analise.cpfs) {
      if (cpfs.has(cpf)) duplicados++;
      cpfs.add(cpf);
    }
  }

  return {
    cpfs,
    detalhes,
    abasLidas: detalhes.length,
    colunasDetectadas: detalhes.reduce(
      (total, detalhe) => total + detalhe.colunasDetectadas.length,
      0
    ),
    ocorrenciasValidas,
    valoresInvalidos,
    duplicados
  };
}

function atualizarResumoCpfsUtilizados() {
  const informacao = obterElemento("infoUsed");
  const cartao = informacao.closest(".upload-card");
  const auditoria = obterAuditoriaCpfsUtilizados();
  const nomeArquivo = estado.arquivos.used?.nomeArquivo || "Dados colados";

  if (!auditoria.cpfs.size) {
    informacao.textContent = `⚠ ${nomeArquivo} · nenhum CPF reconhecido`;
    cartao.classList.remove("ready");
    return;
  }

  const textoAbas = auditoria.abasLidas === 1
    ? "1 aba verificada"
    : `${auditoria.abasLidas} abas verificadas`;
  informacao.textContent = (
    `✓ ${nomeArquivo} · ${auditoria.cpfs.size.toLocaleString("pt-BR")} CPFs únicos`
    + ` · ${textoAbas}`
  );
  cartao.classList.add("ready");
}

async function carregarFonte(tipo, arquivo) {
  const sufixo = tipo === "70" ? "70" : tipo === "600" ? "600" : "Used";
  const informacao = obterElemento(`info${sufixo}`);
  const seletorAba = obterElemento(`sheet${sufixo}`);
  const campoTexto = obterElemento(`txt${sufixo}`);

  try {
    informacao.textContent = `Lendo ${arquivo.name}...`;

    const dados = await lerArquivo(arquivo, tipo, (mensagem) => {
      informacao.textContent = mensagem;
    });
    estado.arquivos[tipo] = dados;

    if (dados.registrosDiretos) {
      seletorAba.innerHTML = (
        `<option value="${escaparHtml(dados.abaSelecionada)}">`
        + `${escaparHtml(dados.abaSelecionada)}</option>`
      );
      seletorAba.value = dados.abaSelecionada;
      seletorAba.classList.add("hidden");
      campoTexto.value = "";
    } else if (dados.pastaTrabalho) {
      if (tipo === "used") {
        seletorAba.innerHTML = (
          `<option value="${TODAS_AS_ABAS}">Todas as abas (${dados.nomesAbas.length})</option>`
        );
        seletorAba.classList.remove("hidden");
      } else {
        seletorAba.innerHTML = dados.nomesAbas
          .map((nome) => `<option value="${escaparHtml(nome)}">${escaparHtml(nome)}</option>`)
          .join("");
        dados.abaSelecionada = localizarAbaComDados(dados);
        seletorAba.value = dados.abaSelecionada;
        seletorAba.classList.toggle("hidden", dados.nomesAbas.length < 2);
      }
      campoTexto.value = "";
    } else {
      campoTexto.value = dados.texto;
      seletorAba.classList.add("hidden");
    }

    if (tipo === "used") {
      atualizarResumoCpfsUtilizados();
    } else {
      if (dados.registrosDiretos) {
        informacao.textContent = (
          `✓ ${arquivo.name} · aba ${dados.abaSelecionada}`
          + ` · ${dados.registrosDiretos.length.toLocaleString("pt-BR")} registros`
        );
      } else if (dados.pastaTrabalho) {
        const quantidade = estimarQuantidadeRegistros(
          dados.pastaTrabalho.Sheets[dados.abaSelecionada]
        );
        const resumoQuantidade = quantidade
          ? ` · ${quantidade.toLocaleString("pt-BR")} registros`
          : "";
        informacao.textContent = (
          `✓ ${arquivo.name} · aba ${dados.abaSelecionada || "não identificada"}`
          + resumoQuantidade
        );
      } else {
        informacao.textContent = `✓ ${arquivo.name}`;
      }
      informacao.closest(".upload-card").classList.add("ready");
    }
  } catch (erro) {
    delete estado.arquivos[tipo];
    mostrarErro(erro.message);
    informacao.textContent = "Falha na leitura";
  }
}

function obterRegistros(tipo) {
  const sufixo = tipo === "70" ? "70" : tipo === "600" ? "600" : "Used";
  const arquivo = estado.arquivos[tipo];

  if (arquivo?.registrosDiretos) {
    return arquivo.registrosDiretos;
  }

  if (arquivo?.pastaTrabalho) {
    if (tipo === "used" && obterElemento(`sheet${sufixo}`).value === TODAS_AS_ABAS) {
      return arquivo.nomesAbas.flatMap(
        (nomeAba) => obterLinhasPlanilha(arquivo.pastaTrabalho, nomeAba)
      );
    }

    const seletorAba = obterElemento(`sheet${sufixo}`);
    const abaEscolhida = localizarAbaComDados(arquivo, seletorAba.value);
    const abasParaTestar = [abaEscolhida, ...arquivo.nomesAbas]
      .filter((nome, indice, nomes) => nome && nomes.indexOf(nome) === indice);

    for (const nomeAba of abasParaTestar) {
      const registros = obterLinhasPlanilha(arquivo.pastaTrabalho, nomeAba);

      if (registros.length) {
        arquivo.abaSelecionada = nomeAba;
        seletorAba.value = nomeAba;
        return registros;
      }
    }

    return [];
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
  const textoDiasCompraRecente = limparTexto(obterElemento("recentPurchaseDays").value);
  const limiteDesconto = Number(textoLimiteDesconto);
  const diasInatividade = Number(textoDiasInatividade);
  const diasBloqueioCompraRecente = Number(textoDiasCompraRecente);
  const lojaFinal = normalizarLoja(obterElemento("finalStore").value);

  const configuracao = {
    inicioAcao,
    fimAcao,
    dataCorteHistorico: inicioAcao ? adicionarDias(inicioAcao, -1) : null,
    limiteDesconto,
    diasInatividade,
    diasBloqueioCompraRecente,
    inicioBloqueioCompraRecente: inicioAcao
      ? adicionarDias(inicioAcao, -diasBloqueioCompraRecente)
      : null,
    lojasPermitidas,
    lojaFinal,
    dataMinimaBase: new Date(ANO_INICIAL_BASE, 0, 1),
    totalDesejado: TOTAL_GERAL,
    limitePorCampanha: LIMITE_POR_CAMPANHA
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

  if (!textoDiasCompraRecente
    || !Number.isInteger(diasBloqueioCompraRecente)
    || diasBloqueioCompraRecente < 1
    || diasBloqueioCompraRecente > 365) {
    throw new Error(
      "O bloqueio de compras recentes deve ser informado em dias inteiros, entre 1 e 365."
    );
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
  const dddsPorLoja = mapearDddPredominantePorLoja(base70);

  // Primeiro ficam apenas os clientes que podem entrar na seleção.

  for (const registroOriginal of base70) {
    const registro = criarMapaCabecalhos(registroOriginal);
    const cpf = normalizarCpf(buscarCampo(registro, CAMPOS.cpf));

    if (!cpf) {
      estatisticas.semCpf++;
      continue;
    }

    const loja = normalizarLoja(buscarCampo(registro, CAMPOS.loja));
    const dddPadrao = dddsPorLoja.get(loja) || DDD_PADRAO_OPERACAO;
    const telefones = extrairTelefones(registroOriginal, dddPadrao);

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
      continue;
    }

    if (
      cliente.dataUltimaCompra >= configuracao.inicioBloqueioCompraRecente
      && cliente.dataUltimaCompra <= configuracao.dataCorteHistorico
    ) {
      estatisticas.compraRecente++;
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

  // Faz o pareamento global entre vagas e CPFs, realocando clientes quando necessário.
  function executarPareamento(metasAtuais) {
    const ordemCampanhas = [...CAMPANHAS].sort(
      (primeira, segunda) => (
        quantidadeCandidatos[primeira] - metasAtuais[primeira]
        - (quantidadeCandidatos[segunda] - metasAtuais[segunda])
      )
        || CAMPANHAS.indexOf(primeira) - CAMPANHAS.indexOf(segunda)
    );
    const vagasPareamento = [];
    const maiorMeta = Math.max(...Object.values(metasAtuais));

    for (let posicao = 0; posicao < maiorMeta; posicao++) {
      for (const campanha of ordemCampanhas) {
        if (posicao < metasAtuais[campanha]) {
          vagasPareamento.push({ campanha, cliente: null });
        }
      }
    }

    const vagaPorCpf = new Map();

    function tentarPreencherVaga(vaga, cpfsVisitados) {
      for (const cliente of candidatosPorCampanha[vaga.campanha]) {
        if (cpfsVisitados.has(cliente.cpf)) continue;

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
    for (const vaga of vagasPareamento) {
      if (tentarPreencherVaga(vaga, new Set())) quantidadePreenchida++;
    }

    return { vagas: vagasPareamento, quantidadePreenchida };
  }

  let pareamento = executarPareamento(metasCampanha);
  const redistribuicoesSobreposicao = [];

  // Se metas isoladamente válidas disputarem os mesmos CPFs, transfere somente
  // as vagas que ficaram vazias para campanhas que ainda possuem clientes livres.
  while (pareamento.quantidadePreenchida < TOTAL_GERAL) {
    const cpfsSelecionados = new Set(
      pareamento.vagas.filter((vaga) => vaga.cliente).map((vaga) => vaga.cliente.cpf)
    );
    const campanhasDoadoras = [...new Set(
      pareamento.vagas
        .filter((vaga) => !vaga.cliente)
        .map((vaga) => vaga.campanha)
    )].sort((primeira, segunda) => (
      CAMPANHAS.indexOf(segunda) - CAMPANHAS.indexOf(primeira)
    ));
    const campanhasReceptoras = CAMPANHAS.filter((campanha) => (
      metasCampanha[campanha] < quantidadeCandidatos[campanha]
      && candidatosPorCampanha[campanha].some(
        (cliente) => !cpfsSelecionados.has(cliente.cpf)
      )
    )).sort((primeira, segunda) => (
      metasCampanha[primeira] - metasCampanha[segunda]
      || quantidadeCandidatos[segunda] - metasCampanha[segunda]
        - (quantidadeCandidatos[primeira] - metasCampanha[primeira])
      || CAMPANHAS.indexOf(primeira) - CAMPANHAS.indexOf(segunda)
    ));
    let melhorAjuste = null;

    for (const doadora of campanhasDoadoras) {
      if (metasCampanha[doadora] <= 0) continue;

      for (const receptora of campanhasReceptoras) {
        if (receptora === doadora) continue;

        const metasTeste = { ...metasCampanha };
        metasTeste[doadora]--;
        metasTeste[receptora]++;
        const pareamentoTeste = executarPareamento(metasTeste);

        if (pareamentoTeste.quantidadePreenchida <= pareamento.quantidadePreenchida) {
          continue;
        }

        melhorAjuste = {
          doadora,
          receptora,
          metasTeste,
          pareamento: pareamentoTeste
        };
        break;
      }

      if (melhorAjuste) break;
    }

    if (!melhorAjuste) break;

    Object.assign(metasCampanha, melhorAjuste.metasTeste);
    redistribuicoesSobreposicao.push({
      de: melhorAjuste.doadora,
      para: melhorAjuste.receptora
    });
    pareamento = melhorAjuste.pareamento;
  }

  const { vagas, quantidadePreenchida } = pareamento;

  if (quantidadePreenchida !== TOTAL_GERAL) {
    const cpfsElegiveis = new Set(
      CAMPANHAS.flatMap(
        (campanha) => candidatosPorCampanha[campanha].map((cliente) => cliente.cpf)
      )
    ).size;
    const detalheCandidatos = CAMPANHAS.map(
      (campanha) => (
        `${campanha}: ${quantidadeCandidatos[campanha]} candidatos para `
        + `${metasCampanha[campanha]} vagas`
      )
    ).join("; ");

    throw new Error(
      `Não foi possível formar as ${TOTAL_GERAL} vagas sem repetir CPF. `
      + `O cruzamento preencheu ${quantidadePreenchida} vagas. `
      + `Há ${cpfsElegiveis} CPFs únicos elegíveis no conjunto das campanhas. `
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
  const porCampanha = Object.fromEntries(
    CAMPANHAS.map((campanha) => [
      campanha,
      selecionadosPorCampanha[campanha].map((cliente) => ({
        ...cliente,
        campanha,
        lojaFinal: configuracao.lojaFinal
      }))
    ])
  );
  const baseFinal = CAMPANHAS.flatMap((campanha) => porCampanha[campanha]);

  return {
    porCampanha,
    baseFinal,
    limitePorCampanha: LIMITE_POR_CAMPANHA,
    quantidadeCandidatos,
    metasCampanha,
    redistribuicoesSobreposicao
  };
}

function montarValidacoes(selecao, configuracao, bloqueados) {
  const baseFinal = selecao.baseFinal;
  const cpfsUnicos = new Set(baseFinal.map((cliente) => cliente.cpf));

  return [
    [`Base final possui exatamente ${TOTAL_GERAL} clientes`, baseFinal.length === TOTAL_GERAL],
    [
      "Todos possuem CPF e telefone",
      baseFinal.every((cliente) => cliente.cpf && cliente.telefones.length)
    ],
    [
      "Todos os telefones possuem DDD válido",
      baseFinal.every((cliente) => cliente.telefones.every((telefone) => (
        [10, 11].includes(telefone.length)
        && DDDS_BRASIL.has(telefone.slice(0, 2))
      )))
    ],
    [
      `Nenhuma compra nos ${configuracao.diasBloqueioCompraRecente} dias anteriores à ação`,
      baseFinal.every((cliente) => (
        cliente.dataUltimaCompra < configuracao.inicioBloqueioCompraRecente
      ))
    ],
    [
      `Nenhum dos ${bloqueados.size.toLocaleString("pt-BR")} CPFs bloqueados foi selecionado`,
      baseFinal.every((cliente) => !bloqueados.has(cliente.cpf))
    ],
    [
      "Somente lojas permitidas;",
      baseFinal.every((cliente) => configuracao.lojasPermitidas.has(cliente.loja)
        && cliente.loja !== "ALE")
    ],
    [
      `Todos direcionados para ${configuracao.lojaFinal}`,
      baseFinal.every((cliente) => cliente.lojaFinal === configuracao.lojaFinal)
    ],
    [
      "Base gerada sem vendedora ou responsável pré-atribuída",
      baseFinal.every((cliente) => !Object.prototype.hasOwnProperty.call(cliente, "responsavel"))
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
    const leiturasPendentes = Object.values(estado.leiturasPendentes);

    if (leiturasPendentes.length) {
      atualizarProgresso(2, "Aguardando a leitura completa dos arquivos");
      await Promise.all(leiturasPendentes);
    }

    atualizarProgresso(5, "Lendo arquivos");
    await esperar(80);

    const base70 = obterRegistros("70");
    const base600 = obterRegistros("600");
    validarCabecalhos(base70, "Base 70");
    validarCabecalhos(base600, "Base 600");

    const configuracao = obterConfiguracao();

    atualizarProgresso(22, "Normalizando CPFs e telefones");
    await esperar(50);

    const auditoriaBloqueio = obterAuditoriaCpfsUtilizados();
    const bloqueados = auditoriaBloqueio.cpfs;
    if (!bloqueados.size) {
      throw new Error(
        "Arquivo de CPFs utilizados: nenhum CPF válido foi identificado. "
        + "Confira a aba e as colunas do arquivo carregado."
      );
    }
    const estatisticas = {
      lidosBase70: base70.length,
      lidosBase600: base600.length,
      quantidadeBloqueados: bloqueados.size,
      abasBloqueio: auditoriaBloqueio.abasLidas,
      colunasBloqueio: auditoriaBloqueio.colunasDetectadas,
      ocorrenciasBloqueio: auditoriaBloqueio.ocorrenciasValidas,
      duplicadosBloqueio: auditoriaBloqueio.duplicados,
      invalidosBloqueio: auditoriaBloqueio.valoresInvalidos,
      semCpf: 0,
      semTelefone: 0,
      lojaInvalida: 0,
      bloqueados: 0,
      duplicados: 0,
      semCompraValida: 0,
      ultimaCompraAntesDe2023: 0,
      compraRecente: 0,
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
    const cpfsReutilizados = [...new Set(
      selecao.baseFinal
        .map((cliente) => cliente.cpf)
        .filter((cpf) => bloqueados.has(cpf))
    )];
    if (cpfsReutilizados.length) {
      throw new Error(
        `Falha crítica no bloqueio: ${cpfsReutilizados.length} CPF(s) já utilizado(s) `
        + "chegaram à seleção final. A geração foi cancelada para impedir reenvios."
      );
    }

    const clientesComTelefoneInvalido = selecao.baseFinal.filter(
      (cliente) => !cliente.telefones.length || cliente.telefones.some((telefone) => (
        ![10, 11].includes(telefone.length)
        || !DDDS_BRASIL.has(telefone.slice(0, 2))
      ))
    );
    if (clientesComTelefoneInvalido.length) {
      throw new Error(
        `Falha na padronização: ${clientesComTelefoneInvalido.length} cliente(s) `
        + "ficaram sem telefone com DDD válido. A geração foi cancelada."
      );
    }

    const clientesComCompraRecente = selecao.baseFinal.filter((cliente) => (
      cliente.dataUltimaCompra >= configuracao.inicioBloqueioCompraRecente
    ));
    if (clientesComCompraRecente.length) {
      throw new Error(
        `Falha crítica de recência: ${clientesComCompraRecente.length} cliente(s) `
        + "compraram dentro da carência configurada. A geração foi cancelada."
      );
    }

    const validacoes = montarValidacoes(selecao, configuracao, bloqueados);

    atualizarProgresso(84, "Validando a Base Final");

    estado.resultado = {
      ...selecao,
      clientes,
      estatisticas,
      configuracao,
      bloqueados,
      auditoriaBloqueio,
      validacoes,
      geradoEm: new Date()
    };
    salvarResumoBaseDaLoja();

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
    ["Abas verificadas no bloqueio", estatisticas.abasBloqueio],
    ["Colunas de CPF identificadas", estatisticas.colunasBloqueio],
    ["Ocorrências de CPF lidas no histórico", estatisticas.ocorrenciasBloqueio],
    ["Ocorrências repetidas no histórico", estatisticas.duplicadosBloqueio],
    ["Valores inválidos ignorados no histórico", estatisticas.invalidosBloqueio],
    ["Removidos sem CPF", estatisticas.semCpf],
    ["Removidos sem telefone", estatisticas.semTelefone],
    ["Removidos por loja", estatisticas.lojaInvalida],
    ["Removidos por CPF usado", estatisticas.bloqueados],
    ["Removidos sem compra válida", estatisticas.semCompraValida],
    [
      `Removidos por compra nos últimos ${resultado.configuracao.diasBloqueioCompraRecente} dias`,
      estatisticas.compraRecente
    ],
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
    [
      "Início do bloqueio de compra recente",
      formatarData(resultado.configuracao.inicioBloqueioCompraRecente)
    ],
    ["Loja da base", resultado.configuracao.lojaFinal],
    ["Organização", "Base única, sem divisão por vendedora"],
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
    "LOJA BASE": cliente.lojaFinal,
    "CAMPANHA": cliente.campanha,
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
    `Abas verificadas no bloqueio: ${resultado.estatisticas.abasBloqueio}`,
    `Colunas de CPF identificadas: ${resultado.estatisticas.colunasBloqueio}`,
    `Ocorrências de CPF lidas no histórico: ${resultado.estatisticas.ocorrenciasBloqueio}`,
    `Ocorrências repetidas no histórico: ${resultado.estatisticas.duplicadosBloqueio}`,
    `Valores inválidos ignorados no histórico: ${resultado.estatisticas.invalidosBloqueio}`,
    `Telefones: DDD válido obrigatório; fallback operacional ${DDD_PADRAO_OPERACAO}`,
    `Clientes válidos: ${resultado.estatisticas.validos}`,
    `Sem compra válida: ${resultado.estatisticas.semCompraValida}`,
    `Compra recente removida: ${resultado.estatisticas.compraRecente}`,
    `Carência global: ${resultado.configuracao.diasBloqueioCompraRecente} dias antes da ação`,
    `Última compra anterior a ${ANO_INICIAL_BASE}: ${resultado.estatisticas.ultimaCompraAntesDe2023}`,
    `Base final: ${resultado.baseFinal.length}`,
    `Início mínimo da base: ${formatarData(resultado.configuracao.dataMinimaBase)}`,
    `Período da ação: ${formatarData(resultado.configuracao.inicioAcao)} a ${formatarData(resultado.configuracao.fimAcao)}`,
    `Corte do histórico: ${formatarData(resultado.configuracao.dataCorteHistorico)}`,
    "Próxima Compra: 6 intervalos, IQR, mediana ponderada, margem MAD e limite de recência",
    `Redistribuições por sobreposição de CPF: ${resultado.redistribuicoesSobreposicao.length
      ? resultado.redistribuicoesSobreposicao.map(
        (ajuste) => `${ajuste.de} → ${ajuste.para}`
      ).join("; ")
      : "nenhuma"}`,
    ...CAMPANHAS.map((campanha) => (
      `${campanha}: ${resultado.porCampanha[campanha].length} selecionados de `
      + `${resultado.quantidadeCandidatos[campanha]} candidatos`
    )),
    `Loja da base: ${resultado.configuracao.lojaFinal}`,
    "Organização: base única, sem divisão ou vendedora pré-atribuída",
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
    window.localStorage.removeItem("crmStudio.storeBase.v1");
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

  for (const id of ["referenceDate", "purchaseWindow"]) {
    const campo = obterElemento(id);
    const rotulo = campo.closest("label");

    campo.disabled = true;

    if (rotulo) {
      rotulo.hidden = true;
    }
  }

  for (const id of ["desiredTotal"]) {
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
    ["recentPurchaseDays", 7],
    ["allowedStores", "CGO, SCR, SRO"],
    ["finalStore", "SCR"],
    ["desiredTotal", TOTAL_GERAL]
  ];

  for (const [id, valor] of valoresPadrao) {
    obterElemento(id).value = valor;
  }

  sincronizarDatasAcao();
}

// Exportação no padrão visual das Lojas Hoje

function formatarDataColunaCpfs(data) {
  if (!(data instanceof Date) || isNaN(data)) return "NOVA BASE";
  return `${String(data.getDate()).padStart(2, "0")}/${MESES_ABREVIADOS[data.getMonth()]}`;
}

function montarLinhasCpfsDaBase(clientes, dataEnvio) {
  const cabecalho = formatarDataColunaCpfs(dataEnvio);
  return {
    cabecalho,
    valores: [
      [cabecalho],
      ...clientes.map((cliente) => [
        formatarCpf(cliente.cpf)
      ])
    ]
  };
}

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

  const montarLinhasCampanha = (clientes) => clientes.map((cliente) => ({
    "LOJA BASE": `LOJAS HOJE COM VEST LTDA -${cliente.lojaFinal || resultado.configuracao.lojaFinal || "SCR"}`,
    "TIPO DE CAMPANHA": String(cliente.campanha || "").toLocaleUpperCase("pt-BR"),
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
    "LOJA BASE": 31,
    "TIPO DE CAMPANHA": 22,
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

  function adicionarAbaCpfsDaBase() {
    const dados = montarLinhasCpfsDaBase(
      resultado.baseFinal,
      resultado.configuracao.inicioAcao
    );
    const planilha = XLSX.utils.aoa_to_sheet(dados.valores);
    const intervalo = XLSX.utils.decode_range(planilha["!ref"] || "A1:A1");
    const estiloCabecalhoControle = {
      fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "17365D" } },
        bottom: { style: "thin", color: { rgb: "17365D" } },
        left: { style: "thin", color: { rgb: "D9E2F3" } },
        right: { style: "thin", color: { rgb: "D9E2F3" } }
      }
    };
    const estiloCorpoControle = {
      font: { name: "Arial", sz: 10, color: { rgb: "17212B" } },
      alignment: { horizontal: "left", vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "D9E2F3" } },
        left: { style: "thin", color: { rgb: "D9E2F3" } },
        right: { style: "thin", color: { rgb: "D9E2F3" } }
      }
    };

    for (let linha = intervalo.s.r; linha <= intervalo.e.r; linha++) {
      const endereco = XLSX.utils.encode_cell({ r: linha, c: 0 });
      if (!planilha[endereco]) planilha[endereco] = { t: "s", v: "" };
      planilha[endereco].s = linha === 0
        ? estiloCabecalhoControle
        : estiloCorpoControle;
      planilha[endereco].z = "@";
    }

    planilha["!cols"] = [{ wch: 48 }];
    planilha["!rows"] = Array.from(
      { length: intervalo.e.r + 1 },
      (_, indice) => ({ hpt: indice === 0 ? 22 : 18 })
    );
    planilha["!autofilter"] = { ref: `A1:A${Math.max(1, intervalo.e.r + 1)}` };
    planilha["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen"
    };

    XLSX.utils.book_append_sheet(
      pastaTrabalho,
      planilha,
      "CPFS_DA_BASE"
    );
  }

  const cabecalhosOperacionais = [
    "LOJA BASE",
    "TIPO DE CAMPANHA",
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

  adicionarAbaCpfsDaBase();

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
      "LOJA BASE": cliente.lojaFinal,
      "TIPO DE CAMPANHA": cliente.campanha
    }))
  );

  adicionarAba(
    "RESUMO_PROCESSAMENTO",
    [
      { "INDICADOR": "Registros Base 70", "VALOR": resultado.estatisticas.lidosBase70 },
      { "INDICADOR": "Registros Base 600", "VALOR": resultado.estatisticas.lidosBase600 },
      { "INDICADOR": "CPFs bloqueados", "VALOR": resultado.estatisticas.quantidadeBloqueados },
      { "INDICADOR": "Abas verificadas no bloqueio", "VALOR": resultado.estatisticas.abasBloqueio },
      { "INDICADOR": "Colunas de CPF identificadas", "VALOR": resultado.estatisticas.colunasBloqueio },
      { "INDICADOR": "Ocorrências de CPF lidas no histórico", "VALOR": resultado.estatisticas.ocorrenciasBloqueio },
      { "INDICADOR": "Ocorrências repetidas no histórico", "VALOR": resultado.estatisticas.duplicadosBloqueio },
      { "INDICADOR": "Valores inválidos ignorados no histórico", "VALOR": resultado.estatisticas.invalidosBloqueio },
      { "INDICADOR": "Sem compra válida", "VALOR": resultado.estatisticas.semCompraValida },
      { "INDICADOR": "Removidos por compra recente", "VALOR": resultado.estatisticas.compraRecente },
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
        "CRITÉRIO": "Bloqueio global de compra recente",
        "VALOR": (
          `${resultado.configuracao.diasBloqueioCompraRecente} dias antes da ação; `
          + `compras desde ${formatarData(resultado.configuracao.inicioBloqueioCompraRecente)} são excluídas`
        )
      },
      {
        "CRITÉRIO": "Início mínimo da base",
        "VALOR": formatarData(resultado.configuracao.dataMinimaBase)
      },
      {
        "CRITÉRIO": "Padronização dos telefones",
        "VALOR": `DDD válido obrigatório; DDD ${DDD_PADRAO_OPERACAO} como fallback operacional`
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
        "CRITÉRIO": "Ajustes por sobreposição de CPF",
        "VALOR": resultado.redistribuicoesSobreposicao.length
          ? resultado.redistribuicoesSobreposicao.map(
            (ajuste) => `${ajuste.de} → ${ajuste.para}`
          ).join("; ")
          : "Nenhum ajuste necessário"
      },
      {
        "CRITÉRIO": "Distribuição efetiva das campanhas",
        "VALOR": CAMPANHAS.map(
          (campanha) => `${campanha}: ${resultado.metasCampanha[campanha]}`
        ).join("; ")
      },
      {
        "CRITÉRIO": "Organização da base",
        "VALOR": "Por loja, sem vendedora ou responsável pré-atribuída"
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

function criarResumoBaseDaLoja() {
  if (!estado.resultado) return null;
  return {
    generatedAt: estado.resultado.geradoEm.toISOString(),
    baseStore: estado.resultado.configuracao.lojaFinal,
    totalSent: new Set(estado.resultado.baseFinal.map((cliente) => cliente.cpf)).size,
    groups: [{
      label: estado.resultado.configuracao.lojaFinal,
      sent: new Set(estado.resultado.baseFinal.map((cliente) => cliente.cpf)).size,
      converted: 0,
      notConverted: 0,
      revenue: 0,
      purchases: 0,
      rate: 0
    }]
  };
}

function salvarResumoBaseDaLoja() {
  const resumo = criarResumoBaseDaLoja();
  if (!resumo) return;
  try {
    window.localStorage.setItem(
      "crmStudio.storeBase.v1",
      JSON.stringify(resumo)
    );
  } catch (_) {
    // O painel continua funcionando com o resultado mantido em memória.
  }
}

function obterResumoBaseDaLoja() {
  const resumoAtual = criarResumoBaseDaLoja();
  if (resumoAtual) return resumoAtual;
  try {
    const resumoSalvo = window.localStorage.getItem("crmStudio.storeBase.v1");
    return resumoSalvo ? JSON.parse(resumoSalvo) : null;
  } catch (_) {
    return null;
  }
}

window.CampaignStudio = Object.freeze({
  getStoreBaseSummary: obterResumoBaseDaLoja
});

// Liga os controles da página às funções acima.

for (const tipoTela of ["70", "600", "Used"]) {
  const tipoInterno = tipoTela === "Used" ? "used" : tipoTela;

  obterElemento(`file${tipoTela}`).addEventListener("change", (evento) => {
    const arquivo = evento.target.files[0];

    if (arquivo) {
      const leitura = carregarFonte(tipoInterno, arquivo);
      estado.leiturasPendentes[tipoInterno] = leitura;
      leitura.finally(() => {
        if (estado.leiturasPendentes[tipoInterno] === leitura) {
          delete estado.leiturasPendentes[tipoInterno];
        }
      });
    }
  });

  obterElemento(`sheet${tipoTela}`).addEventListener("change", (evento) => {
    selecionarAbaDoArquivo(tipoInterno, evento.target.value);
  });
}

obterElemento("sheetUsed").addEventListener("change", atualizarResumoCpfsUtilizados);
obterElemento("txtUsed").addEventListener("input", () => {
  const texto = obterElemento("txtUsed").value;
  if (!limparTexto(texto)) return;

  estado.arquivos.used = {
    texto,
    nomeArquivo: "Dados colados"
  };
  obterElemento("sheetUsed").classList.add("hidden");
  atualizarResumoCpfsUtilizados();
});

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
