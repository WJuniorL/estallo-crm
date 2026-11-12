import { describe, expect, it } from "vitest";

import { mensalidadeEquivalente } from "@/lib/cobranca/intervalo";

import { NIVEIS_DA_ESTALLO, precoDoPeriodo, vitrineDoCatalogo } from "./catalogo";
import { itensDoPlano } from "./recursos";

describe("os preços da Estallo (decisão de 12/11/2026)", () => {
  it.each([
    ["Essencial", 24_700, 123_000, 213_400],
    ["Profissional", 44_700, 222_600, 386_200],
    ["Escala", 94_700, 471_600, 818_200],
  ])("%s: mensal %i, semestral −17%% %i, anual −28%% %i, em reais inteiros", (nome, mes, semestre, ano) => {
    expect(NIVEIS_DA_ESTALLO.find((n) => n.nome === nome)?.precos).toEqual({ mes, semestre, ano });
  });

  it("o arredondamento é para baixo, nunca cobra centavo a mais", () => {
    expect(precoDoPeriodo(24_700, 6, 17)).toBe(123_000); // 1.230,06 → 1.230
    expect(precoDoPeriodo(24_700, 12, 28)).toBe(213_400); // 2.134,08 → 2.134
  });

  it("a mensalidade em destaque é o período dividido pelos meses, para baixo", () => {
    expect(mensalidadeEquivalente(123_000, "semestre")).toBe(20_500);
    expect(mensalidadeEquivalente(213_400, "ano")).toBe(17_783);
    expect(mensalidadeEquivalente(24_700, "mes")).toBe(24_700);
  });

  it("a vitrine tem os 3 níveis nos 3 períodos, sem id (nada a contratar)", () => {
    const v = vitrineDoCatalogo();
    expect(v).toHaveLength(9);
    expect(v.every((p) => p.id === null)).toBe(true);
  });
});

describe("itensDoPlano — a vitrine só promete o que o banco aplica", () => {
  it("Essencial: sem API REST, com IA; Escala: pipelines ilimitados", () => {
    const [essencial, , escala] = NIVEIS_DA_ESTALLO;
    const frases = (l: (typeof NIVEIS_DA_ESTALLO)[number]) => itensDoPlano(l.limites).map((i) => i.frase);
    expect(frases(essencial!)).not.toContain("API REST para integrações externas");
    expect(frases(essencial!)).toContain("Agente de IA com até {n} de uso por mês");
    expect(frases(escala!)).toContain("Pipelines ilimitados com até {e} etapas");
    expect(itensDoPlano(essencial!.limites).find((i) => i.frase.startsWith("Até {n} pipelines"))).toMatchObject({ n: 5, e: 8 });
  });

  it("nenhum plano menciona MCP", () => {
    for (const n of NIVEIS_DA_ESTALLO) expect(itensDoPlano(n.limites).some((i) => /mcp/i.test(i.frase))).toBe(false);
  });
});
