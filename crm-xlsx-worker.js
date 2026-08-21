"use strict";

// Leitura isolada das planilhas grandes da Base 600.

importScripts(
  "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"
);

const TAMANHO_LOTE = 10000;
const LINHAS_CABECALHO_ANALISADAS = 20;

const CAMPOS_BASE_600 = Object.freeze({
  cpf: ["cpf", "cpfcliente", "documento", "cnpjcpf"],
  dataCompra: ["datacompra", "datavenda", "dataemissao", "data", "dtvenda"],
  valorCompra: ["valorvenda", "valordavenda", "valortotal", "valorcompra", "total", "valor"],
  desconto: ["desconto", "descontoproduto", "valordesconto", "descontototal"]
});

function criarChave(valor) {
  return String(valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((palavra) => palavra && !["de", "da", "do", "das", "dos"].includes(palavra))
    .join("");
}

function localizarIndice(cabecalhos, nomesAceitos) {
  const chavesAceitas = new Set(nomesAceitos.map(criarChave));
  return cabecalhos.findIndex((cabecalho) => chavesAceitas.has(criarChave(cabecalho)));
}

function lerLinha(planilha, linha, colunaInicial, colunaFinal) {
  return XLSX.utils.sheet_to_json(planilha, {
    header: 1,
    range: {
      s: { r: linha, c: colunaInicial },
      e: { r: linha, c: colunaFinal }
    },
    defval: "",
    raw: true,
    blankrows: true
  })[0] || [];
}

function localizarCabecalho(planilha) {
  const intervalo = XLSX.utils.decode_range(planilha["!ref"] || "A1:A1");
  const ultimaLinha = Math.min(
    intervalo.e.r,
    intervalo.s.r + LINHAS_CABECALHO_ANALISADAS - 1
  );
  let melhor = null;

  for (let linha = intervalo.s.r; linha <= ultimaLinha; linha++) {
    const cabecalhos = lerLinha(planilha, linha, intervalo.s.c, intervalo.e.c);
    const indices = {
      cpf: localizarIndice(cabecalhos, CAMPOS_BASE_600.cpf),
      dataCompra: localizarIndice(cabecalhos, CAMPOS_BASE_600.dataCompra),
      valorCompra: localizarIndice(cabecalhos, CAMPOS_BASE_600.valorCompra),
      desconto: localizarIndice(cabecalhos, CAMPOS_BASE_600.desconto)
    };
    const pontuacao = [indices.cpf, indices.dataCompra, indices.valorCompra]
      .filter((indice) => indice >= 0).length;

    if (!melhor || pontuacao > melhor.pontuacao) {
      melhor = { linha, cabecalhos, indices, pontuacao, intervalo };
    }

    if (pontuacao === 3) {
      break;
    }
  }

  return melhor;
}

function escolherAba(pastaTrabalho) {
  let escolhida = null;

  for (const nomeAba of pastaTrabalho.SheetNames) {
    const planilha = pastaTrabalho.Sheets[nomeAba];
    if (!planilha?.["!ref"]) continue;

    const cabecalho = localizarCabecalho(planilha);
    const quantidade = Math.max(
      0,
      cabecalho.intervalo.e.r - cabecalho.linha
    );
    const pontuacao = cabecalho.pontuacao * 10000000 + quantidade;

    if (!escolhida || pontuacao > escolhida.pontuacao) {
      escolhida = { nomeAba, planilha, cabecalho, quantidade, pontuacao };
    }
  }

  return escolhida;
}

function validarCabecalho(escolhida) {
  if (!escolhida || escolhida.cabecalho.pontuacao < 3) {
    const encontrados = escolhida?.cabecalho.cabecalhos
      .filter((valor) => String(valor ?? "").trim())
      .slice(0, 12)
      .join(", ") || "nenhum";

    throw new Error(
      "Base 600: não foi possível identificar CPF, Data da compra e Valor da venda. "
      + `Cabeçalhos encontrados: ${encontrados}.`
    );
  }
}

function enviarRegistros(escolhida) {
  const { planilha, cabecalho, nomeAba } = escolhida;
  const { intervalo, indices } = cabecalho;
  const inicioDados = cabecalho.linha + 1;
  let processados = 0;
  let enviados = 0;

  for (let inicio = inicioDados; inicio <= intervalo.e.r; inicio += TAMANHO_LOTE) {
    const fim = Math.min(intervalo.e.r, inicio + TAMANHO_LOTE - 1);
    const matriz = XLSX.utils.sheet_to_json(planilha, {
      header: 1,
      range: {
        s: { r: inicio, c: intervalo.s.c },
        e: { r: fim, c: intervalo.e.c }
      },
      defval: "",
      raw: true,
      blankrows: false
    });
    const linhas = [];

    for (const valores of matriz) {
      const cpf = valores[indices.cpf];
      const dataCompra = valores[indices.dataCompra];
      const valorCompra = valores[indices.valorCompra];

      if (
        String(cpf ?? "").trim() === ""
        && String(dataCompra ?? "").trim() === ""
        && String(valorCompra ?? "").trim() === ""
      ) {
        continue;
      }

      linhas.push([
        cpf ?? "",
        dataCompra ?? "",
        valorCompra ?? "",
        indices.desconto >= 0 ? valores[indices.desconto] ?? "" : ""
      ]);
    }

    processados += fim - inicio + 1;
    enviados += linhas.length;
    self.postMessage({
      tipo: "lote",
      nomeAba,
      linhas,
      processados,
      total: escolhida.quantidade
    });
  }

  self.postMessage({
    tipo: "concluido",
    nomeAba,
    quantidade: enviados
  });
}

self.onmessage = (evento) => {
  try {
    self.postMessage({ tipo: "progresso", etapa: "Abrindo a planilha grande" });

    const pastaTrabalho = XLSX.read(evento.data.buffer, {
      type: "array",
      dense: true,
      cellDates: false,
      cellText: false,
      cellStyles: false,
      cellNF: false,
      bookVBA: false,
      bookFiles: false
    });
    const escolhida = escolherAba(pastaTrabalho);

    validarCabecalho(escolhida);
    self.postMessage({
      tipo: "progresso",
      etapa: `Lendo ${escolhida.quantidade.toLocaleString("pt-BR")} registros`
    });
    enviarRegistros(escolhida);
  } catch (erro) {
    self.postMessage({
      tipo: "erro",
      mensagem: erro?.message || "Não foi possível ler a Base 600."
    });
  }
};
