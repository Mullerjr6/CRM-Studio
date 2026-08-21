"use strict";

(function iniciarResultadosEquipe(janela, documento) {
  const VENDEDORES_EXCLUIDOS = new Set(["patricia", "patricia ullmann"]);
  const CORES_VENDEDORAS = ["#7f1024", "#16845b", "#2f5597", "#b66a08", "#6f42c1", "#0f766e"];

  let container = null;
  const graficos = new Map();
  let ultimaPersistencia = "";
  let carregandoHistorico = false;

  function normalizar(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("pt-BR");
  }

  function criarChaveVendedora(valor) {
    return normalizar(valor).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  }

  function vendedoraExcluida(valor) {
    const nome = normalizar(valor).replace(/[^a-z0-9]+/g, " ").trim();
    return VENDEDORES_EXCLUIDOS.has(nome) || VENDEDORES_EXCLUIDOS.has(nome.split(" ")[0]);
  }

  function criarIniciais(nome) {
    return String(nome || "?").trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase();
  }

  function formatarNumero(valor) {
    return Number(valor || 0).toLocaleString("pt-BR");
  }

  function formatarPercentual(valor) {
    return `${Number(valor || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}%`;
  }

  function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function montarEstrutura() {
    container.innerHTML = `
      <div class="team-module">
        <section class="section team-intro" aria-labelledby="teamResultsTitle">
          <div class="section-head">
            <div>
              <span class="kicker">Desempenho comercial</span>
              <h2 id="teamResultsTitle">Resultados da equipe</h2>
              <p>Quem converteu os clientes da base da loja, conforme a vendedora real registrada na venda.</p>
              <small id="teamUpdated" class="team-updated">Aguardando o cálculo das conversões.</small>
              <span id="teamPersistenceStatus" class="team-persistence-status is-offline">Banco de dados não conectado</span>
            </div>
            <button class="secondary" type="button" data-open-conversions>Abrir Conversões e Insights</button>
          </div>
        </section>

        <section id="teamEmpty" class="section team-empty">
          <div>
            <span class="team-empty-icon" aria-hidden="true">↗</span>
            <h3>Calcule as conversões para visualizar a equipe</h3>
            <p>Carregue as bases na aba Conversões e Insights. O painel identificará automaticamente as vendedoras reais da Base 600.</p>
            <button class="primary" type="button" data-open-conversions>Ir para Conversões e Insights</button>
          </div>
        </section>

        <div id="teamDashboard" class="hidden">
          <div id="teamKpis" class="team-kpis"></div>
          <div id="teamPersonCards" class="team-person-grid"></div>

          <div class="team-charts-grid">
            <article class="panel team-chart-card">
              <div class="team-chart-head">
                <h3>Conversões por vendedora real</h3>
                <p>Clientes únicos convertidos por quem efetivamente realizou a primeira venda válida.</p>
              </div>
              <div class="team-chart-body">
                <canvas id="teamConversionsChart" role="img" aria-label="Conversões por vendedora real"></canvas>
                <div id="teamConversionsFallback" class="team-chart-fallback hidden"></div>
              </div>
            </article>

            <article class="panel team-chart-card">
              <div class="team-chart-head">
                <h3>Receita por vendedora</h3>
                <p>Valor das compras válidas atribuído pela primeira conversão do cliente.</p>
              </div>
              <div class="team-chart-body">
                <canvas id="teamRevenueChart" role="img" aria-label="Receita convertida por vendedora"></canvas>
                <div id="teamRevenueFallback" class="team-chart-fallback hidden"></div>
              </div>
            </article>
          </div>
        </div>

        <article class="panel team-history-panel">
          <div class="panel-head">
            <div>
              <h3>Histórico salvo</h3>
              <p>Últimos processamentos armazenados no PostgreSQL.</p>
            </div>
            <button class="secondary" type="button" data-refresh-history>Atualizar histórico</button>
          </div>
          <p id="teamHistoryState" class="team-history-state">Conectando ao banco de dados...</p>
          <div id="teamHistoryTable" class="table-wrap team-history-table hidden"></div>
        </article>
      </div>`;

    container.addEventListener("click", (evento) => {
      if (evento.target.closest("[data-open-conversions]")) {
        documento.querySelector('[data-module="conversionApp"]')?.click();
        return;
      }
      if (evento.target.closest("[data-refresh-history]")) carregarHistorico(true);
    });
  }

  function criarMembros(resumo) {
    const totalBase = Number(resumo.totalSent || 0);
    return (resumo.sellerGroups || resumo.groups || [])
      .filter((grupo) => grupo.label && !vendedoraExcluida(grupo.label))
      .map((grupo, indice) => ({
        chave: criarChaveVendedora(grupo.label),
        nome: grupo.label,
        iniciais: criarIniciais(grupo.label),
        cor: CORES_VENDEDORAS[indice % CORES_VENDEDORAS.length],
        sent: totalBase,
        converted: Number(grupo.converted || 0),
        revenue: Number(grupo.revenue || 0),
        purchases: Number(grupo.purchases || 0),
        rate: totalBase ? Number(grupo.converted || 0) / totalBase * 100 : 0,
        conversionShare: resumo.totalConverted
          ? Number(grupo.converted || 0) / Number(resumo.totalConverted) * 100
          : 0
      }))
      .sort((a, b) => b.converted - a.converted || b.revenue - a.revenue || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function montarKpis(membros, resumo) {
    const totalConvertidoVendedoras = membros.reduce((total, membro) => total + membro.converted, 0);
    const itens = [
      ["Total da base", formatarNumero(resumo.totalSent), `Base única da loja ${resumo.baseStore || ""}`],
      ["Clientes convertidos", formatarNumero(resumo.totalConverted), "CPFs únicos com conversão válida"],
      ["Não convertidos", formatarNumero(resumo.totalNotConverted), "Total da base menos convertidos"],
      ["Taxa de conversão", formatarPercentual(resumo.rate), "Convertidos sobre a base total da loja"],
      ["Receita convertida", formatarMoeda(resumo.revenue), "Soma das compras válidas na janela"],
      ["Ticket médio", formatarMoeda(resumo.ticket), `Soma por vendedora: ${formatarNumero(totalConvertidoVendedoras)} conversões`]
    ];
    documento.getElementById("teamKpis").innerHTML = itens.map(([rotulo, valor, detalhe]) => `
      <article class="team-kpi">
        <span>${rotulo}</span>
        <strong>${valor}</strong>
        <small>${detalhe}</small>
      </article>`).join("");
  }

  function montarCartoes(membros) {
    documento.getElementById("teamPersonCards").innerHTML = membros.map((membro) => `
      <article class="team-person-card" style="--team-color:${membro.cor};--team-rate:${Math.min(membro.rate || 0, 100)}%">
        <div class="team-person-head">
          <span class="team-avatar" aria-hidden="true">${membro.iniciais}</span>
          <div><h3>${membro.nome}</h3><small>Vendedora real da primeira conversão válida</small></div>
        </div>
        <div class="team-conversion-total">
          <strong>${formatarNumero(membro.converted)}</strong>
          <span>vendas convertidas</span>
        </div>
        <div class="team-progress" aria-label="Participação de ${formatarPercentual(membro.rate)} sobre a base total"><i></i></div>
        <dl class="team-person-stats">
          <div><dt>Base total da loja</dt><dd>${formatarNumero(membro.sent)}</dd></div>
          <div><dt>Clientes convertidos</dt><dd>${formatarNumero(membro.converted)}</dd></div>
          <div><dt>% sobre a base</dt><dd>${formatarPercentual(membro.rate)}</dd></div>
          <div><dt>% das conversões</dt><dd>${formatarPercentual(membro.conversionShare)}</dd></div>
          <div><dt>Receita convertida</dt><dd>${formatarMoeda(membro.revenue)}</dd></div>
        </dl>
      </article>`).join("");
  }

  function destruirGrafico(identificador) {
    graficos.get(identificador)?.destroy();
    graficos.delete(identificador);
  }

  function formatarValorGrafico(valor, formato) {
    if (formato === "moeda") return formatarMoeda(valor);
    if (formato === "percentual") return formatarPercentual(valor);
    return formatarNumero(valor);
  }

  function renderizarFallback(identificador, membros, obterValor, formato) {
    const canvas = documento.getElementById(identificador);
    const fallback = documento.getElementById(identificador.replace("Chart", "Fallback"));
    const valores = membros.map(obterValor);
    const maximo = Math.max(...valores, 1);
    canvas.classList.add("hidden");
    fallback.classList.remove("hidden");
    fallback.innerHTML = membros.map((membro, indice) => `
      <div class="team-chart-fallback-row" style="--team-color:${membro.cor};--team-bar:${valores[indice] / maximo * 100}%">
        <span>${membro.nome}</span><span><i></i></span><strong>${formatarValorGrafico(valores[indice], formato)}</strong>
      </div>`).join("");
  }

  function renderizarGraficos(membros) {
    const configuracoes = [
      {
        id: "teamConversionsChart",
        datasets: [{
          label: "Vendas convertidas",
          data: membros.map((membro) => membro.converted),
          backgroundColor: membros.map((membro) => membro.cor),
          borderRadius: 7
        }],
        formato: "numero",
        valorFallback: (membro) => membro.converted
      },
      {
        id: "teamRevenueChart",
        datasets: [{
          label: "Receita convertida",
          data: membros.map((membro) => membro.revenue),
          backgroundColor: membros.map((membro) => membro.cor),
          borderRadius: 7
        }],
        formato: "moeda",
        valorFallback: (membro) => membro.revenue
      }
    ];

    for (const configuracao of configuracoes) {
      destruirGrafico(configuracao.id);
      if (!janela.Chart) {
        renderizarFallback(configuracao.id, membros, configuracao.valorFallback, configuracao.formato);
        continue;
      }

      const canvas = documento.getElementById(configuracao.id);
      const fallback = documento.getElementById(configuracao.id.replace("Chart", "Fallback"));
      canvas.classList.remove("hidden");
      fallback.classList.add("hidden");
      const grafico = new janela.Chart(canvas, {
        type: "bar",
        data: { labels: membros.map((membro) => membro.nome), datasets: configuracao.datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
            tooltip: {
              callbacks: {
                label: (contexto) => `${contexto.dataset.label}: ${formatarValorGrafico(contexto.raw, configuracao.formato)}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                precision: configuracao.formato === "numero" ? 0 : undefined,
                callback: (valor) => configuracao.formato === "moeda"
                  ? `R$ ${Number(valor).toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })}`
                  : valor
              },
              grid: { color: "rgba(102, 113, 125, 0.12)" }
            },
            x: { grid: { display: false } }
          }
        }
      });
      graficos.set(configuracao.id, grafico);
    }
  }

  function atualizarStatusPersistencia(texto, estadoStatus) {
    const status = documento.getElementById("teamPersistenceStatus");
    if (!status) return;
    status.textContent = texto;
    status.classList.remove("is-online", "is-saving", "is-offline");
    status.classList.add(estadoStatus);
  }

  function montarPayloadPersistencia(membros, resumo) {
    return {
      generatedAt: resumo.generatedAt,
      windowDays: resumo.windowDays,
      dataOrigin: `base-loja-${criarChaveVendedora(resumo.baseStore || "loja")}`.slice(0, 40),
      baseStore: resumo.baseStore,
      totalSent: resumo.totalSent,
      sellers: membros.map((membro) => ({
        sellerKey: membro.chave,
        sellerName: membro.nome,
        clientsSent: membro.sent,
        conversions: membro.converted,
        revenue: membro.revenue
      }))
    };
  }

  async function requisitarApi(caminho, opcoes) {
    const resposta = await janela.fetch(caminho, {
      headers: { "Content-Type": "application/json", ...(opcoes && opcoes.headers) },
      ...opcoes
    });
    let corpo = null;
    try {
      corpo = await resposta.json();
    } catch (_) {
      corpo = null;
    }
    if (!resposta.ok) {
      throw new Error(corpo && corpo.error ? corpo.error : `Falha HTTP ${resposta.status}`);
    }
    return corpo;
  }

  function renderizarHistorico(resultados) {
    const estadoHistorico = documento.getElementById("teamHistoryState");
    const tabela = documento.getElementById("teamHistoryTable");
    if (!resultados.length) {
      estadoHistorico.textContent = "Nenhum processamento salvo até o momento.";
      estadoHistorico.classList.remove("hidden");
      tabela.classList.add("hidden");
      tabela.innerHTML = "";
      return;
    }

    estadoHistorico.classList.add("hidden");
    tabela.classList.remove("hidden");
    tabela.innerHTML = `<table>
      <thead><tr><th>Processamento</th><th>Loja/Base</th><th>Conversões por vendedora</th><th>Total</th><th>Receita</th></tr></thead>
      <tbody>${resultados.map((resultado) => {
        const vendedoras = (resultado.sellers || []).filter((vendedora) => (
          !vendedoraExcluida(vendedora.sellerName || vendedora.sellerKey)
        ));
        const totalConversoes = vendedoras.reduce((total, vendedora) => total + Number(vendedora.conversions || 0), 0);
        const receita = vendedoras.reduce((total, vendedora) => total + Number(vendedora.revenue || 0), 0);
        const lojaHistorico = resultado.baseStore
          || String(resultado.dataOrigin || "").replace(/^base-loja-/, "").toUpperCase()
          || "—";
        return `<tr>
          <td><strong>${new Date(resultado.generatedAt).toLocaleString("pt-BR")}</strong><small>Janela de ${resultado.windowDays} dias</small></td>
          <td><strong>${lojaHistorico}</strong><small>${formatarNumero(resultado.totalSent || resultado.totalClientsSent)} clientes</small></td>
          <td>${vendedoras.map((vendedora) => `${vendedora.sellerName || vendedora.sellerKey}: ${formatarNumero(vendedora.conversions)}`).join(" · ") || "Sem conversões"}</td>
          <td><strong>${formatarNumero(totalConversoes)}</strong></td>
          <td><strong>${formatarMoeda(receita)}</strong></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
  }

  async function carregarHistorico(forcar) {
    if (carregandoHistorico && !forcar) return;
    carregandoHistorico = true;
    const estadoHistorico = documento.getElementById("teamHistoryState");
    if (estadoHistorico) {
      estadoHistorico.textContent = "Carregando histórico...";
      estadoHistorico.classList.remove("hidden");
    }
    try {
      const resposta = await requisitarApi("/api/resultados?limit=20");
      renderizarHistorico(resposta.results || []);
      atualizarStatusPersistencia("PostgreSQL conectado", "is-online");
    } catch (_) {
      if (estadoHistorico) estadoHistorico.textContent = "Banco indisponível. Inicie o CRM Studio pelo Docker para consultar o histórico.";
      atualizarStatusPersistencia("Banco de dados não conectado", "is-offline");
    } finally {
      carregandoHistorico = false;
    }
  }

  async function salvarResultado(membros, resumo) {
    const chavePersistencia = `${resumo.generatedAt}|${resumo.windowDays}`;
    if (ultimaPersistencia === chavePersistencia) {
      await carregarHistorico();
      return;
    }
    atualizarStatusPersistencia("Salvando resultado...", "is-saving");
    try {
      await requisitarApi("/api/resultados", {
        method: "POST",
        body: JSON.stringify(montarPayloadPersistencia(membros, resumo))
      });
      ultimaPersistencia = chavePersistencia;
      atualizarStatusPersistencia("Resultado salvo no PostgreSQL", "is-online");
      await carregarHistorico(true);
    } catch (_) {
      atualizarStatusPersistencia("Resultado somente neste navegador", "is-offline");
      await carregarHistorico();
    }
  }

  function refresh() {
    if (!container) return;
    const resumo = janela.ConversionStudio?.getTeamSummary?.();
    const vazio = documento.getElementById("teamEmpty");
    const painel = documento.getElementById("teamDashboard");
    if (!resumo) {
      vazio.classList.remove("hidden");
      painel.classList.add("hidden");
      documento.getElementById("teamUpdated").textContent = "Aguardando o cálculo das conversões.";
      for (const identificador of [...graficos.keys()]) destruirGrafico(identificador);
      carregarHistorico();
      return;
    }

    const membros = criarMembros(resumo);
    vazio.classList.add("hidden");
    painel.classList.remove("hidden");
    documento.getElementById("teamUpdated").textContent = `Atualizado em ${new Date(resumo.generatedAt).toLocaleString("pt-BR")} · janela de ${resumo.windowDays} dias`;
    montarKpis(membros, resumo);
    montarCartoes(membros);
    if (!container.classList.contains("hidden")) renderizarGraficos(membros);
    salvarResultado(membros, resumo);
  }

  function init() {
    const destino = documento.getElementById("teamResultsApp");
    if (!destino || container === destino) return Boolean(destino);
    container = destino;
    montarEstrutura();
    documento.addEventListener("crm:conversion-calculated", refresh);
    refresh();
    return true;
  }

  janela.TeamResultsStudio = Object.freeze({ init, refresh });

  if (documento.readyState === "loading") {
    documento.addEventListener("DOMContentLoaded", init, { once: true });
  } else init();
})(window, document);
