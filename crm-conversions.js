/* CRM Studio - Conversões e Insights
 * Todo o processamento acontece no navegador.
 */

(function (janela, documento) {
  "use strict";

  const MILISSEGUNDOS_POR_DIA = 86400000;
  const LIMITE_LINHAS_TABELA = 200;
  const LIMITE_ERROS = 50000;
  const LIMITE_DUPLICIDADES = 100000;
  const ORDEM_FONTES = ["sent", "base600", "base70"];
  const METADADOS_FONTES = {
    sent: { suffix: "Sent", label: "Arquivo de CPFs enviados", badge: "CPF", description: "Datas no topo das colunas e CPFs abaixo" },
    base600: { suffix: "600", label: "Base 600 atualizada", badge: "600", description: "Compras e vendas realizadas" },
    base70: { suffix: "70", label: "Base 70 atualizada", badge: "70", description: "Cadastro e dados complementares" }
  };


  const DEFINICOES_CAMPOS = {
    sent: [
      definirCampo("cpf", "CPF", true, ["cpf", "cpf cliente", "cpfcliente", "documento", "documento cliente", "documentocliente", "cnpj cpf", "cpf cnpj"]),
      definirCampo("campaign", "Campanha", false, ["campanha", "tipo campanha", "tipo de campanha", "classificacao", "classificação", "grupo", "acao", "ação"]),
      definirCampo("sendDate", "Data de envio", false, ["data envio", "data de envio", "data envio base", "data da base", "data campanha", "envio", "dt envio"]),
      definirCampo("responsible", "Responsável", false, ["responsavel", "responsável", "vendedora", "vendedor", "consultora", "consultor", "gerente"]),
      definirCampo("name", "Nome", false, ["nome", "nome cliente", "cliente", "razao social", "razão social"]),
      definirCampo("phone1", "Telefone 1", false, ["telefone", "telefone 1", "tel 1", "tel1", "celular", "fone", "fone contato 1", "fone de contato 1", "whatsapp"]),
      definirCampo("phone2", "Telefone 2", false, ["telefone 2", "tel 2", "tel2", "celular 2", "fone 2", "fone contato 2", "fone de contato 2"]),
      definirCampo("storeOriginal", "Loja original", false, ["loja original", "loja origem", "filial origem", "origem loja"]),
      definirCampo("storeFinal", "Loja final", false, ["loja final", "loja destino", "filial destino", "destino", "loja"]),
      definirCampo("origin", "Origem do cliente", false, ["origem cliente", "origem do cliente", "origem", "fonte"])
    ],
    base600: [
      definirCampo("cpf", "CPF", true, ["cpf", "cpf cliente", "cpfcliente", "documento", "documento cliente", "documentocliente", "cnpj cpf", "cpf cnpj"]),
      definirCampo("purchaseDate", "Data da compra", true, ["data compra", "data da compra", "data venda", "data da venda", "data movimento", "data movimentacao", "data emissão", "data emissao", "dt venda", "data"]),
      definirCampo("saleValue", "Valor da venda", true, ["valor da venda", "valor venda", "valor compra", "total venda", "receita", "valor total", "vl venda", "valor"]),
      definirCampo("discount", "Desconto", false, ["desconto", "desconto produto", "valor desconto", "desconto total", "vl desconto"]),
      definirCampo("seller", "Vendedor real da compra", true, ["vendedor", "vendedora", "consultor", "consultora", "responsavel venda", "responsável venda", "vendedor da venda", "vendedor venda", "vendedor compra", "colaborador", "funcionario", "funcionário", "nome vendedor", "nome do vendedor"]),
      definirCampo("store", "Loja da compra", false, ["loja", "filial", "unidade", "empresa", "loja venda", "filial venda", "codigo loja", "código loja", "local venda"]),
      definirCampo("product", "Produto", false, ["produto", "descricao produto", "descrição produto", "item", "mercadoria"])
    ],
    base70: [
      definirCampo("cpf", "CPF", true, ["cpf", "cpf cliente", "cpfcliente", "documento", "documento cliente", "documentocliente", "cnpj cpf", "cpf cnpj"]),
      definirCampo("name", "Nome", false, ["nome", "nome cliente", "cliente", "razao social", "razão social"]),
      definirCampo("phone1", "Telefone 1", false, ["telefone", "telefone 1", "tel 1", "tel1", "celular", "fone", "fone contato 1", "fone de contato 1", "whatsapp"]),
      definirCampo("phone2", "Telefone 2", false, ["telefone 2", "tel 2", "tel2", "celular 2", "fone 2", "fone contato 2", "fone de contato 2"]),
      definirCampo("store", "Loja/filial", false, ["loja", "filial", "loja original", "empresa"]),
      definirCampo("birthDate", "Data de nascimento", false, ["data nascimento", "data de nascimento", "nascimento", "dt nascimento"]),
      definirCampo("lastPurchase", "Data da última compra", false, ["data ultima compra", "data da ultima compra", "última compra", "ultima compra", "dt ultima compra"]),
      definirCampo("totalPurchased", "Valor total comprado", false, ["valor total comprado", "total comprado", "valor total compras", "total compras"]),
      definirCampo("coupons", "Quantidade de cupons", false, ["quantidade cupons", "qtd cupons", "numero cupons", "n cupons", "cupons"]),
      definirCampo("averageTicket", "Ticket médio", false, ["ticket medio", "ticket médio", "valor medio", "valor médio"]),
      definirCampo("professionalClass", "Classe profissional", false, ["classe profissional", "profissao", "profissão", "ocupacao", "ocupação"]),
      definirCampo("lastSeller", "Vendedor da última compra", false, ["vendedor ultima compra", "vendedor da ultima compra", "ultima vendedora", "última vendedora", "vendedor", "vendedora", "consultor", "consultora"])
    ]
  };

  // Estado mantido enquanto o usuário trabalha com as três bases.

  let estado = criarEstadoInicial();

  function definirCampo(chave, rotulo, obrigatorio, apelidos) {
    return { key: chave, label: rotulo, required: obrigatorio, aliases: apelidos };
  }

  function criarEstadoInicial(elementoRaiz) {
    return {
      container: elementoRaiz || null,
      initialized: false,
      sources: {
        sent: criarFonteInicial("sent"),
        base600: criarFonteInicial("base600"),
        base70: criarFonteInicial("base70")
      },
      result: null,
      errors: [],
      errorOverflow: 0,
      duplicates: [],
      duplicateOverflow: 0,
      charts: new Map(),
      logs: [],
      renderTimer: 0,
      processing: false
    };
  }

  function criarFonteInicial(tipoFonte) {
    return {
      kind: tipoFonte,
      file: null,
      workbook: null,
      sheetName: "",
      headerRow: 0,
      headers: [],
      mapping: {},
      teamAssignmentGroups: [],
      preview: [],
      estimatedRows: 0,
      wideMode: false,
      wideColumns: [],
      dateCorrections: [],
      dateCorrectionHints: new Map()
    };
  }

  // Atalhos usados em todo o módulo.

  const obterElemento = (identificador) => documento.getElementById(identificador);
  const limparTexto = (valor) => String(valor == null ? "" : valor).trim();
  const estaVazio = (valor) => valor == null || limparTexto(valor) === "";

  function removerAcentos(valor) {
    return limparTexto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalizarTexto(valor) {
    return removerAcentos(valor).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function nomesCorrespondem(primeiro, segundo) {
    const a = normalizarTexto(primeiro);
    const b = normalizarTexto(segundo);
    if (!a || !b) return false;
    return a === b || a.split(" ")[0] === b.split(" ")[0];
  }

  function classificarConversao(registro, compra, origemVendedor) {
    if (!compra) return { type: "not-converted", label: "NÃO CONVERTIDO", own: false };
    const outraLoja = Boolean(normalizarLoja(registro.storeFinal) && normalizarLoja(compra.store) && normalizarLoja(registro.storeFinal) !== normalizarLoja(compra.store));
    if (!compra.seller || origemVendedor !== "Base 600") return { type: "unidentified", label: "CONVERSÃO SEM VENDEDOR IDENTIFICADO", own: false, otherStore: outraLoja };
    if (outraLoja) return { type: "other-store", label: "CONVERSÃO DE OUTRA LOJA", own: false, otherStore: true };
    if (nomesCorrespondem(registro.responsible, compra.seller)) return { type: "own", label: "CONVERSÃO DO RESPONSÁVEL", own: true, otherStore: false };
    return { type: "other-seller", label: "CONVERSÃO DE OUTRO VENDEDOR", own: false, otherStore: false };
  }

  function normalizarCabecalho(valor) {
    const palavrasIgnoradas = new Set(["de", "da", "do", "das", "dos", "e"]);
    return normalizarTexto(valor)
      .split(/\s+/)
      .filter((parte) => parte && !palavrasIgnoradas.has(parte))
      .join("");
  }

  function normalizarCpf(valor) {
    if (valor == null || limparTexto(valor) === "") return "";
    let digitos;
    if (typeof valor === "number" && Number.isFinite(valor)) {
      digitos = String(Math.trunc(Math.abs(valor)));
    } else {
      digitos = limparTexto(valor).replace(/\D/g, "");
    }
    if (!digitos || digitos.length < 9 || digitos.length > 11) return "";
    return digitos.padStart(11, "0");
  }

  // O arquivo de controle pode trazer apenas o CPF ou "CPF - VENDEDORA".
  function separarCpfEResponsavel(valor) {
    const texto = limparTexto(valor);
    if (!texto) return { cpf: "", responsavel: "" };

    const correspondencia = texto.match(
      /^\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{9,11})(?:\s*[-–—|;:]\s*(.+?))?\s*$/
    );
    if (!correspondencia) return { cpf: normalizarCpf(valor), responsavel: "" };

    return {
      cpf: normalizarCpf(correspondencia[1]),
      responsavel: limparTexto(correspondencia[2])
    };
  }

  function normalizarTelefone(valor) {
    let digitos = limparTexto(valor).replace(/\D/g, "");
    if (digitos.startsWith("55") && digitos.length >= 12) digitos = digitos.slice(2);
    return digitos.length >= 8 && digitos.length <= 11 ? digitos : "";
  }

  function normalizarLoja(valor) {
    const textoOriginal = removerAcentos(valor).toUpperCase();
    for (const codigo of ["ALE", "CGO", "SCR", "SRO"]) {
      if (new RegExp(`(^|[^A-Z0-9])${codigo}($|[^A-Z0-9])`).test(textoOriginal)) return codigo;
    }
    return limparTexto(valor);
  }

  function formatarCpf(valor) {
    const digitos = normalizarCpf(valor);
    return digitos ? digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";
  }

  function formatarTelefone(valor) {
    const digitos = normalizarTelefone(valor);
    if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
    if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
    if (digitos.length === 9) return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
    if (digitos.length === 8) return `${digitos.slice(0, 4)}-${digitos.slice(4)}`;
    return limparTexto(valor);
  }

  function criarData(ano, mes, dia) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
    return data;
  }

  function interpretarDataBrasileira(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      return criarData(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
    }
    if (typeof valor === "number" && Number.isFinite(valor)) {
      if (janela.XLSX && janela.XLSX.SSF && typeof janela.XLSX.SSF.parse_date_code === "function") {
        const dataInterpretada = janela.XLSX.SSF.parse_date_code(valor);
        return dataInterpretada ? criarData(dataInterpretada.y, dataInterpretada.m, dataInterpretada.d) : null;
      }
      return null;
    }
    const texto = limparTexto(valor);
    if (!texto) return null;
    if (/^\d{4,6}(?:\.\d+)?$/.test(texto) && janela.XLSX && janela.XLSX.SSF) {
      const dataInterpretada = janela.XLSX.SSF.parse_date_code(Number(texto));
      if (dataInterpretada) return criarData(dataInterpretada.y, dataInterpretada.m, dataInterpretada.d);
    }
    let partes = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s|T|$)/);
    if (partes) {
      let ano = Number(partes[3]);
      if (ano < 100) ano += ano >= 70 ? 1900 : 2000;
      return criarData(ano, Number(partes[2]), Number(partes[1]));
    }
    partes = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|T|$)/);
    if (partes) return criarData(Number(partes[1]), Number(partes[2]), Number(partes[3]));

    const meses = {
      jan: 1, janeiro: 1,
      fev: 2, fevereiro: 2,
      mar: 3, marco: 3,
      abr: 4, abril: 4,
      mai: 5, maio: 5,
      jun: 6, junho: 6,
      jul: 7, julho: 7,
      ago: 8, agosto: 8,
      set: 9, setembro: 9,
      out: 10, outubro: 10,
      nov: 11, novembro: 11,
      dez: 12, dezembro: 12
    };
    const textoComMes = removerAcentos(texto).toLowerCase().replace(/\./g, "");
    partes = textoComMes.match(/^(\d{1,2})\s*[\/-]\s*([a-z]{3,9})(?:\s*[\/-]\s*(\d{2,4}))?(?:\s|$)/);
    if (partes && meses[partes[2]]) {
      let ano = partes[3] ? Number(partes[3]) : new Date().getUTCFullYear();
      if (ano < 100) ano += ano >= 70 ? 1900 : 2000;
      return criarData(ano, meses[partes[2]], Number(partes[1]));
    }
    return null;
  }

  function calcularMediana(numeros) {
    if (!numeros.length) return 0;
    const ordenados = [...numeros].sort((primeiro, segundo) => primeiro - segundo);
    const meio = Math.floor(ordenados.length / 2);
    return ordenados.length % 2
      ? ordenados[meio]
      : (ordenados[meio - 1] + ordenados[meio]) / 2;
  }

  function deslocarMesPreservandoDia(data, quantidadeMeses) {
    const dia = data.getUTCDate();
    const candidata = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + quantidadeMeses, dia));
    return candidata.getUTCDate() === dia ? candidata : null;
  }

  // Corrige apenas uma quebra evidente em uma sequência regular de datas.
  // Exemplo: 15/jun, 22/jun, 29/jun, 06/jul, 13/jul, 20/jun -> 20/jul.
  function ajustarDatasForaDeSequencia(colunas) {
    if (colunas.length < 3) return colunas;

    const intervalosValidos = [];
    for (let indice = 1; indice < colunas.length; indice += 1) {
      const intervalo = calcularDiferencaDias(colunas[indice].date, colunas[indice - 1].date);
      if (intervalo > 0 && intervalo <= 31) intervalosValidos.push(intervalo);
    }
    if (intervalosValidos.length < 2) return colunas;

    const intervaloEsperado = calcularMediana(intervalosValidos);
    const tolerancia = Math.max(2, Math.round(intervaloEsperado * 0.25));
    const ajustadas = colunas.map((coluna) => ({ ...coluna }));

    for (let indice = 1; indice < ajustadas.length; indice += 1) {
      const anterior = ajustadas[indice - 1].date;
      const atual = ajustadas[indice];
      if (atual.date > anterior) continue;

      let candidata = null;
      for (let meses = 1; meses <= 12; meses += 1) {
        const dataDoMes = deslocarMesPreservandoDia(atual.date, meses);
        if (!dataDoMes) continue;
        candidata = dataDoMes;
        if (candidata > anterior) break;
      }
      if (!candidata || candidata <= anterior) continue;

      const intervaloCorrigido = calcularDiferencaDias(candidata, anterior);
      if (Math.abs(intervaloCorrigido - intervaloEsperado) > tolerancia) continue;

      atual.originalDate = atual.date;
      atual.date = candidata;
      atual.adjusted = true;
    }
    return ajustadas;
  }

  function interpretarMoedaBrasileira(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    let texto = limparTexto(valor);
    if (!texto) return null;
    const negativo = /^\(.*\)$/.test(texto) || /^-/.test(texto);
    texto = texto.replace(/[()]/g, "").replace(/R\$/gi, "").replace(/\s|\u00a0/g, "").replace(/[^\d,.-]/g, "");
    texto = texto.replace(/-/g, "");
    if (!texto) return null;
    const posicaoVirgula = texto.lastIndexOf(",");
    const posicaoPonto = texto.lastIndexOf(".");
    if (posicaoVirgula >= 0 && posicaoPonto >= 0) {
      const separadorDecimal = posicaoVirgula > posicaoPonto ? "," : ".";
      const separadorMilhar = separadorDecimal === "," ? /\./g : /,/g;
      texto = texto.replace(separadorMilhar, "").replace(separadorDecimal, ".");
    } else if (posicaoVirgula >= 0) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else if ((texto.match(/\./g) || []).length > 1) {
      texto = texto.replace(/\./g, "");
    } else if (posicaoPonto >= 0) {
      const casasDecimais = texto.length - posicaoPonto - 1;
      if (casasDecimais === 3 && posicaoPonto <= 3) texto = texto.replace(".", "");
    }
    const numero = Number(texto);
    return Number.isFinite(numero) ? (negativo ? -numero : numero) : null;
  }

  function formatarData(data) {
    if (!(data instanceof Date) || Number.isNaN(data.getTime())) return "";
    return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}/${data.getUTCFullYear()}`;
  }

  function criarChaveData(data) {
    if (!(data instanceof Date) || Number.isNaN(data.getTime())) return "";
    return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(data.getUTCDate()).padStart(2, "0")}`;
  }

  function adicionarDias(data, quantidade) {
    return new Date(data.getTime() + Number(quantidade) * MILISSEGUNDOS_POR_DIA);
  }

  function calcularDiferencaDias(dataPosterior, dataAnterior) {
    return Math.round((dataPosterior.getTime() - dataAnterior.getTime()) / MILISSEGUNDOS_POR_DIA);
  }

  const formatadorMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const formatadorNumero = new Intl.NumberFormat("pt-BR");
  const formatadorDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatarMoeda = (valor) => formatadorMoeda.format(Number(valor) || 0);
  const formatarNumero = (valor) => formatadorNumero.format(Number(valor) || 0);
  const formatarPercentual = (valor) => `${formatadorDecimal.format(Number(valor) || 0)}%`;

  function escaparHtml(valor) {
    return limparTexto(valor).replace(/[&<>"']/g, (caractere) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[caractere]));
  }

  function limitarTexto(valor, tamanho) {
    const texto = limparTexto(valor);
    return texto.length > tamanho ? `${texto.slice(0, tamanho - 1)}…` : texto;
  }

  // Montagem da interface

  function montarCartaoFonte(tipoFonte) {
    const metadados = METADADOS_FONTES[tipoFonte];
    return `<article class="upload-card conv-upload-card" data-conv-source="${tipoFonte}">
      <div class="upload-icon">${metadados.badge}</div>
      <div class="upload-copy"><h3>${metadados.label}</h3><p>${metadados.description}</p></div>
      <label class="file-btn">Selecionar arquivo<input id="convFile${metadados.suffix}" type="file" accept=".xlsx,.xls,.csv,.txt,.tsv"></label>
      <select id="convSheet${metadados.suffix}" class="sheet hidden" aria-label="Aba de ${metadados.label}"></select>
      <span id="convInfo${metadados.suffix}" class="file-status">Nenhum arquivo selecionado</span>
      <details id="convMapDetails${metadados.suffix}" class="conv-map-details hidden"><summary>Conferir mapeamento de colunas</summary><div id="convMap${metadados.suffix}" class="conv-map-grid"></div></details>
      <details id="convPreviewDetails${metadados.suffix}" class="conv-preview-details hidden"><summary>Prévia dos dados</summary><div id="convPreview${metadados.suffix}" class="table-wrap conv-mini-preview"></div></details>
    </article>`;
  }

  function montarCartaoGrafico(identificador, titulo, descricao) {
    return `<article class="panel conv-chart-card"><div class="conv-chart-head"><h3>${titulo}</h3><p>${descricao}</p></div><div class="conv-chart-body"><canvas id="${identificador}" role="img" aria-label="${titulo}"></canvas></div></article>`;
  }

  function montarEstrutura() {
    return `<div class="conv-module">
      <section class="section conv-intro" aria-labelledby="convTitle">
        <div class="section-head"><div><span class="kicker">Acompanhamento de resultados</span><h2 id="convTitle">Conversões e Insights</h2><p>Cruze as campanhas enviadas com as compras atualizadas e acompanhe o retorno real.</p></div><button id="convClearBtn" class="link-btn" type="button">Limpar módulo</button></div>
        <div class="conv-privacy" role="note"><strong>Privacidade local</strong><span>Os arquivos são processados somente neste navegador. Nenhum CPF, telefone ou resultado é enviado pela internet.</span></div>
      </section>

      <section class="section" aria-labelledby="convUploadTitle">
        <div class="section-head"><div><span class="kicker">1. Fontes</span><h2 id="convUploadTitle">Carregue os CPFs e as bases atualizadas</h2><p>No arquivo de CPFs, cada coluna pode começar com a data de envio e conter os CPFs logo abaixo.</p></div></div>
        <div class="upload-grid conv-upload-grid">${ORDEM_FONTES.map(montarCartaoFonte).join("")}</div>
      </section>

      <section class="section" aria-labelledby="convParamsTitle">
        <div class="section-head"><div><span class="kicker">2. Parâmetros</span><h2 id="convParamsTitle">Defina a janela de conversão</h2><p>A compra só conta quando ocorre no dia do envio ou depois, dentro da janela escolhida.</p></div></div>
        <div class="config-grid conv-parameter-grid">
          <fieldset><legend>Data e janela</legend><div class="fields">
            <label>Data inicial do período<input id="convPeriodStart" type="date" value="2026-06-15"></label>
            <label>Data final do período<input id="convPeriodEnd" type="date"></label>
            <label id="convManualDateWrap">Data padrão de envio<input id="convManualDate" type="date"><small id="convManualDateHelp">Usada quando o arquivo não possui datas na primeira linha.</small></label>
            <label>Modo de análise<select id="convWindow"><option value="3650" selected>Conversão Geral Acumulada</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option><option value="60">60 dias</option><option value="custom">Janela personalizada</option></select></label>
            <label id="convCustomDaysWrap" class="hidden">Quantidade de dias<input id="convCustomDays" type="number" min="1" max="3650" value="30"></label>
          </div></fieldset>
          <fieldset><legend>Regra aplicada</legend><div class="conv-rule-box"><div class="conv-rule-step"><i>1</i><span><small>Início válido</small><strong>Compra ≥ data de envio</strong></span></div><b aria-hidden="true">↓</b><div class="conv-rule-step"><i>2</i><span><small>Limite do período</small><strong>Compra ≤ data final analisada</strong></span></div><p><i aria-hidden="true">✓</i> Compras anteriores ao envio são identificadas para auditoria, mas nunca entram na conversão.</p></div></fieldset>
        </div>
        <div class="action-bar conv-action-bar"><div><strong>Pronto para medir seus resultados?</strong><span>O cruzamento atribui cada compra ao envio válido mais recente, sem duplicar conversões.</span></div><button id="convCalculateBtn" class="primary primary-cta" type="button"><span>Calcular Conversão Geral</span><b aria-hidden="true">→</b></button></div>
        <div id="convProgress" class="progress hidden" aria-live="polite"><div><span id="convProgressLabel">Preparando...</span><strong id="convProgressValue">0%</strong></div><div class="track"><i id="convProgressBar"></i></div></div>
        <div id="convAlert" class="alert hidden" role="alert"></div>
        <div id="convLogs" class="conv-logs hidden" aria-live="polite"></div>
      </section>

      <section id="convResults" class="section hidden" aria-labelledby="convResultsTitle">
        <div class="section-head"><div><span class="kicker">3. Resultado</span><h2 id="convResultsTitle">Painel de conversões</h2><p id="convResultSummary"></p></div><div class="conv-result-actions"><button id="convLogBtn" class="secondary" type="button" disabled>Baixar log</button><button id="convExportBtn" class="primary" type="button" disabled>Exportar Excel</button></div></div>

        <article class="panel conv-filter-panel"><div class="panel-head"><div><h3>Filtros da análise</h3><p>Indicadores, gráficos, insights e tabelas respondem aos filtros abaixo.</p></div><button id="convResetFilters" class="secondary" type="button">Limpar filtros</button></div>
          <div class="conv-filter-grid">
            <label>Envio inicial<input id="convFilterDateFrom" type="date"></label>
            <label>Envio final<input id="convFilterDateTo" type="date"></label>
            <label>Campanha<select id="convFilterCampaign"><option value="">Todas</option></select></label>
            <label>Responsável<select id="convFilterResponsible"><option value="">Todos</option></select></label>
            <label>Vendedor real<select id="convFilterSeller"><option value="">Todos</option></select></label>
            <label>Loja original<select id="convFilterStore"><option value="">Todas</option></select></label>
            <label>Loja da compra<select id="convFilterPurchaseStore"><option value="">Todas</option></select></label>
            <label>Tipo de conversão<select id="convFilterType"><option value="">Todos</option><option value="own">Conversão própria</option><option value="other-seller">Outro vendedor</option><option value="other-store">Outra loja</option><option value="unidentified">Sem vendedor identificado</option><option value="not-converted">Não convertido</option></select></label>
            <label>Status<select id="convFilterStatus"><option value="">Todos</option><option value="converted">Convertidos</option><option value="not-converted">Não convertidos</option></select></label>
            <label>Tempo até conversão<select id="convFilterTime"><option value="">Toda a janela</option><option value="same">Mesmo dia</option><option value="7">Até 7 dias</option><option value="15">Até 15 dias</option><option value="30">Até 30 dias</option><option value="over30">Acima de 30 dias</option></select></label>
            <label>Buscar cliente<input id="convFilterSearch" type="search" placeholder="Nome, CPF, telefone..."></label>
          </div>
        </article>

        <div id="convKpis" class="metrics conv-kpis"></div>
        <article class="panel conv-insight-panel"><div class="panel-head"><div><h3>Insights automáticos</h3><p>Leituras objetivas geradas a partir do recorte atual.</p></div></div><div id="convInsights" class="conv-insights"></div></article>

        <div class="conv-charts-grid">
          ${montarCartaoGrafico("convChartRateDate", "Conversão por data de envio", "Taxa de conversão de cada base enviada")}
          ${montarCartaoGrafico("convChartRevenueDate", "Receita por data de envio", "Receita atribuída a cada data de envio")}
          ${montarCartaoGrafico("convChartRateCampaign", "Conversão por campanha", "Comparativo de taxa entre campanhas")}
          ${montarCartaoGrafico("convChartRevenueCampaign", "Receita por campanha", "Valor gerado por tipo de campanha")}
          ${montarCartaoGrafico("convChartRateResponsible", "Conversão por responsável", "Desempenho de cada responsável")}
          ${montarCartaoGrafico("convChartRevenueResponsible", "Receita por responsável", "Receita atribuída por responsável")}
          ${montarCartaoGrafico("convChartRateStore", "Conversão por loja original", "Origem dos clientes com maior conversão")}
          ${montarCartaoGrafico("convChartFunnel", "Funil de conversão", "Da base enviada à compra convertida")}
          ${montarCartaoGrafico("convChartTime", "Tempo após o envio", "Distribuição do prazo até a primeira compra")}
          ${montarCartaoGrafico("convChartDaily", "Evolução diária", "Conversões registradas em cada dia")}
          ${montarCartaoGrafico("convChartDailyRevenue", "Receita por data da compra", "Receita registrada na primeira conversão")}
          ${montarCartaoGrafico("convChartSeller", "Conversões por vendedor real", "Vendas atribuídas ao vendedor da Base 600")}
          ${montarCartaoGrafico("convChartSellerRevenue", "Receita por vendedor real", "Receita efetivamente realizada por vendedor")}
          ${montarCartaoGrafico("convChartAttribution", "Próprias versus outros", "Separação da atribuição das conversões")}
          ${montarCartaoGrafico("convChartPurchaseStore", "Conversões por loja da compra", "Loja real em que a venda aconteceu")}
          ${montarCartaoGrafico("convChartPurchaseStoreRevenue", "Receita por loja da compra", "Receita gerada na loja real da venda")}
          ${montarCartaoGrafico("convChartAccumulated", "Evolução acumulada", "Crescimento acumulado desde 15/06/2026")}
          ${montarCartaoGrafico("convChartAccumulatedRevenue", "Receita acumulada", "Crescimento da receita desde 15/06/2026")}
        </div>

        <article id="convAttributionAlert" class="alert conv-attribution-alert hidden" role="status"></article>
        <article class="panel conv-table-panel"><div class="panel-head"><div><h3>Tabela geral de CPFs enviados</h3><p id="convGeneralCount"></p></div></div><div id="convGeneralTable" class="table-wrap"></div></article>
        <article class="panel conv-table-panel"><div class="panel-head"><div><h3>Clientes convertidos</h3><p id="convConvertedCount"></p></div></div><div id="convConvertedTable" class="table-wrap"></div></article>
        <article class="panel conv-table-panel"><div class="panel-head"><div><h3>Clientes não convertidos</h3><p id="convNotConvertedCount"></p></div></div><div id="convNotConvertedTable" class="table-wrap"></div></article>
      </section>
    </div>`;
  }

  // Inicialização e eventos

  function inicializar(opcoes) {
    const elementoRaiz = opcoes && opcoes.container ? opcoes.container : obterElemento("conversionApp");
    if (!elementoRaiz) return false;
    if (estado.initialized && estado.container === elementoRaiz) return true;
    destruirGraficos();
    estado = criarEstadoInicial(elementoRaiz);
    montarModulo();
    return true;
  }

  function montarModulo() {
    estado.container.innerHTML = montarEstrutura();
    estado.initialized = true;
    registrarEventos();
    obterElemento("convPeriodEnd").value = criarChaveData(new Date());
    atualizarVisibilidadeJanelaPersonalizada();
    atualizarVisibilidadeDataManual();
  }

  function registrarEventos() {
    for (const tipoFonte of ORDEM_FONTES) {
      const metadados = METADADOS_FONTES[tipoFonte];
      obterElemento(`convFile${metadados.suffix}`).addEventListener("change", (evento) => {
        const arquivo = evento.target.files && evento.target.files[0];
        if (arquivo) carregarArquivo(tipoFonte, arquivo);
      });
      obterElemento(`convSheet${metadados.suffix}`).addEventListener("change", (evento) => selecionarAba(tipoFonte, evento.target.value));
    }
    estado.container.addEventListener("change", tratarAlteracaoDelegada);
    estado.container.addEventListener("input", tratarEntradaDelegada);
    obterElemento("convWindow").addEventListener("change", atualizarVisibilidadeJanelaPersonalizada);
    obterElemento("convCalculateBtn").addEventListener("click", calcular);
    obterElemento("convExportBtn").addEventListener("click", exportarConversoesExcel);
    obterElemento("convLogBtn").addEventListener("click", baixarLogProcessamento);
    obterElemento("convResetFilters").addEventListener("click", limparFiltros);
    obterElemento("convClearBtn").addEventListener("click", limparModulo);
  }

  function tratarAlteracaoDelegada(evento) {
    const seletor = evento.target.closest("select[data-conv-map-source]");
    if (seletor) {
      const fonte = estado.sources[seletor.dataset.convMapSource];
      fonte.mapping[seletor.dataset.convMapField] = seletor.value === "" ? -1 : Number(seletor.value);
      atualizarVisibilidadeDataManual();
      return;
    }
    if (evento.target.id && evento.target.id.startsWith("convFilter")) agendarAtualizacaoPainel();
  }

  function tratarEntradaDelegada(evento) {
    if (evento.target.id && evento.target.id.startsWith("convFilter")) agendarAtualizacaoPainel();
  }

  function agendarAtualizacaoPainel() {
    janela.clearTimeout(estado.renderTimer);
    estado.renderTimer = janela.setTimeout(() => {
      if (estado.result) renderizarPainel();
    }, 80);
  }

  function limparModulo() {
    if (!janela.confirm("Limpar os três arquivos e todos os resultados de conversão?")) return;
    const elementoRaiz = estado.container;
    destruirGraficos();
    estado = criarEstadoInicial(elementoRaiz);
    montarModulo();
  }

  function atualizarVisibilidadeJanelaPersonalizada() {
    const janelaPersonalizada = obterElemento("convWindow").value === "custom";
    obterElemento("convCustomDaysWrap").classList.toggle("hidden", !janelaPersonalizada);
  }

  function atualizarVisibilidadeDataManual() {
    const campanhaEnviada = estado.sources.sent;
    const possuiColunaData = campanhaEnviada.wideMode || (Number.isInteger(campanhaEnviada.mapping.sendDate) && campanhaEnviada.mapping.sendDate >= 0);
    obterElemento("convManualDateWrap").classList.toggle("hidden", possuiColunaData);
    obterElemento("convManualDateHelp").textContent = possuiColunaData
      ? "A data será lida individualmente em cada linha."
      : "Obrigatória quando a campanha não possui uma coluna de data de envio.";
  }

  // Leitura dos arquivos e mapeamento das colunas

  function atualizarStatusFonte(tipoFonte, texto, estaPronta) {
    const metadados = METADADOS_FONTES[tipoFonte];
    obterElemento(`convInfo${metadados.suffix}`).textContent = texto;
    const cartao = estado.container.querySelector(`[data-conv-source="${tipoFonte}"]`);
    if (cartao) cartao.classList.toggle("ready", Boolean(estaPronta));
  }

  async function carregarArquivo(tipoFonte, arquivo) {
    ocultarAlerta();
    atualizarStatusFonte(tipoFonte, `Lendo ${arquivo.name}...`, false);
    try {
      if (!janela.XLSX) throw new Error("Leitor Excel indisponível. Recarregue a página e verifique se a biblioteca XLSX foi carregada.");
      const extensao = (arquivo.name.split(".").pop() || "").toLowerCase();
      if (!["xlsx", "xls", "csv", "txt", "tsv"].includes(extensao)) throw new Error("Formato não suportado. Use XLSX, XLS, CSV, TXT ou TSV.");
      const arquivoDeTexto = ["csv", "txt", "tsv"].includes(extensao);
      const conteudo = arquivoDeTexto ? await arquivo.text() : await arquivo.arrayBuffer();
      await liberarInterface();
      const pastaTrabalho = janela.XLSX.read(conteudo, {
        type: arquivoDeTexto ? "string" : "array",
        raw: arquivoDeTexto,
        dense: true,
        cellDates: false,
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        cellStyles: false,
        cellText: false
      });
      if (!pastaTrabalho.SheetNames || !pastaTrabalho.SheetNames.length) throw new Error(`${METADADOS_FONTES[tipoFonte].label}: nenhuma aba foi encontrada.`);
      const fonte = criarFonteInicial(tipoFonte);
      fonte.file = arquivo;
      fonte.workbook = pastaTrabalho;
      if (tipoFonte === "sent") {
<<<<<<< HEAD
        fonte.teamAssignmentGroups = detectarResponsaveisNaPasta(pastaTrabalho);
=======
>>>>>>> fd4e9ff (atualização geral e add sql)
        fonte.dateCorrectionHints = detectarCorrecoesDatasNaPasta(pastaTrabalho);
      }
      estado.sources[tipoFonte] = fonte;
      preencherSeletorAbas(tipoFonte);
      const abaPreferida = tipoFonte === "sent"
        ? obterAbaPreferidaCpfs(pastaTrabalho)
        : null;
      selecionarAba(tipoFonte, abaPreferida || pastaTrabalho.SheetNames[0]);
      const avisoDatas = fonte.dateCorrections.length
        ? ` · ${formatarNumero(fonte.dateCorrections.length)} data fora de sequência corrigida`
        : "";
      atualizarStatusFonte(tipoFonte, `✓ ${arquivo.name} · ${formatarNumero(fonte.estimatedRows)} linhas estimadas${avisoDatas}`, true);
      registrarLog(`${METADADOS_FONTES[tipoFonte].label}: arquivo carregado (${formatarNumero(fonte.estimatedRows)} linhas estimadas).`);
    } catch (erro) {
      estado.sources[tipoFonte] = criarFonteInicial(tipoFonte);
      atualizarStatusFonte(tipoFonte, "Falha na leitura", false);
      mostrarAlerta(erro.message || "Não foi possível ler o arquivo.", "error");
    }
  }

  function preencherSeletorAbas(tipoFonte) {
    const fonte = estado.sources[tipoFonte];
    const metadados = METADADOS_FONTES[tipoFonte];
    const seletor = obterElemento(`convSheet${metadados.suffix}`);
    seletor.innerHTML = "";
    for (const nomeAba of fonte.workbook.SheetNames) seletor.add(new Option(nomeAba, nomeAba));
    seletor.classList.toggle("hidden", fonte.workbook.SheetNames.length < 2);
  }

  function obterAbaPreferidaCpfs(pastaTrabalho) {
    const nomes = pastaTrabalho.SheetNames || [];
    const abaComResponsaveis = nomes.find((nome) => {
      const nomeNormalizado = normalizarCabecalho(nome);
      return nomeNormalizado.includes("cpf") && nomeNormalizado.includes("vendedor");
    });
    return abaComResponsaveis
      || nomes.find((nome) => ["final", "basefinal", "resultadofinal"].includes(normalizarCabecalho(nome)))
      || null;
  }

  function selecionarAba(tipoFonte, nomeAba) {
    const fonte = estado.sources[tipoFonte];
    if (!fonte.workbook || !fonte.workbook.Sheets[nomeAba]) return;
    fonte.sheetName = nomeAba;
    const metadados = METADADOS_FONTES[tipoFonte];
    obterElemento(`convSheet${metadados.suffix}`).value = nomeAba;
    analisarFonte(fonte);
    if (tipoFonte === "sent") {
      fonte.teamAssignmentGroups = detectarResponsaveisNaFonte(fonte);
    }
    renderizarMapeamento(tipoFonte);
    renderizarPrevia(tipoFonte);
    atualizarVisibilidadeDataManual();
  }

  function obterLimitesPlanilha(planilha) {
    if (!planilha || !planilha["!ref"]) return null;
    try {
      return janela.XLSX.utils.decode_range(planilha["!ref"]);
    } catch (_) {
      return null;
    }
  }

  function obterValorCelula(planilha, linha, coluna) {
    let celula;
    if (Array.isArray(planilha)) celula = planilha[linha] && planilha[linha][coluna];
    else celula = planilha[janela.XLSX.utils.encode_cell({ r: linha, c: coluna })];
    return celula ? celula.v : "";
  }

<<<<<<< HEAD
=======
  function detectarLinhaDatada(planilha, limites) {
    const ultimaLinha = Math.min(limites.e.r, limites.s.r + 49);
    let melhorLinha = null;
    let maiorQuantidadeDatas = 0;

    for (let linha = limites.s.r; linha <= ultimaLinha; linha += 1) {
      let quantidadeDatas = 0;
      for (let coluna = limites.s.c; coluna <= limites.e.c; coluna += 1) {
        if (interpretarDataBrasileira(obterValorCelula(planilha, linha, coluna))) {
          quantidadeDatas += 1;
        }
      }
      if (quantidadeDatas > maiorQuantidadeDatas) {
        melhorLinha = linha;
        maiorQuantidadeDatas = quantidadeDatas;
      }
    }

    // Duas ou mais datas na mesma linha caracterizam o layout por colunas.
    // Uma data isolada pode ser apenas uma linha de uma planilha estruturada.
    return maiorQuantidadeDatas >= 2 ? melhorLinha : null;
  }

>>>>>>> fd4e9ff (atualização geral e add sql)
  function detectarCorrecoesDatasNaPasta(pastaTrabalho) {
    const correcoes = new Map();
    for (const nomeAba of pastaTrabalho.SheetNames || []) {
      const planilha = pastaTrabalho.Sheets[nomeAba];
      const limites = obterLimitesPlanilha(planilha);
      if (!limites) continue;
<<<<<<< HEAD

      const colunasDatadas = [];
      for (let coluna = limites.s.c; coluna <= limites.e.c; coluna += 1) {
        const valor = obterValorCelula(planilha, limites.s.r, coluna);
=======
      const linhaDatada = detectarLinhaDatada(planilha, limites);
      if (!Number.isInteger(linhaDatada)) continue;

      const colunasDatadas = [];
      for (let coluna = limites.s.c; coluna <= limites.e.c; coluna += 1) {
        const valor = obterValorCelula(planilha, linhaDatada, coluna);
>>>>>>> fd4e9ff (atualização geral e add sql)
        const data = interpretarDataBrasileira(valor);
        if (data) colunasDatadas.push({ column: coluna, date: data, raw: valor });
      }
      for (const item of ajustarDatasForaDeSequencia(colunasDatadas)) {
        if (item.adjusted) correcoes.set(criarChaveData(item.originalDate), item.date);
      }
    }
    return correcoes;
  }

  function analisarFonte(fonte) {
    const planilha = fonte.workbook.Sheets[fonte.sheetName];
    const limites = obterLimitesPlanilha(planilha);
    if (!limites) {
      fonte.headerRow = 0;
      fonte.headers = [];
      fonte.mapping = {};
      fonte.preview = [];
      fonte.estimatedRows = 0;
      return;
    }
    if (fonte.kind === "sent") {
      const linhaDatada = detectarLinhaDatada(planilha, limites);
      const colunasDatadas = [];
      if (Number.isInteger(linhaDatada)) {
        for (let coluna = limites.s.c; coluna <= limites.e.c; coluna += 1) {
          const valor = obterValorCelula(planilha, linhaDatada, coluna);
          const data = interpretarDataBrasileira(valor);
          if (data) colunasDatadas.push({ column: coluna, date: data, raw: valor, letter: janela.XLSX.utils.encode_col(coluna) });
        }
      }
      if (colunasDatadas.length) {
        const colunasAjustadas = ajustarDatasForaDeSequencia(colunasDatadas).map((item) => {
          if (item.adjusted) return item;
          const dataSugerida = fonte.dateCorrectionHints.get(criarChaveData(item.date));
          return dataSugerida
            ? { ...item, originalDate: item.date, date: dataSugerida, adjusted: true }
            : item;
        });
        fonte.wideMode = true;
        fonte.wideColumns = colunasAjustadas;
        fonte.dateCorrections = colunasAjustadas.filter((item) => item.adjusted);
<<<<<<< HEAD
        fonte.headerRow = limites.s.r;
=======
        fonte.headerRow = linhaDatada;
>>>>>>> fd4e9ff (atualização geral e add sql)
        fonte.headers = colunasAjustadas.map((item) => ({ index: item.column, raw: item.raw, label: `${item.letter} · ${formatarData(item.date)}`, normalized: criarChaveData(item.date) }));
        fonte.mapping = {};
        fonte.preview = coletarPrevia(planilha, limites, fonte.headerRow, fonte.headers);
        fonte.estimatedRows = colunasAjustadas.reduce((total, item) => {
          let quantidade = 0;
          for (let linha = limites.s.r + 1; linha <= limites.e.r; linha += 1) if (!estaVazio(obterValorCelula(planilha, linha, item.column))) quantidade += 1;
          return total + quantidade;
        }, 0);
        return;
      }
    }
    fonte.wideMode = false;
    fonte.wideColumns = [];
    fonte.dateCorrections = [];
    fonte.headerRow = detectarLinhaCabecalho(planilha, limites, fonte.kind);
    fonte.headers = coletarCabecalhos(planilha, limites, fonte.headerRow);
    fonte.mapping = detectarColunas(fonte.headers, fonte.kind);
    fonte.preview = coletarPrevia(planilha, limites, fonte.headerRow, fonte.headers);
    fonte.estimatedRows = Math.max(0, limites.e.r - fonte.headerRow);
  }

  function detectarLinhaCabecalho(planilha, limites, tipoFonte) {
    let melhorLinha = limites.s.r;
    let melhorPontuacao = -1;
    const ultimaLinha = Math.min(limites.e.r, limites.s.r + 49);
    const ultimaColuna = Math.min(limites.e.c, limites.s.c + 149);
    const apelidos = DEFINICOES_CAMPOS[tipoFonte]
      .flatMap((definicao) => definicao.aliases.map(normalizarCabecalho))
      .filter(Boolean);

    for (let linha = limites.s.r; linha <= ultimaLinha; linha += 1) {
      let preenchidas = 0;
      let apelidosEncontrados = 0;
      for (let coluna = limites.s.c; coluna <= ultimaColuna; coluna += 1) {
        const valor = obterValorCelula(planilha, linha, coluna);
        if (estaVazio(valor)) continue;
        preenchidas += 1;
        const cabecalho = normalizarCabecalho(valor);
        if (apelidos.some((apelido) => cabecalho === apelido || (apelido.length >= 4 && cabecalho.includes(apelido)))) apelidosEncontrados += 1;
      }
      const pontuacao = apelidosEncontrados * 100 + Math.min(preenchidas, 40);
      if (pontuacao > melhorPontuacao) {
        melhorPontuacao = pontuacao;
        melhorLinha = linha;
      }
    }
    return melhorLinha;
  }

  function coletarCabecalhos(planilha, limites, linhaCabecalho) {
    const cabecalhos = [];
    const contagens = new Map();
    for (let coluna = limites.s.c; coluna <= limites.e.c; coluna += 1) {
      const textoOriginal = limparTexto(obterValorCelula(planilha, linhaCabecalho, coluna));
      if (!textoOriginal) continue;
      const contagem = (contagens.get(textoOriginal) || 0) + 1;
      contagens.set(textoOriginal, contagem);
      cabecalhos.push({
        index: coluna,
        raw: textoOriginal,
        label: contagem > 1 ? `${textoOriginal} (${contagem})` : textoOriginal,
        normalized: normalizarCabecalho(textoOriginal)
      });
    }
    return cabecalhos;
  }

  function calcularPontuacaoCabecalho(cabecalho, apelidos) {
    let melhorPontuacao = 0;
    for (let indice = 0; indice < apelidos.length; indice += 1) {
      const apelido = normalizarCabecalho(apelidos[indice]);
      if (!apelido) continue;
      if (cabecalho === apelido) melhorPontuacao = Math.max(melhorPontuacao, 1000 - indice);
      else if (apelido.length >= 4 && (cabecalho.startsWith(apelido) || cabecalho.endsWith(apelido))) melhorPontuacao = Math.max(melhorPontuacao, 760 - indice);
      else if (apelido.length >= 4 && cabecalho.includes(apelido)) melhorPontuacao = Math.max(melhorPontuacao, 620 - indice);
      else if (cabecalho.length >= 4 && apelido.includes(cabecalho)) melhorPontuacao = Math.max(melhorPontuacao, 420 - indice);
    }
    return melhorPontuacao;
  }

  function detectarColunas(cabecalhos, tipoFonte) {
    const mapeamento = Object.fromEntries(DEFINICOES_CAMPOS[tipoFonte].map((definicao) => [definicao.key, -1]));
    const combinacoes = [];
    for (const definicao of DEFINICOES_CAMPOS[tipoFonte]) {
      for (const cabecalho of cabecalhos) {
        const pontuacao = calcularPontuacaoCabecalho(cabecalho.normalized, definicao.aliases);
        if (pontuacao) combinacoes.push({ field: definicao.key, column: cabecalho.index, score: pontuacao + (definicao.required ? 5 : 0) });
      }
    }
    combinacoes.sort((esquerda, direita) => direita.score - esquerda.score);
    const colunasUsadas = new Set();
    const camposUsados = new Set();
    for (const combinacao of combinacoes) {
      if (camposUsados.has(combinacao.field) || colunasUsadas.has(combinacao.column)) continue;
      mapeamento[combinacao.field] = combinacao.column;
      camposUsados.add(combinacao.field);
      colunasUsadas.add(combinacao.column);
    }
    return mapeamento;
  }

  function coletarPrevia(planilha, limites, linhaCabecalho, cabecalhos) {
    const linhas = [];
    const cabecalhosVisiveis = cabecalhos.slice(0, 10);
    for (let linha = linhaCabecalho + 1; linha <= limites.e.r && linhas.length < 5; linha += 1) {
      const valores = cabecalhosVisiveis.map((cabecalho) => obterValorCelula(planilha, linha, cabecalho.index));
      if (valores.every(estaVazio)) continue;
      linhas.push(valores);
    }
    return linhas;
  }

  function renderizarMapeamento(tipoFonte) {
    const fonte = estado.sources[tipoFonte];
    const metadados = METADADOS_FONTES[tipoFonte];
    const detalhes = obterElemento(`convMapDetails${metadados.suffix}`);
    const destino = obterElemento(`convMap${metadados.suffix}`);
    detalhes.classList.toggle("hidden", !fonte.headers.length || Boolean(fonte.wideMode));
    if (fonte.wideMode) {
      destino.innerHTML = `<p><strong>${formatarNumero(fonte.wideColumns.length)} datas identificadas automaticamente.</strong> Os CPFs abaixo de cada data serão estruturados sem exigir colunas de campanha.</p>`;
      return;
    }
    if (!fonte.headers.length) {
      destino.innerHTML = "<p>Nenhum cabeçalho encontrado.</p>";
      return;
    }
    destino.innerHTML = DEFINICOES_CAMPOS[tipoFonte].map((definicao) => {
      const colunaSelecionada = fonte.mapping[definicao.key];
      const opcoes = [`<option value="">Não localizada</option>`].concat(fonte.headers.map((cabecalho) => `<option value="${cabecalho.index}"${colunaSelecionada === cabecalho.index ? " selected" : ""}>${escaparHtml(cabecalho.label)}</option>`));
      return `<label>${escaparHtml(definicao.label)}${definicao.required ? " *" : ""}<select data-conv-map-source="${tipoFonte}" data-conv-map-field="${definicao.key}">${opcoes.join("")}</select></label>`;
    }).join("");
  }

  function renderizarPrevia(tipoFonte) {
    const fonte = estado.sources[tipoFonte];
    const metadados = METADADOS_FONTES[tipoFonte];
    const detalhes = obterElemento(`convPreviewDetails${metadados.suffix}`);
    const destino = obterElemento(`convPreview${metadados.suffix}`);
    detalhes.classList.toggle("hidden", !fonte.headers.length);
    if (!fonte.headers.length || !fonte.preview.length) {
      destino.innerHTML = "<p class=\"conv-empty\">Nenhuma linha de dados encontrada.</p>";
      return;
    }
    if (tipoFonte === "sent" && fonte.wideMode) {
      const unicos = new Set();
      let totalComResponsavel = 0;
      const planilha = fonte.workbook.Sheets[fonte.sheetName];
      const limites = obterLimitesFonte(fonte);
      const resumos = fonte.wideColumns.map((item) => {
        let total = 0;
        let comResponsavel = 0;
        for (let linha = fonte.headerRow + 1; linha <= limites.e.r; linha += 1) {
          const dados = separarCpfEResponsavel(obterValorCelula(planilha, linha, item.column));
          if (dados.cpf) {
            total += 1;
            unicos.add(dados.cpf);
            if (dados.responsavel) {
              comResponsavel += 1;
              totalComResponsavel += 1;
            }
          }
        }
        const avisoCorrecao = item.adjusted
          ? `<small>ajustada de ${formatarData(item.originalDate)}</small>`
          : "";
<<<<<<< HEAD
        return `<tr><td>${item.letter}</td><td>${formatarData(item.date)}${avisoCorrecao}</td><td>${formatarNumero(total)}</td></tr>`;
=======
        return `<tr><td>${item.letter}</td><td>${formatarData(item.date)}${avisoCorrecao}</td><td>${formatarNumero(total)}</td><td>${formatarNumero(comResponsavel)}</td></tr>`;
>>>>>>> fd4e9ff (atualização geral e add sql)
      }).join("");
      destino.innerHTML = `<div class="conv-wide-summary"><strong>${formatarNumero(fonte.wideColumns.length)} colunas datadas</strong><span>${formatarNumero(fonte.estimatedRows)} CPFs carregados</span><span>${formatarNumero(unicos.size)} CPFs únicos</span><span>${formatarNumero(totalComResponsavel)} com vendedora</span></div><table><thead><tr><th>Coluna</th><th>Data de envio</th><th>CPFs válidos</th><th>Com vendedora</th></tr></thead><tbody>${resumos}</tbody></table>`;
      return;
    }
    const cabecalhos = fonte.headers.slice(0, 10);
    destino.innerHTML = `<table><thead><tr>${cabecalhos.map((cabecalho) => `<th>${escaparHtml(cabecalho.label)}</th>`).join("")}</tr></thead><tbody>${fonte.preview.map((linha) => `<tr>${linha.map((valor) => `<td title="${escaparHtml(limparTexto(valor))}">${escaparHtml(limitarTexto(valor, 36))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function obterValorMapeado(fonte, linha, chaveCampo) {
    const coluna = fonte.mapping[chaveCampo];
    if (!Number.isInteger(coluna) || coluna < 0) return "";
    return obterValorCelula(fonte.workbook.Sheets[fonte.sheetName], linha, coluna);
  }

  function obterLimitesFonte(fonte) {
    return obterLimitesPlanilha(fonte.workbook && fonte.workbook.Sheets[fonte.sheetName]);
  }

  function criarGrupoResponsavel(grupos, responsavel) {
    if (!grupos.has(responsavel)) {
      grupos.set(responsavel, {
        label: responsavel,
        sent: 0,
        converted: 0,
        notConverted: 0,
        revenue: 0,
        purchases: 0,
        rate: 0
      });
    }
    grupos.get(responsavel).sent += 1;
  }

  function detectarResponsaveisNaFonte(fonte) {
    const planilha = fonte.workbook && fonte.workbook.Sheets[fonte.sheetName];
    const limites = obterLimitesPlanilha(planilha);
    const grupos = new Map();
    const ocorrencias = new Set();
    if (!limites) return [];

    if (fonte.wideMode) {
      for (const coluna of fonte.wideColumns) {
        for (let linha = fonte.headerRow + 1; linha <= limites.e.r; linha += 1) {
          const dados = separarCpfEResponsavel(obterValorCelula(planilha, linha, coluna.column));
          const chave = `${dados.cpf}|${criarChaveData(coluna.date)}`;
          if (!dados.cpf || !dados.responsavel || ocorrencias.has(chave)) continue;
          ocorrencias.add(chave);
          criarGrupoResponsavel(grupos, dados.responsavel);
        }
      }
      return [...grupos.values()];
    }

    if (!(Number.isInteger(fonte.mapping.cpf) && fonte.mapping.cpf >= 0)
      || !(Number.isInteger(fonte.mapping.responsible) && fonte.mapping.responsible >= 0)) {
      return [];
    }

    for (let linha = fonte.headerRow + 1; linha <= limites.e.r; linha += 1) {
      const cpf = normalizarCpf(obterValorCelula(planilha, linha, fonte.mapping.cpf));
      const responsavel = limparTexto(obterValorCelula(planilha, linha, fonte.mapping.responsible));
      const dataEnvio = Number.isInteger(fonte.mapping.sendDate) && fonte.mapping.sendDate >= 0
        ? interpretarDataBrasileira(obterValorCelula(planilha, linha, fonte.mapping.sendDate))
        : null;
      const chave = `${cpf}|${dataEnvio ? criarChaveData(dataEnvio) : "sem-data"}`;
      if (!cpf || !responsavel || ocorrencias.has(chave)) continue;
      ocorrencias.add(chave);
      criarGrupoResponsavel(grupos, responsavel);
    }
    return [...grupos.values()];
  }

  function validarColunasObrigatorias() {
    for (const tipoFonte of ORDEM_FONTES) {
      const fonte = estado.sources[tipoFonte];
      if (!fonte.workbook) throw new Error(`Carregue ${METADADOS_FONTES[tipoFonte].label.toLowerCase()}.`);
      if (tipoFonte === "sent" && fonte.wideMode) {
        if (!fonte.wideColumns.length) throw new Error("Não foi possível identificar datas na primeira linha das colunas do arquivo de CPFs enviados.");
        continue;
      }
      const colunasAusentes = DEFINICOES_CAMPOS[tipoFonte].filter((definicao) => definicao.required && !(Number.isInteger(fonte.mapping[definicao.key]) && fonte.mapping[definicao.key] >= 0));
      if (colunasAusentes.length) throw new Error(`Não foi possível localizar ${colunasAusentes.map((item) => `a coluna ${item.label}`).join(" e ")} em ${METADADOS_FONTES[tipoFonte].label}. Confira o mapeamento de colunas.`);
    }
    const campanhaEnviada = estado.sources.sent;
    const possuiDataEnvio = Number.isInteger(campanhaEnviada.mapping.sendDate) && campanhaEnviada.mapping.sendDate >= 0;
    if (!campanhaEnviada.wideMode && !possuiDataEnvio && !interpretarDataBrasileira(obterElemento("convManualDate").value)) throw new Error("Não foi possível identificar a data de envio dos CPFs. Informe uma data padrão ou organize o arquivo com as datas na primeira linha de cada coluna.");
  }

  function obterDiasJanelaConversao() {
    const opcaoSelecionada = obterElemento("convWindow").value;
    const quantidadeDias = opcaoSelecionada === "custom" ? Number(obterElemento("convCustomDays").value) : Number(opcaoSelecionada);
    if (!Number.isInteger(quantidadeDias) || quantidadeDias < 1 || quantidadeDias > 3650) throw new Error("Informe uma janela de conversão válida entre 1 e 3650 dias.");
    return quantidadeDias;
  }

  function registrarErro(arquivo, linha, nomeCampo, valor, motivo) {
    if (estado.errors.length < LIMITE_ERROS) estado.errors.push({ arquivo, linha, campo: nomeCampo, valor: limitarTexto(valor, 120), motivo });
    else estado.errorOverflow += 1;
  }

  function registrarDuplicidade(registro) {
    if (estado.duplicates.length < LIMITE_DUPLICIDADES) estado.duplicates.push(registro);
    else estado.duplicateOverflow += 1;
  }

  function atualizarProgresso(valor, rotulo) {
    const progresso = obterElemento("convProgress");
    progresso.classList.remove("hidden");
    obterElemento("convProgressBar").style.width = `${Math.max(0, Math.min(100, valor))}%`;
    obterElemento("convProgressValue").textContent = `${Math.round(valor)}%`;
    obterElemento("convProgressLabel").textContent = rotulo;
  }

  function liberarInterface() {
    return new Promise((resolver) => janela.requestAnimationFrame(() => resolver()));
  }

  async function liberarLote(linha, linhaInicial, linhaFinal, progressoInicial, progressoFinal, rotulo) {
    if ((linha - linhaInicial) % 5000 !== 0) return;
    const proporcao = linhaFinal <= linhaInicial ? 1 : (linha - linhaInicial) / (linhaFinal - linhaInicial);
    atualizarProgresso(progressoInicial + (progressoFinal - progressoInicial) * proporcao, rotulo);
    await liberarInterface();
  }

  // Preparação das bases

  function criarRegistroCampanha(fonte, linha, dataManual) {
    const cpfOriginal = obterValorMapeado(fonte, linha, "cpf");
    const possuiColunaData = Number.isInteger(fonte.mapping.sendDate) && fonte.mapping.sendDate >= 0;
    const dataEnvioOriginal = possuiColunaData ? obterValorMapeado(fonte, linha, "sendDate") : dataManual;
    const telefone1 = normalizarTelefone(obterValorMapeado(fonte, linha, "phone1"));
    const telefone2 = normalizarTelefone(obterValorMapeado(fonte, linha, "phone2"));
    const dataEnvio = interpretarDataBrasileira(dataEnvioOriginal);
    return {
      sourceRow: linha + 1,
      rawCpf: cpfOriginal,
      cpf: normalizarCpf(cpfOriginal),
      campaign: limparTexto(obterValorMapeado(fonte, linha, "campaign")) || (dataEnvio ? `Base ${formatarData(dataEnvio)}` : ""),
      sendDate: dataEnvio,
      rawSendDate: dataEnvioOriginal,
      responsible: limparTexto(obterValorMapeado(fonte, linha, "responsible")),
      name: limparTexto(obterValorMapeado(fonte, linha, "name")),
      phones: [telefone1, telefone2].filter((telefone, indice, todos) => telefone && todos.indexOf(telefone) === indice),
      storeOriginal: normalizarLoja(obterValorMapeado(fonte, linha, "storeOriginal")),
      storeFinal: normalizarLoja(obterValorMapeado(fonte, linha, "storeFinal")),
      origin: limparTexto(obterValorMapeado(fonte, linha, "origin"))
    };
  }

  async function prepararCampanhaEnviada() {
    const fonte = estado.sources.sent;
    if (fonte.wideMode) return prepararArquivoCpfsPorColunas(fonte);
    const limites = obterLimitesFonte(fonte);
    const registros = [];
    const linhasTratadas = [];
    const registrosExatos = new Map();
    const registrosPorCpfData = new Map();
    const dataManual = interpretarDataBrasileira(obterElemento("convManualDate").value);
    if (!limites) return { records: registros, treated: linhasTratadas };
    const linhaInicial = fonte.headerRow + 1;
    for (let linha = linhaInicial; linha <= limites.e.r; linha += 1) {
      const registro = criarRegistroCampanha(fonte, linha, dataManual);
      const valoresOriginais = [registro.rawCpf, registro.campaign, registro.rawSendDate, registro.name, registro.responsible];
      if (valoresOriginais.every(estaVazio)) continue;
      const problemas = [];
      if (!registro.cpf) {
        problemas.push("CPF inválido");
        registrarErro("Campanha enviada", registro.sourceRow, "CPF", registro.rawCpf, "CPF vazio ou inválido");
      }
      if (!registro.sendDate) {
        problemas.push("Data de envio inválida");
        registrarErro("Campanha enviada", registro.sourceRow, "Data de envio", registro.rawSendDate, "Data vazia ou inválida");
      }
      if (!registro.campaign) {
        problemas.push("Campanha não informada");
        registrarErro("Campanha enviada", registro.sourceRow, "Campanha", "", "Campanha vazia");
      }
      registro.validationReason = problemas.join("; ");
      if (!problemas.length) {
        const chaveCampanha = normalizarTexto(registro.campaign);
        const chaveExata = `${registro.cpf}|${criarChaveData(registro.sendDate)}|${chaveCampanha}|${normalizarTexto(registro.responsible)}`;
        const chaveCpfData = `${registro.cpf}|${criarChaveData(registro.sendDate)}`;
        if (registrosExatos.has(chaveExata)) {
          const primeiroRegistro = registrosExatos.get(chaveExata);
          registrarDuplicidade({ cpf: registro.cpf, dataEnvio: registro.sendDate, campanha: registro.campaign, tipo: "Mesma campanha e data", linhaMantida: primeiroRegistro.sourceRow, linhaIgnorada: registro.sourceRow });
          registrarErro("Campanha enviada", registro.sourceRow, "CPF", registro.rawCpf, "CPF duplicado na mesma campanha e data; ocorrência ignorada");
          linhasTratadas.push(criarLinhaCampanhaTratada(registro, "Duplicado — ocorrência ignorada"));
          await liberarLote(linha, linhaInicial, limites.e.r, 10, 20, "Normalizando campanha enviada");
          continue;
        }
        if (registrosPorCpfData.has(chaveCpfData)) {
          const primeiroRegistro = registrosPorCpfData.get(chaveCpfData);
          registrarDuplicidade({ cpf: registro.cpf, dataEnvio: registro.sendDate, campanha: registro.campaign, tipo: "Campanhas diferentes na mesma data", linhaMantida: primeiroRegistro.sourceRow, linhaIgnorada: registro.sourceRow });
          registrarErro("Campanha enviada", registro.sourceRow, "CPF", registro.rawCpf, "CPF repetido em campanhas diferentes na mesma data; primeira ocorrência priorizada");
          linhasTratadas.push(criarLinhaCampanhaTratada(registro, "Duplicado entre campanhas — ocorrência ignorada"));
          await liberarLote(linha, linhaInicial, limites.e.r, 10, 20, "Normalizando campanha enviada");
          continue;
        }
        registrosExatos.set(chaveExata, registro);
        registrosPorCpfData.set(chaveCpfData, registro);
      }
      registros.push(registro);
      linhasTratadas.push(criarLinhaCampanhaTratada(registro, problemas.length ? problemas.join("; ") : "Válido"));
      await liberarLote(linha, linhaInicial, limites.e.r, 10, 20, "Normalizando campanha enviada");
    }
    return { records: registros, treated: linhasTratadas };
  }

  async function prepararArquivoCpfsPorColunas(fonte) {
    const planilha = fonte.workbook.Sheets[fonte.sheetName];
    const limites = obterLimitesFonte(fonte);
    const registros = [];
    const linhasTratadas = [];
    const vistos = new Map();
    for (const coluna of fonte.wideColumns) {
      for (let linha = fonte.headerRow + 1; linha <= limites.e.r; linha += 1) {
        const cpfOriginal = obterValorCelula(planilha, linha, coluna.column);
        if (estaVazio(cpfOriginal)) continue;
        const dadosCpf = separarCpfEResponsavel(cpfOriginal);
        const cpf = dadosCpf.cpf;
        const registro = {
          sourceRow: linha + 1, sourceColumn: coluna.letter, rawCpf: cpfOriginal, cpf,
          campaign: `Base ${formatarData(coluna.date)}`, sendDate: coluna.date, rawSendDate: coluna.raw,
          responsible: dadosCpf.responsavel, name: "", phones: [], storeOriginal: "", storeFinal: "", origin: coluna.letter
        };
        if (!cpf) {
          registro.validationReason = "CPF inválido";
          registrarErro("Arquivo de CPFs enviados", linha + 1, `Coluna ${coluna.letter}`, cpfOriginal, "CPF vazio ou inválido");
          registros.push(registro);
          linhasTratadas.push(criarLinhaCampanhaTratada(registro, registro.validationReason));
          continue;
        }
        const chave = `${cpf}|${criarChaveData(coluna.date)}`;
        if (vistos.has(chave)) {
          const anterior = vistos.get(chave);
          registrarDuplicidade({ cpf, dataEnvio: coluna.date, coluna: coluna.letter, tipo: "CPF repetido na mesma data", linhaMantida: anterior.sourceRow, linhaIgnorada: linha + 1 });
          registrarErro("Arquivo de CPFs enviados", linha + 1, `Coluna ${coluna.letter}`, cpfOriginal, "CPF duplicado na mesma data; ocorrência ignorada");
          linhasTratadas.push(criarLinhaCampanhaTratada(registro, "Duplicado — ocorrência ignorada"));
          continue;
        }
        vistos.set(chave, registro);
        registros.push(registro);
        linhasTratadas.push(criarLinhaCampanhaTratada(registro, "Válido"));
      }
      await liberarInterface();
    }
    if (!registros.some((registro) => registro.cpf && registro.sendDate)) throw new Error("O arquivo de CPFs enviados não contém nenhum CPF válido abaixo das datas identificadas.");
    return { records: registros, treated: linhasTratadas };
  }

  function criarLinhaCampanhaTratada(registro, situacao) {
    return {
      cpf: registro.cpf,
      name: registro.name,
      phones: registro.phones.join(" | "),
      storeOriginal: registro.storeOriginal,
      storeFinal: registro.storeFinal,
      campaign: registro.campaign,
      responsible: registro.responsible,
      sendDate: registro.sendDate,
      origin: registro.origin,
      sourceColumn: registro.sourceColumn || "",
      sourceRow: registro.sourceRow,
      status: situacao
    };
  }

  function mesclarCliente(clienteAtual, novoCliente) {
    if (!clienteAtual) return novoCliente;
    const clienteMesclado = { ...clienteAtual };
    for (const [chave, valor] of Object.entries(novoCliente)) {
      if ((estaVazio(clienteMesclado[chave]) || clienteMesclado[chave] == null) && !estaVazio(valor) && valor != null) clienteMesclado[chave] = valor;
    }
    const telefones = [...(clienteAtual.phones || []), ...(novoCliente.phones || [])].filter((telefone, indice, todos) => telefone && todos.indexOf(telefone) === indice);
    clienteMesclado.phones = telefones.slice(0, 2);
    return clienteMesclado;
  }

  async function prepararBase70() {
    const fonte = estado.sources.base70;
    const limites = obterLimitesFonte(fonte);
    const clientes = new Map();
    const linhasTratadas = [];
    if (!limites) return { customers: clientes, treated: linhasTratadas };
    const linhaInicial = fonte.headerRow + 1;
    for (let linha = linhaInicial; linha <= limites.e.r; linha += 1) {
      const cpfOriginal = obterValorMapeado(fonte, linha, "cpf");
      const nomeOriginal = obterValorMapeado(fonte, linha, "name");
      if ([cpfOriginal, nomeOriginal].every(estaVazio)) continue;
      const cpf = normalizarCpf(cpfOriginal);
      const nascimentoOriginal = obterValorMapeado(fonte, linha, "birthDate");
      const ultimaCompraOriginal = obterValorMapeado(fonte, linha, "lastPurchase");
      const totalCompradoOriginal = obterValorMapeado(fonte, linha, "totalPurchased");
      const ticketOriginal = obterValorMapeado(fonte, linha, "averageTicket");
      const dataNascimento = estaVazio(nascimentoOriginal) ? null : interpretarDataBrasileira(nascimentoOriginal);
      const dataUltimaCompra = estaVazio(ultimaCompraOriginal) ? null : interpretarDataBrasileira(ultimaCompraOriginal);
      const totalComprado = estaVazio(totalCompradoOriginal) ? null : interpretarMoedaBrasileira(totalCompradoOriginal);
      const ticketMedio = estaVazio(ticketOriginal) ? null : interpretarMoedaBrasileira(ticketOriginal);
      const avisos = [];
      if (!cpf) {
        avisos.push("CPF inválido");
        registrarErro("Base 70", linha + 1, "CPF", cpfOriginal, "CPF vazio ou inválido");
      }
      if (!estaVazio(nascimentoOriginal) && !dataNascimento) {
        avisos.push("Nascimento inválido");
        registrarErro("Base 70", linha + 1, "Data de nascimento", nascimentoOriginal, "Data inválida");
      }
      if (!estaVazio(ultimaCompraOriginal) && !dataUltimaCompra) {
        avisos.push("Última compra inválida");
        registrarErro("Base 70", linha + 1, "Data da última compra", ultimaCompraOriginal, "Data inválida");
      }
      if (!estaVazio(totalCompradoOriginal) && totalComprado == null) {
        avisos.push("Valor total inválido");
        registrarErro("Base 70", linha + 1, "Valor total comprado", totalCompradoOriginal, "Valor inválido");
      }
      if (!estaVazio(ticketOriginal) && ticketMedio == null) {
        avisos.push("Ticket médio inválido");
        registrarErro("Base 70", linha + 1, "Ticket médio", ticketOriginal, "Valor inválido");
      }
      const telefone1 = normalizarTelefone(obterValorMapeado(fonte, linha, "phone1"));
      const telefone2 = normalizarTelefone(obterValorMapeado(fonte, linha, "phone2"));
      const cliente = {
        cpf,
        name: limparTexto(nomeOriginal),
        phones: [telefone1, telefone2].filter((telefone, indice, todos) => telefone && todos.indexOf(telefone) === indice),
        store: normalizarLoja(obterValorMapeado(fonte, linha, "store")),
        birthDate: dataNascimento,
        lastPurchase: dataUltimaCompra,
        totalPurchased: totalComprado,
        coupons: limparTexto(obterValorMapeado(fonte, linha, "coupons")),
        averageTicket: ticketMedio,
        professionalClass: limparTexto(obterValorMapeado(fonte, linha, "professionalClass")),
        lastSeller: limparTexto(obterValorMapeado(fonte, linha, "lastSeller")),
        sourceRow: linha + 1
      };
      linhasTratadas.push({ ...cliente, status: avisos.length ? avisos.join("; ") : "Válido" });
      if (cpf) clientes.set(cpf, mesclarCliente(clientes.get(cpf), cliente));
      await liberarLote(linha, linhaInicial, limites.e.r, 20, 32, "Tratando cadastro da Base 70");
    }
    return { customers: clientes, treated: linhasTratadas };
  }

  async function prepararBase600() {
    const fonte = estado.sources.base600;
    const limites = obterLimitesFonte(fonte);
    const comprasPorCpf = new Map();
    const cpfsConhecidos = new Set();
    const linhasTratadas = [];
    if (!limites) return { salesByCpf: comprasPorCpf, knownCpfs: cpfsConhecidos, treated: linhasTratadas };
    const linhaInicial = fonte.headerRow + 1;
    for (let linha = linhaInicial; linha <= limites.e.r; linha += 1) {
      const cpfOriginal = obterValorMapeado(fonte, linha, "cpf");
      const dataOriginal = obterValorMapeado(fonte, linha, "purchaseDate");
      const valorOriginal = obterValorMapeado(fonte, linha, "saleValue");
      if ([cpfOriginal, dataOriginal, valorOriginal].every(estaVazio)) continue;
      const cpf = normalizarCpf(cpfOriginal);
      const dataCompra = interpretarDataBrasileira(dataOriginal);
      const valorVenda = interpretarMoedaBrasileira(valorOriginal);
      const descontoOriginal = obterValorMapeado(fonte, linha, "discount");
      const desconto = estaVazio(descontoOriginal) ? null : interpretarMoedaBrasileira(descontoOriginal);
      const problemas = [];
      if (!cpf) {
        problemas.push("CPF inválido");
        registrarErro("Base 600", linha + 1, "CPF", cpfOriginal, "CPF vazio ou inválido");
      } else cpfsConhecidos.add(cpf);
      if (!dataCompra) {
        problemas.push("Data inválida");
        registrarErro("Base 600", linha + 1, "Data da compra", dataOriginal, "Data vazia ou inválida");
      }
      if (valorVenda == null || valorVenda <= 0) {
        problemas.push(valorVenda == null ? "Valor inválido" : "Valor não positivo");
        registrarErro("Base 600", linha + 1, "Valor da venda", valorOriginal, valorVenda == null ? "Valor vazio ou inválido" : "Valor menor ou igual a zero; não caracteriza compra convertida");
      }
      if (!estaVazio(descontoOriginal) && desconto == null) {
        problemas.push("Desconto inválido");
        registrarErro("Base 600", linha + 1, "Desconto", descontoOriginal, "Valor inválido");
      }
      const compra = {
        cpf,
        purchaseDate: dataCompra,
        saleValue: valorVenda,
        discount: desconto,
        seller: limparTexto(obterValorMapeado(fonte, linha, "seller")),
        store: normalizarLoja(obterValorMapeado(fonte, linha, "store")),
        product: limparTexto(obterValorMapeado(fonte, linha, "product")),
        sourceRow: linha + 1,
        status: problemas.length ? problemas.join("; ") : "Válido"
      };
      linhasTratadas.push(compra);
      if (cpf && dataCompra && valorVenda != null && valorVenda > 0) {
        if (!comprasPorCpf.has(cpf)) comprasPorCpf.set(cpf, []);
        comprasPorCpf.get(cpf).push(compra);
      }
      await liberarLote(linha, linhaInicial, limites.e.r, 32, 57, "Indexando compras da Base 600 por CPF");
    }

    // A Base 600 é itemizada. Linhas do mesmo CPF no mesmo dia formam
    // uma única compra para o cálculo da conversão.

    for (const [cpf, compras] of comprasPorCpf.entries()) {
      compras.sort((esquerda, direita) => esquerda.purchaseDate - direita.purchaseDate || esquerda.sourceRow - direita.sourceRow);
      const comprasDiarias = [];
      for (const compra of compras) {
        const dia = criarChaveData(compra.purchaseDate);
        const compraAnterior = comprasDiarias[comprasDiarias.length - 1];
        if (compraAnterior && compraAnterior.day === dia) {
          compraAnterior.saleValue += compra.saleValue;
          compraAnterior.discount = (compraAnterior.discount || 0) + (compra.discount || 0);
          compraAnterior.itemCount += 1;
          if (!compraAnterior.seller) compraAnterior.seller = compra.seller;
          if (!compraAnterior.store) compraAnterior.store = compra.store;
        } else {
          comprasDiarias.push({ ...compra, day: dia, itemCount: 1 });
        }
      }
      comprasPorCpf.set(cpf, comprasDiarias);
    }
    return { salesByCpf: comprasPorCpf, knownCpfs: cpfsConhecidos, treated: linhasTratadas };
  }

  function localizarPrimeiraCompra(compras, horarioLimite) {
    let inicio = 0;
    let fim = compras.length;
    while (inicio < fim) {
      const meio = (inicio + fim) >>> 1;
      if (compras[meio].purchaseDate.getTime() < horarioLimite) inicio = meio + 1;
      else fim = meio;
    }
    return inicio;
  }

  function complementarRegistro(registro, cliente) {
    const telefones = [...(registro.phones || []), ...((cliente && cliente.phones) || [])].filter((telefone, indice, todos) => telefone && todos.indexOf(telefone) === indice).slice(0, 2);
    return {
      ...registro,
      name: registro.name || (cliente && cliente.name) || "",
      phones: telefones,
      storeOriginal: registro.storeOriginal || (cliente && cliente.store) || "",
      birthDate: cliente ? cliente.birthDate : null,
      professionalClass: cliente ? cliente.professionalClass : "",
      base70LastPurchase: cliente ? cliente.lastPurchase : null,
      base70TotalPurchased: cliente ? cliente.totalPurchased : null,
      base70AverageTicket: cliente ? cliente.averageTicket : null,
      base70Coupons: cliente ? cliente.coupons : "",
      base70LastSeller: cliente ? cliente.lastSeller : ""
    };
  }

  // Atribui cada compra ao envio válido mais recente.

  function obterUltimoEnvioElegivel(envios, dataCompra, diasJanela) {
    if (!envios || !envios.length) return null;
    const horarioCompra = dataCompra.getTime();
    let inicio = 0;
    let fim = envios.length;
    while (inicio < fim) {
      const meio = (inicio + fim) >>> 1;
      if (envios[meio].sendDate.getTime() <= horarioCompra) inicio = meio + 1;
      else fim = meio;
    }
    for (let indice = inicio - 1; indice >= 0; indice -= 1) {
      const envio = envios[indice];
      if (horarioCompra <= adicionarDias(envio.sendDate, diasJanela).getTime()) return envio;
      // Envios anteriores encerram em uma data ainda mais antiga.
      if (calcularDiferencaDias(dataCompra, envio.sendDate) > diasJanela) break;
    }
    return null;
  }

  async function calcularConversoes(registrosEnviados, dadosCompras, clientes, diasJanela, dataFinalPeriodo) {
    const resultados = [];
    const totalRegistros = registrosEnviados.length;
    const enviosPorCpf = new Map();
    for (const registro of registrosEnviados) {
      if (registro.validationReason || !registro.cpf || !registro.sendDate) continue;
      if (!enviosPorCpf.has(registro.cpf)) enviosPorCpf.set(registro.cpf, []);
      enviosPorCpf.get(registro.cpf).push(registro);
    }
    for (const envios of enviosPorCpf.values()) envios.sort((esquerda, direita) => esquerda.sendDate - direita.sendDate || esquerda.sourceRow - direita.sourceRow);
    for (let indice = 0; indice < totalRegistros; indice += 1) {
      const registroOriginal = registrosEnviados[indice];
      const registro = complementarRegistro(registroOriginal, clientes.get(registroOriginal.cpf));
      const resultado = {
        ...registro,
        converted: false,
        status: "Não convertido",
        reason: "",
        purchaseRelation: "Sem compra",
        firstConversionDate: null,
        firstConversionValue: 0,
        lastConversionDate: null,
        lastConversionValue: 0,
        lastConversionSeller: "",
        convertedRevenue: 0,
        convertedPurchases: 0,
        daysToConversion: null,
        foundIn600: Boolean(registro.cpf && dadosCompras.knownCpfs.has(registro.cpf)),
        hadPurchaseBefore: false,
        conversionStore: "",
        conversionSeller: "",
        sellerSource: "Não identificado",
        conversionType: "not-converted",
        attributionStatus: "NÃO CONVERTIDO",
        ownConversion: false,
        otherStore: false
      };
      if (registro.validationReason) {
        resultado.reason = registro.validationReason;
        resultado.status = registro.validationReason.includes("CPF") ? "CPF inválido" : registro.validationReason.includes("Data") ? "Data de envio inválida" : "Não convertido";
        resultados.push(resultado);
        await liberarLote(indice, 0, Math.max(totalRegistros - 1, 1), 60, 82, "Calculando conversões");
        continue;
      }
      const compras = dadosCompras.salesByCpf.get(registro.cpf) || [];
      const horarioEnvio = registro.sendDate.getTime();
      const horarioFimJanela = Math.min(adicionarDias(registro.sendDate, diasJanela).getTime(), dataFinalPeriodo.getTime());
      const indiceInicial = localizarPrimeiraCompra(compras, horarioEnvio);
      const indiceFinal = localizarPrimeiraCompra(compras, horarioFimJanela + 1);
      resultado.hadPurchaseBefore = indiceInicial > 0;
      const comprasElegiveis = [];
      for (let indiceCompra = indiceInicial; indiceCompra < indiceFinal; indiceCompra += 1) {
        if (obterUltimoEnvioElegivel(enviosPorCpf.get(registro.cpf), compras[indiceCompra].purchaseDate, diasJanela) === registroOriginal) comprasElegiveis.push(compras[indiceCompra]);
      }
      if (comprasElegiveis.length) {
        const primeiraCompra = comprasElegiveis[0];
        const ultimaCompra = comprasElegiveis[comprasElegiveis.length - 1];
        let receita = 0;
        for (const compra of comprasElegiveis) receita += Number(compra.saleValue) || 0;
        resultado.converted = true;
        resultado.status = "Convertido";
        resultado.firstConversionDate = primeiraCompra.purchaseDate;
        resultado.firstConversionValue = Number(primeiraCompra.saleValue) || 0;
        resultado.lastConversionDate = ultimaCompra.purchaseDate;
        resultado.lastConversionValue = Number(ultimaCompra.saleValue) || 0;
        resultado.convertedRevenue = receita;
        resultado.convertedPurchases = comprasElegiveis.length;
        resultado.daysToConversion = calcularDiferencaDias(primeiraCompra.purchaseDate, registro.sendDate);
        resultado.purchaseRelation = resultado.daysToConversion === 0 ? "Compra no dia do envio" : "Compra depois do envio";
        resultado.conversionStore = primeiraCompra.store;
        const clienteBase70 = clientes.get(registro.cpf);
        resultado.conversionSeller = primeiraCompra.seller || (clienteBase70 && clienteBase70.lastSeller) || "";
        resultado.lastConversionSeller = ultimaCompra.seller || resultado.conversionSeller;
        resultado.sellerSource = primeiraCompra.seller ? "Base 600" : resultado.conversionSeller ? "Base 70" : "Não identificado";
        const atribuicao = classificarConversao(registro, { ...primeiraCompra, seller: resultado.conversionSeller }, resultado.sellerSource);
        resultado.conversionType = atribuicao.type;
        resultado.attributionStatus = atribuicao.label;
        resultado.ownConversion = atribuicao.own;
        resultado.otherStore = Boolean(atribuicao.otherStore);
        resultado.status = atribuicao.label;
        resultado.storeFinal = resultado.storeFinal || primeiraCompra.store;
      } else if (indiceInicial < indiceFinal) {
        resultado.reason = "Conversão atribuída ao envio mais recente";
        resultado.purchaseRelation = "Compra depois do envio";
      } else if (!resultado.foundIn600) {
        resultado.reason = "CPF não encontrado na Base 600";
        resultado.status = resultado.reason;
      } else if (!compras.length) {
        resultado.reason = "Sem compra válida na Base 600";
      } else if (indiceInicial < compras.length) {
        resultado.reason = "Compra fora da janela de conversão";
        resultado.status = "Compra fora do período";
        resultado.purchaseRelation = "Compra depois do envio";
      } else if (resultado.hadPurchaseBefore) {
        resultado.reason = "Compra antes do envio";
        resultado.status = resultado.reason;
        resultado.purchaseRelation = "Compra antes do envio";
        registrarErro("Conversão", registro.sourceRow, "Data da compra", formatarData(compras[compras.length - 1].purchaseDate), "Compra anterior ao envio; não contabilizada como conversão");
      } else {
        resultado.reason = "Sem compra na Base 600";
      }
      resultados.push(resultado);
      await liberarLote(indice, 0, Math.max(totalRegistros - 1, 1), 60, 82, "Calculando conversões");
    }
    return resultados;
  }

  async function calcular() {
    if (estado.processing) return;
    estado.processing = true;
    ocultarAlerta();
    const botao = obterElemento("convCalculateBtn");
    botao.disabled = true;
    obterElemento("convExportBtn").disabled = true;
    estado.errors = [];
    estado.errorOverflow = 0;
    estado.duplicates = [];
    estado.duplicateOverflow = 0;
    estado.logs = [];
    try {
      validarColunasObrigatorias();
      const diasJanela = obterDiasJanelaConversao();
      const dataInicialPeriodo = interpretarDataBrasileira(obterElemento("convPeriodStart").value);
      const dataFinalPeriodo = interpretarDataBrasileira(obterElemento("convPeriodEnd").value);
      if (!dataInicialPeriodo || !dataFinalPeriodo) throw new Error("Informe datas inicial e final válidas para a Conversão Geral Acumulada.");
      if (dataInicialPeriodo > dataFinalPeriodo) throw new Error("A data inicial da conversão geral não pode ser maior que a data final.");
      atualizarProgresso(4, "Validando arquivos e colunas");
      await liberarInterface();
      registrarLog("Validação inicial concluída.");

      atualizarProgresso(10, "Normalizando campanha enviada");
      const campanhaEnviada = await prepararCampanhaEnviada();
      registrarLog(`Campanha enviada: ${formatarNumero(campanhaEnviada.records.length)} acionamentos únicos válidos ou auditáveis.`);

      atualizarProgresso(20, "Tratando cadastro da Base 70");
      const base70 = await prepararBase70();
      registrarLog(`Base 70: ${formatarNumero(base70.customers.size)} CPFs indexados.`);

      atualizarProgresso(32, "Indexando compras da Base 600 por CPF");
      const base600 = await prepararBase600();
      registrarLog(`Base 600: ${formatarNumero(base600.treated.length)} registros tratados; ${formatarNumero(base600.salesByCpf.size)} CPFs com compra válida.`);

      atualizarProgresso(60, "Aplicando datas e janela de conversão");
      const enviosNoPeriodo = campanhaEnviada.records.filter((registro) => !registro.sendDate || (registro.sendDate >= dataInicialPeriodo && registro.sendDate <= dataFinalPeriodo));
      if (campanhaEnviada.records.length && !enviosNoPeriodo.length) {
        const datasDetectadas = campanhaEnviada.records
          .map((registro) => registro.sendDate)
          .filter(Boolean)
          .sort((primeira, segunda) => primeira - segunda);
        const periodoDetectado = datasDetectadas.length
          ? ` Datas detectadas no arquivo: ${formatarData(datasDetectadas[0])} a ${formatarData(datasDetectadas[datasDetectadas.length - 1])}.`
          : "";
        throw new Error(`Nenhum acionamento ficou dentro do período de ${formatarData(dataInicialPeriodo)} a ${formatarData(dataFinalPeriodo)}.${periodoDetectado} Confira as datas no topo do arquivo.`);
      }
      const resultados = await calcularConversoes(enviosNoPeriodo, base600, base70.customers, diasJanela, dataFinalPeriodo);
      atualizarProgresso(84, "Calculando indicadores e insights");
      await liberarInterface();

      estado.result = {
        generatedAt: new Date(),
        windowDays: diasJanela,
        periodStart: dataInicialPeriodo,
        periodEnd: dataFinalPeriodo,
        results: resultados,
        sentTreated: campanhaEnviada.treated,
        base600Treated: base600.treated,
        base70Treated: base70.treated,
        base600KnownCpfs: base600.knownCpfs.size,
        sourceCounts: {
          sent: campanhaEnviada.treated.length,
          base600: base600.treated.length,
          base70: base70.treated.length
        }
      };
      preencherFiltros(resultados);
      atualizarProgresso(92, "Gerando gráficos e tabelas");
      obterElemento("convResults").classList.remove("hidden");
      renderizarPainel();
      documento.dispatchEvent(new CustomEvent("crm:conversion-calculated"));
      obterElemento("convExportBtn").disabled = false;
      obterElemento("convLogBtn").disabled = false;
      atualizarProgresso(100, "Finalizado com sucesso");
      const convertidos = resultados.filter((resultado) => resultado.converted).length;
      const externas = resultados.filter((resultado) => resultado.converted && !resultado.ownConversion).length;
      registrarLog(`Resultado: ${formatarNumero(convertidos)} convertidos e ${formatarNumero(resultados.length - convertidos)} não convertidos.`);
      registrarLog(`Atribuição: ${formatarNumero(resultados.filter((r) => r.ownConversion).length)} próprias e ${formatarNumero(externas)} fora do responsável original.`);
      if (estado.errors.length || estado.errorOverflow || estado.duplicates.length) {
        mostrarAlerta("Base processada com avisos. Confira os insights e a aba ERROS_VALIDACAO ao exportar.", "warning");
      } else if (!convertidos) {
        mostrarAlerta("Processamento concluído, mas nenhuma conversão foi encontrada dentro da janela definida.", "warning");
      } else {
        mostrarAlerta("Conversões calculadas com sucesso.", "success");
      }
      obterElemento("convResults").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (erro) {
      atualizarProgresso(0, "Processamento interrompido");
      mostrarAlerta(erro.message || "Não foi possível calcular as conversões.", "error");
    } finally {
      botao.disabled = false;
      estado.processing = false;
    }
  }

  function registrarLog(mensagem) {
    estado.logs.push({ time: new Date(), message: mensagem });
    const destino = obterElemento("convLogs");
    if (!destino) return;
    destino.classList.remove("hidden");
    destino.innerHTML = estado.logs
      .slice(-8)
      .map((entrada) => `<span><time>${entrada.time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>${escaparHtml(entrada.message)}</span>`)
      .join("");
  }

  function baixarLogProcessamento() {
    if (!estado.result) return;
    const linhas = ["CRM Studio - Log de processamento", `Gerado em: ${estado.result.generatedAt.toLocaleString("pt-BR")}`, ""];
    estado.logs.forEach((item) => linhas.push(`[${item.time.toLocaleTimeString("pt-BR")}] ${item.message}`));
    linhas.push("", `Erros/avisos: ${estado.errors.length + estado.errorOverflow}`, `Duplicidades: ${estado.duplicates.length + estado.duplicateOverflow}`);
    estado.errors.forEach((erro) => linhas.push(`${erro.file || erro.arquivo || "Validação"}; linha ${erro.row || erro.linha || ""}; ${erro.reason || erro.motivo || ""}`));
    const url = URL.createObjectURL(new Blob([linhas.join("\r\n")], { type: "text/plain;charset=utf-8" }));
    const link = documento.createElement("a");
    link.href = url;
    link.download = `CRM_LOG_CONVERSOES_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function mostrarAlerta(mensagem, tipo) {
    const alerta = obterElemento("convAlert");
    alerta.className = `alert conv-alert is-${tipo || "warning"}`;
    alerta.textContent = mensagem;
  }

  function ocultarAlerta() {
    const alerta = obterElemento("convAlert");
    if (alerta) alerta.classList.add("hidden");
  }

  // Indicadores, filtros e insights

  function agruparResultados(resultados, obterAgrupador) {
    const grupos = new Map();
    for (const resultado of resultados) {
      const rotulo = limparTexto(obterAgrupador(resultado)) || "Não informado";
      if (!grupos.has(rotulo)) grupos.set(rotulo, { label: rotulo, sent: 0, converted: 0, notConverted: 0, revenue: 0, purchases: 0 });
      const grupo = grupos.get(rotulo);
      grupo.sent += 1;
      if (resultado.converted) {
        grupo.converted += 1;
        grupo.revenue += resultado.convertedRevenue;
        grupo.purchases += resultado.convertedPurchases;
      } else grupo.notConverted += 1;
    }
    return [...grupos.values()].map((grupo) => ({ ...grupo, rate: grupo.sent ? grupo.converted / grupo.sent * 100 : 0 }));
  }

  function obterMelhorGrupo(grupos, metrica) {
    const gruposElegiveis = grupos.filter((grupo) => grupo.label !== "Não informado" && grupo.sent > 0);
    if (!gruposElegiveis.length) return null;
    return gruposElegiveis.slice().sort((esquerda, direita) =>
      direita[metrica] - esquerda[metrica]
      || direita.converted - esquerda.converted
      || direita.revenue - esquerda.revenue
      || direita.sent - esquerda.sent
    )[0];
  }

  function calcularIndicadores(resultados) {
    const linhasConvertidas = resultados.filter((resultado) => resultado.converted);
    const totalEnviados = resultados.length;
    const cpfsUnicos = new Set(resultados.map((resultado) => resultado.cpf).filter(Boolean)).size;
    const totalConvertidos = linhasConvertidas.length;
    const totalNaoConvertidos = totalEnviados - totalConvertidos;
    const totalDatasEnvio = new Set(resultados.map((r) => criarChaveData(r.sendDate)).filter(Boolean)).size;
    const comprasAntes = resultados.filter((r) => !r.converted && r.reason === "Compra antes do envio").length;
    const semCompra600 = resultados.filter((r) => !r.foundIn600).length;
    const receita = linhasConvertidas.reduce((soma, resultado) => soma + resultado.convertedRevenue, 0);
    const compras = linhasConvertidas.reduce((soma, resultado) => soma + resultado.convertedPurchases, 0);
    const totalDias = linhasConvertidas.reduce((soma, resultado) => soma + (resultado.daysToConversion || 0), 0);
    const proprias = linhasConvertidas.filter((resultado) => resultado.ownConversion);
    const outrosVendedores = linhasConvertidas.filter((resultado) => resultado.conversionType === "other-seller");
    const outrasLojas = linhasConvertidas.filter((resultado) => resultado.conversionType === "other-store");
    const semVendedor = linhasConvertidas.filter((resultado) => resultado.conversionType === "unidentified");
    const receitaPropria = proprias.reduce((soma, resultado) => soma + resultado.convertedRevenue, 0);
    const receitaOutros = outrosVendedores.reduce((soma, resultado) => soma + resultado.convertedRevenue, 0);
    const receitaOutrasLojas = outrasLojas.reduce((soma, resultado) => soma + resultado.convertedRevenue, 0);
    const gruposCampanha = agruparResultados(resultados, (resultado) => resultado.campaign);
    const gruposResponsavel = agruparResultados(resultados, (resultado) => resultado.responsible);
    const gruposLoja = agruparResultados(resultados, (resultado) => resultado.storeOriginal);
    const gruposData = agruparResultados(resultados, (resultado) => criarChaveData(resultado.sendDate));
    return {
      totalSent: totalEnviados,
      uniqueCpfs: cpfsUnicos,
      converted: totalConvertidos,
      notConverted: totalNaoConvertidos,
      sendDates: totalDatasEnvio,
      purchasesBefore: comprasAntes,
      notFound600: semCompra600,
      rate: totalEnviados ? totalConvertidos / totalEnviados * 100 : 0,
      revenue: receita,
      ticket: compras ? receita / compras : 0,
      valuePerSent: totalEnviados ? receita / totalEnviados : 0,
      purchases: compras,
      own: proprias.length,
      otherSellers: outrosVendedores.length,
      otherStores: outrasLojas.length,
      unidentifiedSeller: semVendedor.length,
      ownRevenue: receitaPropria,
      otherSellerRevenue: receitaOutros,
      otherStoreRevenue: receitaOutrasLojas,
      ownRate: totalEnviados ? proprias.length / totalEnviados * 100 : 0,
      ownTicket: proprias.length ? receitaPropria / proprias.length : 0,
      averageDays: totalConvertidos ? totalDias / totalConvertidos : 0,
      sameDay: linhasConvertidas.filter((resultado) => resultado.daysToConversion === 0).length,
      within7: linhasConvertidas.filter((resultado) => resultado.daysToConversion <= 7).length,
      within15: linhasConvertidas.filter((resultado) => resultado.daysToConversion <= 15).length,
      within30: linhasConvertidas.filter((resultado) => resultado.daysToConversion <= 30).length,
      bestCampaignRate: obterMelhorGrupo(gruposCampanha, "rate"),
      bestCampaignRevenue: obterMelhorGrupo(gruposCampanha, "revenue"),
      bestResponsibleRate: obterMelhorGrupo(gruposResponsavel, "rate"),
      bestResponsibleRevenue: obterMelhorGrupo(gruposResponsavel, "revenue"),
      bestStoreRate: obterMelhorGrupo(gruposLoja, "rate"),
      bestDateRate: obterMelhorGrupo(gruposData, "rate"),
      groups: { campaign: gruposCampanha, responsible: gruposResponsavel, store: gruposLoja, date: gruposData }
    };
  }

  function obterValorSelecionado(identificador) {
    const elemento = obterElemento(identificador);
    return elemento ? elemento.value : "";
  }

  function obterResultadosFiltrados() {
    if (!estado.result) return [];
    const dataInicial = obterValorSelecionado("convFilterDateFrom");
    const dataFinal = obterValorSelecionado("convFilterDateTo");
    const campanha = obterValorSelecionado("convFilterCampaign");
    const responsavel = obterValorSelecionado("convFilterResponsible");
    const vendedor = obterValorSelecionado("convFilterSeller");
    const loja = obterValorSelecionado("convFilterStore");
    const lojaCompra = obterValorSelecionado("convFilterPurchaseStore");
    const tipo = obterValorSelecionado("convFilterType");
    const situacao = obterValorSelecionado("convFilterStatus");
    const prazo = obterValorSelecionado("convFilterTime");
    const busca = normalizarTexto(obterValorSelecionado("convFilterSearch"));
    return estado.result.results.filter((resultado) => {
      const chaveEnvio = criarChaveData(resultado.sendDate);
      if (dataInicial && (!chaveEnvio || chaveEnvio < dataInicial)) return false;
      if (dataFinal && (!chaveEnvio || chaveEnvio > dataFinal)) return false;
      if (campanha && resultado.campaign !== campanha) return false;
      if (responsavel && resultado.responsible !== responsavel) return false;
      if (vendedor && resultado.conversionSeller !== vendedor) return false;
      if (loja && resultado.storeOriginal !== loja) return false;
      if (lojaCompra && resultado.conversionStore !== lojaCompra) return false;
      if (tipo && resultado.conversionType !== tipo) return false;
      if (situacao === "converted" && !resultado.converted) return false;
      if (situacao === "not-converted" && resultado.converted) return false;
      if (prazo) {
        if (!resultado.converted) return false;
        if (prazo === "same" && resultado.daysToConversion !== 0) return false;
        if (["7", "15", "30"].includes(prazo) && resultado.daysToConversion > Number(prazo)) return false;
        if (prazo === "over30" && resultado.daysToConversion <= 30) return false;
      }
      if (busca) {
        const textoPesquisa = normalizarTexto(`${resultado.name} ${resultado.cpf} ${(resultado.phones || []).join(" ")} ${resultado.campaign} ${resultado.responsible}`);
        if (!textoPesquisa.includes(busca)) return false;
      }
      return true;
    });
  }

  function preencherFiltros(resultados) {
    preencherOpcoesSeletor("convFilterCampaign", [...new Set(resultados.map((resultado) => resultado.campaign).filter(Boolean))], "Todas");
    preencherOpcoesSeletor("convFilterResponsible", [...new Set(resultados.map((resultado) => resultado.responsible).filter(Boolean))], "Todos");
    preencherOpcoesSeletor("convFilterSeller", [...new Set(resultados.map((resultado) => resultado.conversionSeller).filter(Boolean))], "Todos");
    preencherOpcoesSeletor("convFilterStore", [...new Set(resultados.map((resultado) => resultado.storeOriginal).filter(Boolean))], "Todas");
    preencherOpcoesSeletor("convFilterPurchaseStore", [...new Set(resultados.map((resultado) => resultado.conversionStore).filter(Boolean))], "Todas");
    obterElemento("convFilterDateFrom").value = "2026-06-15";
    obterElemento("convFilterDateTo").value = criarChaveData(new Date());
  }

  function preencherOpcoesSeletor(identificador, valores, rotuloTodos) {
    const seletor = obterElemento(identificador);
    seletor.innerHTML = "";
    seletor.add(new Option(rotuloTodos, ""));
    valores
      .sort((esquerda, direita) => esquerda.localeCompare(direita, "pt-BR", { numeric: true }))
      .forEach((valor) => seletor.add(new Option(valor, valor)));
  }

  function limparFiltros() {
    const identificadores = [
      "convFilterDateFrom",
      "convFilterDateTo",
      "convFilterCampaign",
      "convFilterResponsible",
      "convFilterSeller",
      "convFilterStore",
      "convFilterPurchaseStore",
      "convFilterType",
      "convFilterStatus",
      "convFilterTime",
      "convFilterSearch"
    ];
    identificadores.forEach((identificador) => { obterElemento(identificador).value = ""; });
    renderizarPainel();
  }

  function formatarMetricaGrupo(grupo, modo) {
    if (!grupo) return "—";
    if (modo === "rate") return `${grupo.label} · ${formatarPercentual(grupo.rate)}`;
    if (modo === "money") return `${grupo.label} · ${formatarMoeda(grupo.revenue)}`;
    return grupo.label;
  }

  function renderizarIndicadores(indicadores) {
    const itens = [
      ["Clientes enviados", formatarNumero(indicadores.totalSent)],
      ["CPFs únicos enviados", formatarNumero(indicadores.uniqueCpfs)],
      ["Datas de envio identificadas", formatarNumero(indicadores.sendDates)],
      ["Clientes convertidos", formatarNumero(indicadores.converted)],
      ["Não convertidos", formatarNumero(indicadores.notConverted)],
      ["Compra antes do envio", formatarNumero(indicadores.purchasesBefore)],
      ["Sem compra na Base 600", formatarNumero(indicadores.notFound600)],
      ["Taxa de conversão", formatarPercentual(indicadores.rate)],
      ["Conversões próprias", formatarNumero(indicadores.own)],
      ["Taxa de conversão própria", formatarPercentual(indicadores.ownRate)],
      ["Outros vendedores", formatarNumero(indicadores.otherSellers)],
      ["Outras lojas", formatarNumero(indicadores.otherStores)],
      ["Sem vendedor identificado", formatarNumero(indicadores.unidentifiedSeller)],
      ["Receita convertida", formatarMoeda(indicadores.revenue)],
      ["Receita própria", formatarMoeda(indicadores.ownRevenue)],
      ["Receita de outros vendedores", formatarMoeda(indicadores.otherSellerRevenue)],
      ["Receita de outras lojas", formatarMoeda(indicadores.otherStoreRevenue)],
      ["Ticket médio convertido", formatarMoeda(indicadores.ticket)],
      ["Valor por cliente enviado", formatarMoeda(indicadores.valuePerSent)],
      ["Compras após o envio", formatarNumero(indicadores.purchases)],
      ["Tempo médio até conversão", `${formatadorDecimal.format(indicadores.averageDays)} dias`],
      ["Conversão no mesmo dia", formatarNumero(indicadores.sameDay)],
      ["Conversão em até 7 dias", formatarNumero(indicadores.within7)],
      ["Conversão em até 15 dias", formatarNumero(indicadores.within15)],
      ["Conversão em até 30 dias", formatarNumero(indicadores.within30)],
      ["Melhor campanha · taxa", formatarMetricaGrupo(indicadores.bestCampaignRate, "rate")],
      ["Melhor campanha · receita", formatarMetricaGrupo(indicadores.bestCampaignRevenue, "money")],
      ["Melhor responsável · taxa", formatarMetricaGrupo(indicadores.bestResponsibleRate, "rate")],
      ["Melhor responsável · receita", formatarMetricaGrupo(indicadores.bestResponsibleRevenue, "money")],
      ["Melhor loja original", formatarMetricaGrupo(indicadores.bestStoreRate, "rate")],
      ["Melhor data de envio", indicadores.bestDateRate ? `${formatarData(interpretarDataBrasileira(indicadores.bestDateRate.label))} · ${formatarPercentual(indicadores.bestDateRate.rate)}` : "—"]
    ];
    obterElemento("convKpis").innerHTML = itens
      .map(([rotulo, valor]) => `<div class="metric conv-metric"><span>${escaparHtml(rotulo)}</span><strong>${escaparHtml(valor)}</strong></div>`)
      .join("");
  }

  function gerarAnalises(resultados, indicadores) {
    if (!resultados.length) return ["Nenhum cliente corresponde aos filtros atuais."];
    if (!indicadores.converted) {
      return [
        "Nenhuma conversão foi localizada neste recorte dentro da janela definida.",
        `${formatarNumero(resultados.filter((resultado) => resultado.reason === "Compra antes do envio").length)} clientes compraram apenas antes do envio e foram corretamente desconsiderados.`,
        `A receita média por cliente enviado foi ${formatarMoeda(0)}.`
      ];
    }
    const analises = [];
    const inicio = estado.result && estado.result.periodStart ? formatarData(estado.result.periodStart) : "15/06/2026";
    const fim = estado.result && estado.result.periodEnd ? formatarData(estado.result.periodEnd) : "hoje";
    analises.push(`De ${inicio} até ${fim}, foram analisados ${formatarNumero(indicadores.totalSent)} CPFs enviados, com conversão geral acumulada de ${formatarPercentual(indicadores.rate)}.`);
    analises.push(`${formatarNumero(indicadores.purchasesBefore)} CPFs compraram apenas antes do envio e não foram considerados conversão.`);
    if (estado.duplicates.length || estado.duplicateOverflow) analises.push(`${formatarNumero(estado.duplicates.length + estado.duplicateOverflow)} registros duplicados na mesma data foram identificados e retirados da contagem.`);
    analises.push(`${formatarNumero(indicadores.own)} clientes converteram com o próprio responsável da base.`);
    analises.push(`${formatarNumero(indicadores.otherSellers)} clientes converteram com vendedores diferentes, somando ${formatarMoeda(indicadores.otherSellerRevenue)} em receita.`);
    if (indicadores.otherStores) analises.push(`${formatarNumero(indicadores.otherStores)} conversões ocorreram em loja diferente da loja final indicada na base.`);
    if (indicadores.unidentifiedSeller) analises.push(`${formatarNumero(indicadores.unidentifiedSeller)} vendas não puderam ser corretamente atribuídas porque o vendedor não veio da Base 600.`);
    if (indicadores.bestCampaignRate) analises.push(`A campanha ${indicadores.bestCampaignRate.label} teve a maior taxa de conversão, com ${formatarPercentual(indicadores.bestCampaignRate.rate)}.`);
    else analises.push("Não foi possível calcular conversão por campanha porque a coluna Campanha não possui valores válidos neste recorte.");
    if (indicadores.bestCampaignRevenue) analises.push(`A campanha ${indicadores.bestCampaignRevenue.label} gerou a maior receita, com ${formatarMoeda(indicadores.bestCampaignRevenue.revenue)}.`);
    if (indicadores.bestResponsibleRate) analises.push(`${indicadores.bestResponsibleRate.label} apresentou o melhor desempenho de conversão, com ${formatarPercentual(indicadores.bestResponsibleRate.rate)}.`);
    else analises.push("Não foi possível calcular conversão por responsável porque a coluna Responsável não foi localizada ou está vazia.");
    const percentualSeteDias = indicadores.converted ? indicadores.within7 / indicadores.converted * 100 : 0;
    analises.push(`${formatarPercentual(percentualSeteDias)} das conversões ocorreram em até 7 dias após o envio.`);
    if (indicadores.bestDateRate) analises.push(`A base enviada em ${formatarData(interpretarDataBrasileira(indicadores.bestDateRate.label))} teve o melhor desempenho geral, com ${formatarPercentual(indicadores.bestDateRate.rate)} de conversão.`);
    if (indicadores.bestStoreRate) analises.push(`A loja original ${indicadores.bestStoreRate.label} teve a maior taxa de conversão, com ${formatarPercentual(indicadores.bestStoreRate.rate)}.`);
    else analises.push("Não foi possível calcular conversão por loja porque a loja original não foi informada.");
    const comprasAnteriores = resultados.filter((resultado) => !resultado.converted && resultado.reason === "Compra antes do envio").length;
    analises.push(`${formatarNumero(comprasAnteriores)} clientes compraram antes do envio e, por regra, não foram considerados conversão.`);
    analises.push(`${formatarNumero(estado.duplicates.length + estado.duplicateOverflow)} ocorrências duplicadas foram identificadas e retiradas da contagem.`);
    const gruposCampanha = indicadores.groups.campaign.filter((grupo) => grupo.label !== "Não informado" && grupo.sent >= 3);
    if (gruposCampanha.length) {
      const menorResultado = gruposCampanha.slice().sort((esquerda, direita) => esquerda.rate - direita.rate)[0];
      if (menorResultado.rate < indicadores.rate) analises.push(`A campanha ${menorResultado.label} ficou abaixo da média geral, com ${formatarPercentual(menorResultado.rate)}; vale revisar público, abordagem ou momento do contato.`);
    }
    analises.push(`A receita média por cliente enviado foi ${formatarMoeda(indicadores.valuePerSent)}.`);
    if (estado.errors.length || estado.errorOverflow) analises.push(`A validação registrou ${formatarNumero(estado.errors.length + estado.errorOverflow)} avisos durante o processamento.`);
    return analises;
  }

  function renderizarAnalises(resultados, indicadores) {
    const analises = gerarAnalises(resultados, indicadores);
    obterElemento("convInsights").innerHTML = analises
      .map((analise, indice) => `<article class="conv-insight"><span>${indice + 1}</span><p>${escaparHtml(analise)}</p></article>`)
      .join("");
  }

  const COLUNAS_CONVERTIDOS = [
    ["CPF", (linha) => formatarCpf(linha.cpf)],
    ["CPF normalizado", (linha) => linha.cpf],
    ["Nome", (linha) => linha.name],
    ["Telefone", (linha) => (linha.phones || []).map(formatarTelefone).join(" | ")],
    ["Loja original", (linha) => linha.storeOriginal],
    ["Loja final", (linha) => linha.storeFinal],
    ["Campanha", (linha) => linha.campaign],
    ["Responsável da base", (linha) => linha.responsible],
    ["Data de envio", (linha) => formatarData(linha.sendDate)],
    ["Coluna de origem", (linha) => linha.sourceColumn || linha.origin],
    ["Data da conversão", (linha) => formatarData(linha.firstConversionDate)],
    ["Dias", (linha) => linha.daysToConversion],
    ["Primeira conversão", (linha) => formatarMoeda(linha.firstConversionValue)],
    ["Receita na janela", (linha) => formatarMoeda(linha.convertedRevenue)],
    ["Vendedor real", (linha) => linha.conversionSeller || "Não identificado"],
    ["Origem do vendedor", (linha) => linha.sellerSource],
    ["Loja da compra", (linha) => linha.conversionStore],
    ["Compra antes do envio", (linha) => linha.hadPurchaseBefore ? "Sim" : "Não"],
    ["Compra dentro do período", () => "Sim"],
    ["Tipo", (linha) => linha.attributionStatus],
    ["Status", (linha) => linha.status]
  ];

  const COLUNAS_NAO_CONVERTIDOS = [
    ["CPF", (linha) => formatarCpf(linha.cpf) || "Inválido"],
    ["CPF normalizado", (linha) => linha.cpf],
    ["Nome", (linha) => linha.name],
    ["Telefone", (linha) => (linha.phones || []).map(formatarTelefone).join(" | ")],
    ["Loja original", (linha) => linha.storeOriginal],
    ["Loja final", (linha) => linha.storeFinal],
    ["Campanha", (linha) => linha.campaign],
    ["Responsável", (linha) => linha.responsible],
    ["Data de envio", (linha) => formatarData(linha.sendDate)],
    ["Coluna de origem", (linha) => linha.sourceColumn || linha.origin],
    ["Compra antes do envio", (linha) => linha.hadPurchaseBefore ? "Sim" : "Não"],
    ["Motivo", (linha) => linha.reason],
    ["Relação da compra", (linha) => linha.purchaseRelation],
    ["Status", (linha) => linha.status]
  ];

  function renderizarTabelaResultados(identificadorDestino, linhas, colunas) {
    const destino = obterElemento(identificadorDestino);
    if (!linhas.length) {
      destino.innerHTML = "<p class=\"conv-empty\">Nenhum registro encontrado neste recorte.</p>";
      return;
    }
    const linhasVisiveis = linhas.slice(0, LIMITE_LINHAS_TABELA);
    const cabecalho = colunas.map(([rotulo]) => `<th>${escaparHtml(rotulo)}</th>`).join("");
    const corpo = linhasVisiveis.map((linha) => {
      const celulas = colunas.map(([rotulo, obterValor]) => {
        const classe = rotulo === "Status" ? ` class="conv-status-cell ${linha.converted ? "is-converted" : "is-not-converted"}"` : "";
        return `<td${classe}>${escaparHtml(obterValor(linha))}</td>`;
      }).join("");
      return `<tr>${celulas}</tr>`;
    }).join("");
    const aviso = linhas.length > linhasVisiveis.length
      ? `<p class="conv-table-note">Exibindo ${formatarNumero(linhasVisiveis.length)} de ${formatarNumero(linhas.length)} registros para manter a tela rápida. O Excel inclui todos.</p>`
      : "";
    destino.innerHTML = `<table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>${aviso}`;
  }

  // Gráficos do painel

  function agruparDadosGraficos(resultados) {
    const porData = agruparResultados(resultados, (resultado) => criarChaveData(resultado.sendDate))
      .sort((esquerda, direita) => esquerda.label.localeCompare(direita.label));
    const porCampanha = agruparResultados(resultados, (resultado) => resultado.campaign)
      .sort((esquerda, direita) => direita.sent - esquerda.sent);
    const porResponsavel = agruparResultados(resultados, (resultado) => resultado.responsible)
      .sort((esquerda, direita) => direita.sent - esquerda.sent);
    const porLoja = agruparResultados(resultados, (resultado) => resultado.storeOriginal)
      .sort((esquerda, direita) => direita.sent - esquerda.sent)
      .slice(0, 20);
    const porDia = agruparResultados(
      resultados.filter((resultado) => resultado.converted),
      (resultado) => criarChaveData(resultado.firstConversionDate)
    ).sort((esquerda, direita) => esquerda.label.localeCompare(direita.label));
    const porPrazo = [
      { label: "Mesmo dia", value: resultados.filter((resultado) => resultado.converted && resultado.daysToConversion === 0).length },
      { label: "1 a 3 dias", value: resultados.filter((resultado) => resultado.converted && resultado.daysToConversion >= 1 && resultado.daysToConversion <= 3).length },
      { label: "4 a 7 dias", value: resultados.filter((resultado) => resultado.converted && resultado.daysToConversion >= 4 && resultado.daysToConversion <= 7).length },
      { label: "8 a 15 dias", value: resultados.filter((resultado) => resultado.converted && resultado.daysToConversion >= 8 && resultado.daysToConversion <= 15).length },
      { label: "16 a 30 dias", value: resultados.filter((resultado) => resultado.converted && resultado.daysToConversion >= 16 && resultado.daysToConversion <= 30).length },
      { label: "Acima de 30 dias", value: resultados.filter((resultado) => resultado.converted && resultado.daysToConversion > 30).length }
    ];
    const porVendedor = agruparResultados(resultados.filter((r) => r.converted), (r) => r.conversionSeller).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    const porLojaCompra = agruparResultados(resultados.filter((r) => r.converted), (r) => r.conversionStore).sort((a, b) => b.converted - a.converted).slice(0, 20);
    let acumulado = 0;
    const evolucaoAcumulada = porDia.map((grupo) => ({ label: grupo.label, value: (acumulado += grupo.converted) }));
    let receitaAcumulada = 0;
    const evolucaoReceita = porDia.map((grupo) => ({ label: grupo.label, value: (receitaAcumulada += grupo.revenue) }));
    return { date: porData, campaign: porCampanha, responsible: porResponsavel, store: porLoja, daily: porDia, time: porPrazo, seller: porVendedor, purchaseStore: porLojaCompra, accumulated: evolucaoAcumulada, accumulatedRevenue: evolucaoReceita };
  }

  const PALETA_GRAFICOS = ["#a71930", "#d14c60", "#7f1024", "#ee8e9e", "#263a4a", "#66717d", "#16845b", "#d89a34"];

  function destruirGraficos() {
    if (!estado || !estado.charts) return;
    for (const grafico of estado.charts.values()) {
      try { grafico.destroy(); } catch (_) { /* O gráfico já foi removido. */ }
    }
    estado.charts.clear();
  }

  function criarOpcoesGrafico(ehMoeda, ehPercentual, ehHorizontal) {
    const formatarValorEixo = (valor) => {
      if (ehMoeda) return formatarMoeda(valor);
      if (ehPercentual) return `${valor}%`;
      return formatarNumero(valor);
    };
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: ehHorizontal ? "y" : "x",
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(contexto) {
              const valor = contexto.parsed[ehHorizontal ? "x" : "y"];
              if (ehMoeda) return formatarMoeda(valor);
              if (ehPercentual) return formatarPercentual(valor);
              return formatarNumero(valor);
            }
          }
        }
      },
      scales: {
        y: ehHorizontal
          ? { beginAtZero: true, grid: { display: false } }
          : { beginAtZero: true, ticks: { callback: formatarValorEixo } },
        x: ehHorizontal
          ? { beginAtZero: true, ticks: { callback: formatarValorEixo } }
          : { grid: { display: false } }
      }
    };
  }

  function desenharGrafico(identificador, tipo, rotulos, valores, opcoes) {
    const telaGrafico = obterElemento(identificador);
    if (!telaGrafico) return;
    const corpo = telaGrafico.parentElement;
    corpo.querySelectorAll(".conv-chart-fallback").forEach((elemento) => elemento.remove());
    telaGrafico.hidden = false;
    if (!janela.Chart) {
      telaGrafico.hidden = true;
      renderizarAlternativaGrafico(corpo, rotulos, valores, opcoes && opcoes.currency, opcoes && opcoes.percent);
      return;
    }
    try {
      const grafico = new janela.Chart(telaGrafico.getContext("2d"), {
        type: tipo,
        data: {
          labels: rotulos,
          datasets: [{
            data: valores,
            borderColor: PALETA_GRAFICOS[0],
            backgroundColor: tipo === "doughnut"
              ? rotulos.map((_, indice) => PALETA_GRAFICOS[indice % PALETA_GRAFICOS.length])
              : "rgba(167,25,48,.78)",
            pointBackgroundColor: PALETA_GRAFICOS[0],
            borderWidth: tipo === "line" ? 2 : 0,
            fill: tipo === "line",
            tension: 0.28,
            borderRadius: tipo === "bar" ? 6 : 0
          }]
        },
        options: tipo === "doughnut"
          ? { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
          : criarOpcoesGrafico(opcoes && opcoes.currency, opcoes && opcoes.percent, opcoes && opcoes.horizontal)
      });
      estado.charts.set(identificador, grafico);
    } catch (_) {
      telaGrafico.hidden = true;
      renderizarAlternativaGrafico(corpo, rotulos, valores, opcoes && opcoes.currency, opcoes && opcoes.percent);
    }
  }

  function renderizarAlternativaGrafico(corpo, rotulos, valores, ehMoeda, ehPercentual) {
    const maximo = Math.max(1, ...valores.map((valor) => Number(valor) || 0));
    const conteudo = documento.createElement("div");
    conteudo.className = "conv-chart-fallback";
    const limite = Math.min(rotulos.length, 12);
    if (!limite) conteudo.innerHTML = "<p class=\"conv-empty\">Sem dados para exibir.</p>";
    else conteudo.innerHTML = rotulos.slice(0, limite).map((rotulo, indice) => {
      const valor = Number(valores[indice]) || 0;
      const valorFormatado = ehMoeda ? formatarMoeda(valor) : ehPercentual ? formatarPercentual(valor) : formatarNumero(valor);
      return `<div><span>${escaparHtml(rotulo)}</span><i style="--barra-conversao:${Math.max(2, valor / maximo * 100)}%"></i><strong>${escaparHtml(valorFormatado)}</strong></div>`;
    }).join("");
    corpo.appendChild(conteudo);
  }

  function renderizarGraficos(resultados) {
    destruirGraficos();
    const grupos = agruparDadosGraficos(resultados);
    const rotulosData = grupos.date.map((grupo) => grupo.label === "Não informado" ? grupo.label : formatarData(interpretarDataBrasileira(grupo.label)));
    desenharGrafico("convChartRateDate", "line", rotulosData, grupos.date.map((grupo) => grupo.rate), { percent: true });
    desenharGrafico("convChartRevenueDate", "bar", rotulosData, grupos.date.map((grupo) => grupo.revenue), { currency: true });
    desenharGrafico("convChartRateCampaign", "bar", grupos.campaign.map((grupo) => grupo.label), grupos.campaign.map((grupo) => grupo.rate), { percent: true });
    desenharGrafico("convChartRevenueCampaign", "bar", grupos.campaign.map((grupo) => grupo.label), grupos.campaign.map((grupo) => grupo.revenue), { currency: true });
    desenharGrafico("convChartRateResponsible", "bar", grupos.responsible.map((grupo) => grupo.label), grupos.responsible.map((grupo) => grupo.rate), { percent: true });
    desenharGrafico("convChartRevenueResponsible", "bar", grupos.responsible.map((grupo) => grupo.label), grupos.responsible.map((grupo) => grupo.revenue), { currency: true });
    desenharGrafico("convChartRateStore", "bar", grupos.store.map((grupo) => grupo.label), grupos.store.map((grupo) => grupo.rate), { percent: true, horizontal: true });
    const funil = [
      ["Clientes enviados", resultados.length],
      ["CPFs válidos", resultados.filter((resultado) => Boolean(resultado.cpf)).length],
      ["Encontrados na Base 600", resultados.filter((resultado) => resultado.foundIn600).length],
      ["Clientes convertidos", resultados.filter((resultado) => resultado.converted).length],
      ["Não convertidos", resultados.filter((resultado) => !resultado.converted).length]
    ];
    desenharGrafico("convChartFunnel", "bar", funil.map((item) => item[0]), funil.map((item) => item[1]), { horizontal: true });
    desenharGrafico("convChartTime", "doughnut", grupos.time.map((item) => item.label), grupos.time.map((item) => item.value), {});
    desenharGrafico("convChartDaily", "line", grupos.daily.map((grupo) => formatarData(interpretarDataBrasileira(grupo.label))), grupos.daily.map((grupo) => grupo.converted), {});
    desenharGrafico("convChartDailyRevenue", "bar", grupos.daily.map((grupo) => formatarData(interpretarDataBrasileira(grupo.label))), grupos.daily.map((grupo) => grupo.revenue), { currency: true });
    desenharGrafico("convChartSeller", "bar", grupos.seller.map((g) => g.label), grupos.seller.map((g) => g.converted), { horizontal: true });
    desenharGrafico("convChartSellerRevenue", "bar", grupos.seller.map((g) => g.label), grupos.seller.map((g) => g.revenue), { currency: true, horizontal: true });
    desenharGrafico("convChartAttribution", "doughnut", ["Próprias", "Outros vendedores", "Outras lojas", "Sem vendedor"], [resultados.filter((r) => r.ownConversion).length, resultados.filter((r) => r.conversionType === "other-seller").length, resultados.filter((r) => r.conversionType === "other-store").length, resultados.filter((r) => r.conversionType === "unidentified").length], {});
    desenharGrafico("convChartPurchaseStore", "bar", grupos.purchaseStore.map((g) => g.label), grupos.purchaseStore.map((g) => g.converted), { horizontal: true });
    desenharGrafico("convChartPurchaseStoreRevenue", "bar", grupos.purchaseStore.map((g) => g.label), grupos.purchaseStore.map((g) => g.revenue), { currency: true, horizontal: true });
    desenharGrafico("convChartAccumulated", "line", grupos.accumulated.map((g) => formatarData(interpretarDataBrasileira(g.label))), grupos.accumulated.map((g) => g.value), {});
    desenharGrafico("convChartAccumulatedRevenue", "line", grupos.accumulatedRevenue.map((g) => formatarData(interpretarDataBrasileira(g.label))), grupos.accumulatedRevenue.map((g) => g.value), { currency: true });
  }

  function renderizarPainel() {
    const resultados = obterResultadosFiltrados();
    const indicadores = calcularIndicadores(resultados);
    obterElemento("convResultSummary").textContent = `${formatarNumero(resultados.length)} acionamentos no recorte · janela de ${estado.result.windowDays} dias · processado em ${estado.result.generatedAt.toLocaleString("pt-BR")}`;
    renderizarIndicadores(indicadores);
    renderizarAnalises(resultados, indicadores);
    renderizarGraficos(resultados);
    const convertidos = resultados.filter((resultado) => resultado.converted);
    const naoConvertidos = resultados.filter((resultado) => !resultado.converted);
    obterElemento("convConvertedCount").textContent = `${formatarNumero(convertidos.length)} clientes no recorte atual`;
    obterElemento("convGeneralCount").textContent = `${formatarNumero(resultados.length)} CPFs e acionamentos no recorte atual`;
    const externas = convertidos.filter((resultado) => !resultado.ownConversion).length;
    const alertaAtribuicao = obterElemento("convAttributionAlert");
    alertaAtribuicao.classList.toggle("hidden", !externas);
    alertaAtribuicao.textContent = externas ? `Atenção: ${formatarNumero(externas)} vendas não pertencem ao responsável original da base e foram separadas na atribuição.` : "";
    obterElemento("convNotConvertedCount").textContent = `${formatarNumero(naoConvertidos.length)} clientes no recorte atual`;
    renderizarTabelaResultados("convConvertedTable", convertidos, COLUNAS_CONVERTIDOS);
    renderizarTabelaResultados("convGeneralTable", resultados, COLUNAS_CONVERTIDOS);
    renderizarTabelaResultados("convNotConvertedTable", naoConvertidos, COLUNAS_NAO_CONVERTIDOS);
  }

  // Exporta somente os clientes convertidos na planilha operacional.

  const CABECALHOS_EXPORTACAO_CONVERSOES = ["CPF", "NOME", "LOJA", "VENDEDORA", "ULTIMA COMPRA", "VALOR ULTIMA COMPRA"];
  const NOMES_VENDEDORES_CONVERSAO = {
    patricia: "PATRICIA ULLMANN",
    "patricia ullmann": "PATRICIA ULLMANN",
    sirlene: "SIRLENE SCHAFER",
    "sirlene schafer": "SIRLENE SCHAFER",
    marines: "MARINES BRANT",
    "marines brant": "MARINES BRANT"
  };

  function formatarVendedorRealConversao(valor) {
    const valorNormalizado = normalizarTexto(valor);
    return NOMES_VENDEDORES_CONVERSAO[valorNormalizado] || limparTexto(valor).toLocaleUpperCase("pt-BR") || "NÃO IDENTIFICADO";
  }

  function formatarLojaConversao(linha) {
    const lojaOriginal = linha.storeFinal || linha.conversionStore || linha.storeOriginal || "SCR";
    const loja = normalizarLoja(lojaOriginal);
    if (["ALE", "CGO", "SCR", "SRO"].includes(loja)) return `LOJAS HOJE COM VEST LTDA -${loja}`;
    return limparTexto(lojaOriginal).toLocaleUpperCase("pt-BR");
  }

  function converterDataExcel(valor) {
    if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) return null;
    return Math.round(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()) / MILISSEGUNDOS_POR_DIA) + 25569;
  }

  function criarLinhaOperacionalConversao(linha) {
    return {
      CPF: linha.cpf || "",
      NOME: limparTexto(linha.name).toLocaleUpperCase("pt-BR"),
      LOJA: formatarLojaConversao(linha),
      VENDEDORA: formatarVendedorRealConversao(linha.lastConversionSeller || linha.conversionSeller),
      "ULTIMA COMPRA": converterDataExcel(linha.lastConversionDate || linha.firstConversionDate),
      "VALOR ULTIMA COMPRA": Number(linha.lastConversionValue || linha.firstConversionValue || 0)
    };
  }

  function montarPlanilhaOperacionalConversao(linhas) {
    const planilha = linhas.length
      ? janela.XLSX.utils.json_to_sheet(linhas, { header: CABECALHOS_EXPORTACAO_CONVERSOES })
      : janela.XLSX.utils.aoa_to_sheet([CABECALHOS_EXPORTACAO_CONVERSOES]);
    const limites = obterLimitesPlanilha(planilha);
    const estiloCabecalho = {
      fill: { patternType: "solid", fgColor: { rgb: "4472C4" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "2F5597" } },
        bottom: { style: "thin", color: { rgb: "2F5597" } },
        left: { style: "thin", color: { rgb: "D9E2F3" } },
        right: { style: "thin", color: { rgb: "D9E2F3" } }
      }
    };
    const estiloCorpo = {
      fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
      font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: {
        bottom: { style: "thin", color: { rgb: "D9E2F3" } },
        left: { style: "thin", color: { rgb: "D9E2F3" } },
        right: { style: "thin", color: { rgb: "D9E2F3" } }
      }
    };
    if (limites) {
      for (let linha = limites.s.r; linha <= limites.e.r; linha += 1) {
        for (let coluna = limites.s.c; coluna <= limites.e.c; coluna += 1) {
          const endereco = janela.XLSX.utils.encode_cell({ r: linha, c: coluna });
          if (!planilha[endereco]) planilha[endereco] = { t: "s", v: "" };
          planilha[endereco].s = linha === 0 ? estiloCabecalho : estiloCorpo;
          if (linha > 0 && coluna === 0) planilha[endereco].z = "@";
          if (linha > 0 && coluna === 4) planilha[endereco].z = "dd/mm/yyyy";
          if (linha > 0 && coluna === 5) planilha[endereco].z = "#,##0.00";
        }
      }
    }
    planilha["!cols"] = [{ wch: 15 }, { wch: 34 }, { wch: 38 }, { wch: 23 }, { wch: 18 }, { wch: 24 }];
    planilha["!rows"] = Array.from({ length: Math.max(1, linhas.length + 1) }, (_, indice) => ({ hpt: indice === 0 ? 20 : 18 }));
    planilha["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    return planilha;
  }

  async function exportarConversoesExcel() {
    if (!estado.result || !janela.XLSX) {
      mostrarAlerta("Calcule as conversões antes de exportar e confirme que a biblioteca XLSX está disponível.", "error");
      return;
    }
    const botao = obterElemento("convExportBtn");
    botao.disabled = true;
    const textoAnterior = botao.textContent;
    botao.textContent = "Preparando Excel...";
    try {
      await liberarInterface();
      const clientesConvertidos = estado.result.results.filter((resultado) => resultado.converted);
      const linhasOperacionais = clientesConvertidos.map(criarLinhaOperacionalConversao);
      const pastaTrabalho = janela.XLSX.utils.book_new();
      pastaTrabalho.Props = { Title: "CRM Studio - Conversões", Subject: "Clientes convertidos", Author: "CRM Studio", CreatedDate: new Date() };
      janela.XLSX.utils.book_append_sheet(pastaTrabalho, montarPlanilhaOperacionalConversao(linhasOperacionais), "CONVERTIDOS");

      const agora = new Date();
      const doisDigitos = (numero) => String(numero).padStart(2, "0");
      const identificadorData = `${agora.getFullYear()}${doisDigitos(agora.getMonth() + 1)}${doisDigitos(agora.getDate())}_${doisDigitos(agora.getHours())}${doisDigitos(agora.getMinutes())}`;
      janela.XLSX.writeFile(pastaTrabalho, `CRM_CONVERSOES_${identificadorData}.xlsx`, { compression: true, cellStyles: true });
      mostrarAlerta(`Excel exportado em uma única aba com ${formatarNumero(clientesConvertidos.length)} clientes convertidos.`, "success");
    } catch (erro) {
      mostrarAlerta(`Não foi possível exportar o Excel: ${erro.message || erro}`, "error");
    } finally {
      botao.textContent = textoAnterior;
      botao.disabled = false;
    }
  }

  // Expõe somente os indicadores agregados usados pelo painel da equipe.

  function obterResumoEquipe() {
    if (!estado.result) return null;
    const resultados = estado.result.results;
    const gruposResponsaveis = agruparResultados(
      resultados,
      (resultado) => resultado.responsible
    ).map((grupo) => ({ ...grupo }));
    const gruposVendedores = agruparResultados(
      resultados.filter((resultado) => resultado.converted && resultado.conversionSeller),
      (resultado) => resultado.conversionSeller
    ).map((grupo) => ({ ...grupo }));

    return {
      generatedAt: estado.result.generatedAt.toISOString(),
      windowDays: estado.result.windowDays,
      groups: gruposResponsaveis,
      responsibleGroups: gruposResponsaveis,
      sellerGroups: gruposVendedores,
      workbookAssignmentGroups: (estado.sources.sent.teamAssignmentGroups || [])
        .map((grupo) => ({ ...grupo })),
      generatorAssignmentSummary: janela.CampaignStudio?.getTeamAssignmentSummary?.() || null
    };
  }

  const apiPublica = {
    init: inicializar,
    getTeamSummary: obterResumoEquipe,
    normalizeCpf: normalizarCpf,
    normalizePhone: normalizarTelefone,
    parseBrazilianDate: interpretarDataBrasileira,
    parseBrazilianCurrency: interpretarMoedaBrasileira
  };
  janela.ConversionStudio = Object.freeze(apiPublica);

  function inicializarAutomaticamente() {
    if (obterElemento("conversionApp")) inicializar();
  }
  if (documento.readyState === "loading") documento.addEventListener("DOMContentLoaded", inicializarAutomaticamente, { once: true });
  else inicializarAutomaticamente();
})(window, document);
