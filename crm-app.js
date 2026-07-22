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

      if (painelSelecionado === "teamResultsApp") {
        window.TeamResultsStudio?.refresh?.();
      }

      history.replaceState(null, "", rotas[painelSelecionado] || "#campanhas");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Mantém a aba correta ao abrir um link direto.

  const moduloInicial = Object.entries(rotas)
    .find(([, rota]) => rota === location.hash)?.[0];

  if (moduloInicial && moduloInicial !== "generatorApp") {
    document.querySelector(`[data-module="${moduloInicial}"]`)?.click();
  }
});
