"use strict";

(function iniciarResultadosEquipe(janela, documento) {
  const MEMBROS = [
    { chave: "marines", nomes: ["marines brant", "marines"], nome: "Marines", iniciais: "MB", cor: "#7f1024" },
    { chave: "sirlene", nomes: ["sirlene schafer", "sirlene", "silene schafer", "silene"], nome: "Sirlene", iniciais: "SS", cor: "#16845b" },
    { chave: "patricia", nomes: ["patricia ullmann", "patricia"], nome: "Patrícia", iniciais: "PU", cor: "#b66a08" }
  ];

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
              <p>Comparativo dos clientes enviados e convertidos para Marines, Sirlene e Patrícia, conforme a vendedora informada junto ao CPF.</p>
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
            <p>Carregue as bases na aba Conversões e Insights. Este painel será preenchido automaticamente com os números reais de cada responsável.</p>
            <button class="primary" type="button" data-open-conversions>Ir para Conversões e Insights</button>
          </div>
        </section>

        <div id="teamDashboard" class="hidden">
          <div id="teamKpis" class="team-kpis"></div>
          <div id="teamPersonCards" class="team-person-grid"></div>

          <div class="team-charts-grid">
            <article class="panel team-chart-card">
              <div class="team-chart-head">
                <h3>Conversões por responsável</h3>
                <p>Clientes convertidos dentro da base atribuída a cada vendedora.</p>
              </div>
              <div class="team-chart-body">
                <canvas id="teamConversionsChart" role="img" aria-label="Comparativo de enviados e convertidos por responsável"></canvas>
                <div id="teamConversionsFallback" class="team-chart-fallback hidden"></div>
              </div>
            </article>

            <article class="panel team-chart-card">
              <div class="team-chart-head">
                <h3>Receita por vendedora</h3>
                <p>Valor das compras dos clientes enviados para cada vendedora.</p>
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

  function somarGrupos(grupos, membro) {
    const correspondentes = grupos.filter((grupo) => {
      const nomeCompleto = normalizar(grupo.label).replace(/[^a-z0-9]+/g, " ").trim();
      return membro.nomes.includes(nomeCompleto);
    });
    return correspondentes.reduce((total, grupo) => ({
      sent: total.sent + grupo.sent,
      converted: total.converted + grupo.converted,
      notConverted: total.notConverted + grupo.notConverted,
      revenue: total.revenue + grupo.revenue,
      purchases: total.purchases + grupo.purchases
    }), { sent: 0, converted: 0, notConverted: 0, revenue: 0, purchases: 0 });
  }

  function localizarGruposDeEnviados(resumoGeral) {
    const candidatos = [
      { origem: "responsavel", grupos: resumoGeral.responsibleGroups || resumoGeral.groups || [] },
      { origem: "arquivo", grupos: resumoGeral.workbookAssignmentGroups || [] },
      { origem: "gerador", grupos: resumoGeral.generatorAssignmentSummary?.groups || [] }
    ];

    return candidatos.find(({ grupos }) => MEMBROS.some(
      (membro) => somarGrupos(grupos, membro).sent > 0
    )) || { origem: "responsavel", grupos: [] };
  }

  function consolidarMembro(gruposDeEnviados, membro) {
    const base = somarGrupos(gruposDeEnviados, membro);
    const temBaseIdentificada = base.sent > 0;

    return {
      ...membro,
      sent: base.sent,
      baseConverted: base.converted,
      notConverted: base.notConverted,
      converted: base.converted,
      revenue: base.revenue,
      purchases: base.purchases,
      hasAssignedBase: temBaseIdentificada,
      rate: temBaseIdentificada ? base.converted / base.sent * 100 : null
    };
  }

  function montarKpis(membros) {
    const totais = membros.reduce((total, membro) => ({
      sent: total.sent + membro.sent,
      baseConverted: total.baseConverted + membro.baseConverted,
      converted: total.converted + membro.converted,
      revenue: total.revenue + membro.revenue
    }), { sent: 0, baseConverted: 0, converted: 0, revenue: 0 });
    const taxa = totais.sent ? totais.baseConverted / totais.sent * 100 : null;
    const itens = [
      ["Clientes enviados", totais.sent ? formatarNumero(totais.sent) : "—", totais.sent ? "Somente Patrícia, Sirlene e Marines" : "Nenhuma das três vendedoras foi localizada"],
      ["Vendas convertidas", formatarNumero(totais.converted), "Clientes convertidos das três bases"],
      ["Taxa de conversão", taxa === null ? "—" : formatarPercentual(taxa), taxa === null ? "Nenhuma base atribuída foi localizada" : "Conversões sobre clientes enviados"],
      ["Receita convertida", formatarMoeda(totais.revenue), "Compras dos clientes convertidos"]
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
          <div><h3>${membro.nome}</h3><small>Responsável informada junto ao CPF</small></div>
        </div>
        <div class="team-conversion-total">
          <strong>${formatarNumero(membro.converted)}</strong>
          <span>vendas convertidas</span>
        </div>
        <div class="team-progress" aria-label="${membro.rate === null ? "Taxa da base não disponível" : `Taxa da base de ${formatarPercentual(membro.rate)}`}"><i></i></div>
        <dl class="team-person-stats">
          <div><dt>Enviados na base</dt><dd>${membro.hasAssignedBase ? formatarNumero(membro.sent) : "—"}</dd></div>
          <div><dt>Clientes convertidos</dt><dd>${membro.hasAssignedBase ? formatarNumero(membro.baseConverted) : "—"}</dd></div>
          <div><dt>Taxa de conversão</dt><dd>${membro.rate === null ? "—" : formatarPercentual(membro.rate)}</dd></div>
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

  function montarPayloadPersistencia(membros, resumo, origemEnviados) {
    return {
      generatedAt: resumo.generatedAt,
      windowDays: resumo.windowDays,
      dataOrigin: `campaign-${origemEnviados}`,
      sellers: membros.map((membro) => ({
        sellerKey: membro.chave,
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

  function obterVendedoraHistorico(resultado, chave) {
    return (resultado.sellers || []).find((vendedora) => vendedora.sellerKey === chave)
      || { conversions: 0, clientsSent: 0, revenue: 0 };
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
      <thead><tr><th>Processamento</th><th>Marines</th><th>Sirlene</th><th>Patrícia</th><th>Total</th><th>Receita</th></tr></thead>
      <tbody>${resultados.map((resultado) => {
        const marines = obterVendedoraHistorico(resultado, "marines");
        const sirlene = obterVendedoraHistorico(resultado, "sirlene");
        const patricia = obterVendedoraHistorico(resultado, "patricia");
        return `<tr>
          <td><strong>${new Date(resultado.generatedAt).toLocaleString("pt-BR")}</strong><small>Janela de ${resultado.windowDays} dias</small></td>
          <td>${formatarNumero(marines.conversions)}</td>
          <td>${formatarNumero(sirlene.conversions)}</td>
          <td>${formatarNumero(patricia.conversions)}</td>
          <td><strong>${formatarNumero(resultado.totalConversions)}</strong></td>
          <td><strong>${formatarMoeda(resultado.totalRevenue)}</strong></td>
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

  async function salvarResultado(membros, resumo, origemEnviados) {
    const chavePersistencia = `${resumo.generatedAt}|${resumo.windowDays}`;
    if (ultimaPersistencia === chavePersistencia) {
      await carregarHistorico();
      return;
    }
    atualizarStatusPersistencia("Salvando resultado...", "is-saving");
    try {
      await requisitarApi("/api/resultados", {
        method: "POST",
        body: JSON.stringify(montarPayloadPersistencia(membros, resumo, origemEnviados))
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

    const dadosDeEnviados = localizarGruposDeEnviados(resumo);
    const membros = MEMBROS.map((membro) =>
      consolidarMembro(dadosDeEnviados.grupos, membro)
    );
    vazio.classList.add("hidden");
    painel.classList.remove("hidden");
    documento.getElementById("teamUpdated").textContent = `Atualizado em ${new Date(resumo.generatedAt).toLocaleString("pt-BR")} · janela de ${resumo.windowDays} dias`;
    montarKpis(membros);
    montarCartoes(membros);
    if (!container.classList.contains("hidden")) renderizarGraficos(membros);
    salvarResultado(membros, resumo, dadosDeEnviados.origem);
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
