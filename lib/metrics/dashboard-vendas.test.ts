import { describe, expect, it } from "vitest";

import {
  type DashboardVendasBruto,
  type EtapaDoFluxo,
  evolucaoMensal,
  moedasPresentes,
  montarFluxo,
  taxaDeConversao,
  ticketMedio,
  variacao,
} from "./dashboard-vendas";

const etapa = (nome: string, chegaram: number, ganho = false): EtapaDoFluxo => ({
  stage_id: nome,
  nome,
  posicao: 0,
  cor: null,
  ganho,
  chegaram,
  agora: [],
});

describe("dashboard de vendas — conta pura", () => {
  it("variação e conversão: sem base é null, nunca 0", () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(5, 0)).toBeNull();
    expect(variacao(null, 10)).toBeNull();
    expect(taxaDeConversao({ ganhos: 0, perdidos: 0 })).toBeNull();
    expect(taxaDeConversao({ ganhos: 3, perdidos: 1 })).toBe(75);
  });

  it("ticket médio só na moeda pedida", () => {
    const linhas = [
      { moeda: "BRL", quantidade: 2, valor_cents: 40000 },
      { moeda: "USD", quantidade: 1, valor_cents: 9900 },
    ];
    expect(ticketMedio(linhas, "BRL")).toBe(20000);
    expect(ticketMedio(linhas, "EUR")).toBeNull();
  });

  it("gargalo é a menor passagem com amostra mínima; amostra pequena não acusa", () => {
    const f = montarFluxo([
      etapa("Novo", 100),
      etapa("Proposta", 90),
      etapa("Negociação", 30),
      etapa("Ganho", 25, true),
    ]);
    expect(f.map((e) => [e.nome, e.avancaram_pct, e.gargalo])).toEqual([
      ["Novo", 90, false],
      ["Proposta", (30 / 90) * 100, true],
      ["Negociação", (25 / 30) * 100, false],
      ["Ganho", null, false],
    ]);
    expect(montarFluxo([etapa("A", 5), etapa("B", 1)]).some((e) => e.gargalo)).toBe(false);
    expect(montarFluxo([etapa("A", 0), etapa("B", 0)])[0]?.avancaram_pct).toBeNull();
  });

  it("moeda principal é a mais usada; 'sem moeda' vai por último", () => {
    const d = {
      carteira: [
        { moeda: "sem moeda", quantidade: 50, valor_cents: 0 },
        { moeda: "USD", quantidade: 1, valor_cents: 1 },
        { moeda: "BRL", quantidade: 9, valor_cents: 1 },
      ],
      periodo: {
        atual: { ganhos: 0, perdidos: 0, ciclo_mediana_dias: null, ganhos_por_moeda: [], perdidos_por_moeda: [] },
        anterior: { ganhos: 0, perdidos: 0, ciclo_mediana_dias: null, ganhos_por_moeda: [], perdidos_por_moeda: [] },
      },
      mensal: [],
    } as unknown as DashboardVendasBruto;
    expect(moedasPresentes(d)).toEqual(["BRL", "USD", "sem moeda"]);
  });

  it("evolução: 12 meses contínuos, valor filtra moeda, quantidade não", () => {
    const meses = evolucaoMensal(
      [
        { mes: "2026-01", status: "won", moeda: "BRL", quantidade: 2, valor_cents: 500 },
        { mes: "2026-01", status: "won", moeda: "USD", quantidade: 1, valor_cents: 900 },
        { mes: "2025-01", status: "won", moeda: "BRL", quantidade: 7, valor_cents: 7 },
      ],
      "2026-02",
      "BRL",
      "valor",
    );
    expect(meses).toHaveLength(12);
    expect(meses[0]?.mes).toBe("2025-03");
    expect(meses[11]?.mes).toBe("2026-02");
    expect(meses.find((m) => m.mes === "2026-01")?.won).toBe(500);
    const qtd = evolucaoMensal(
      [
        { mes: "2026-01", status: "won", moeda: "BRL", quantidade: 2, valor_cents: 500 },
        { mes: "2026-01", status: "won", moeda: "USD", quantidade: 1, valor_cents: 900 },
      ],
      "2026-02",
      "BRL",
      "quantidade",
    );
    expect(qtd.find((m) => m.mes === "2026-01")?.won).toBe(3);
  });
});
