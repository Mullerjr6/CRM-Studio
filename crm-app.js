"use strict";

document.addEventListener("DOMContentLoaded", () => {

  // O módulo de conversões cuida da própria inicialização.

  if (window.ConversionStudio?.init) {
    window.ConversionStudio.init();
  }

  if (window.TeamResultsStudio?.init) {
    window.TeamResultsStudio.init();
  }

  const abas = [...document.querySelectorAll(".module-tab")];
  const paineis = [...document.querySelectorAll(".module-view")];

  const rotas = {
    generatorApp: "#campanhas",
    conversionApp: "#conversoes",
    teamResultsApp: "#equipe"
  };

  const obterRotaAba = (aba) => aba.dataset.generatorMode === "multi"
    ? "#campanhas-por-loja"
    : (rotas[aba.dataset.module] || "#campanhas");

  // Alterna entre os módulos do CRM Studio.

  for (const aba of abas) {
    aba.addEventListener("click", () => {
      const painelSelecionado = aba.dataset.module;

      for (const item of abas) {
        const estaAtiva = item === aba;
        item.classList.toggle("active", estaAtiva);
        item.setAttribute("aria-selected", String(estaAtiva));
      }

      for (const painel of paineis) {
        painel.classList.toggle("hidden", painel.id !== painelSelecionado);
      }

      if (painelSelecionado === "generatorApp") {
        window.CampaignStudio?.setGeneratorMode?.(
          aba.dataset.generatorMode === "multi" ? "multi" : "legacy"
        );
      }

      if (painelSelecionado === "teamResultsApp") {
        window.TeamResultsStudio?.refresh?.();
      }

      history.replaceState(null, "", obterRotaAba(aba));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Mantém a aba correta ao abrir um link direto.

  const abaInicial = abas.find((aba) => obterRotaAba(aba) === location.hash);
  (abaInicial || abas[0])?.click();
});
