import { describe, expect, it } from "vitest";

import { chaveDeBusca, filtrarProdutos } from "./SeletorDeProduto";

const P = [
  { nome: "Coleta na Prática VCA" },
  { nome: "Hemato na Prática" },
  { nome: "Limpeza de Pele que Fatura" },
];

describe("filtrarProdutos", () => {
  it("termo vazio devolve todos, na ordem", () => {
    expect(filtrarProdutos(P, "  ")).toEqual(P);
  });
  it("acha pelo meio do nome, sem acento nem maiúscula", () => {
    expect(filtrarProdutos(P, "pratica").map((p) => p.nome)).toEqual([
      "Coleta na Prática VCA",
      "Hemato na Prática",
    ]);
    expect(filtrarProdutos(P, "PELE")).toEqual([P[2]]);
  });
  it("nada casa: lista vazia", () => {
    expect(filtrarProdutos(P, "xyz")).toEqual([]);
  });
  it("chave remove acento e espaço das pontas", () => {
    expect(chaveDeBusca("  Imersão ")).toBe("imersao");
  });
  it("milhares de produtos filtram rápido", () => {
    const muitos = Array.from({ length: 20_000 }, (_, i) => ({ nome: `Produto ${i} Prática` }));
    const t0 = performance.now();
    expect(filtrarProdutos(muitos, "19999")).toHaveLength(1);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
