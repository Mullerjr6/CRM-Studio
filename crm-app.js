"use strict";

document.addEventListener("DOMContentLoaded", () => {

  // O módulo de conversões cuida da própria inicialização.

  if (window.ConversionStudio?.init) {
    window.ConversionStudio.init();
  }

  const abas = [...document.querySelectorAll(".module-tab")];
  const paineis = [...document.querySelectorAll(".module-view")];

  // Alterna entre o gerador de campanhas e o painel de conversões.

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

      const destino = painelSelecionado === "conversionApp"
        ? "#conversoes"
        : "#campanhas";

      history.replaceState(null, "", destino);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Mantém a aba correta ao abrir um link direto.

  if (location.hash === "#conversoes") {
    document.querySelector('[data-module="conversionApp"]')?.click();
  }
});
