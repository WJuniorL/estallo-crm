import { describe, expect, it } from "vitest";

import type { Lead } from "@/lib/types/leads";
import {
  applyFilters,
  contarFiltrosAtivos,
  diaLocal,
  filtersFromParams,
  filtersToParams,
  type LeadFilters,
} from "./filters";
import { ordenacaoDaUrl, ordenarLeads } from "./ordenacao";

function lead(p: Partial<Lead> & { id: string }): Lead {
  return {
    title: p.id,
    description: null,
    status: "open",
    owner_user_id: null,
    owner_agent_id: null,
    tags: [],
    position_in_stage: 0,
    created_at: "2026-11-10T12:00:00.000Z",
    stage_changed_at: null,
    last_activity_at: null,
    expected_close_date: null,
    closed_at: null,
    custom_fields: {},
    ...p,
  } as unknown as Lead;
}

describe("filtros novos do funil", () => {
  // Meio-dia UTC cai no mesmo dia em qualquer fuso de -11 a +11.
  const a = lead({
    id: "a",
    created_at: "2026-11-01T12:00:00.000Z",
    expected_close_date: "2026-12-01",
    closed_at: "2026-11-15T12:00:00.000Z",
    status: "won",
  });
  const b = lead({
    id: "b",
    created_at: "2026-11-10T12:00:00.000Z",
    expected_close_date: "2026-12-20",
  });
  const c = lead({ id: "c", created_at: "2026-11-20T12:00:00.000Z" });
  const ids = (f: LeadFilters) => applyFilters([a, b, c], f).map((l) => l.id);

  it("data de criação: intervalo inclusivo nas duas pontas", () => {
    expect(ids({ criadoDe: "2026-11-10", criadoAte: "2026-11-20" })).toEqual(["b", "c"]);
    expect(ids({ criadoAte: "2026-11-01" })).toEqual(["a"]);
  });

  it("previsão e fechamento: lead sem a data fica fora quando há intervalo", () => {
    expect(ids({ previsaoDe: "2026-12-10" })).toEqual(["b"]);
    expect(ids({ fechadoDe: "2026-11-01", fechadoAte: "2026-11-30" })).toEqual(["a"]);
  });

  it("dia local de um instante", () => {
    expect(diaLocal("2026-11-10T12:00:00.000Z")).toBe("2026-11-10");
  });

  it("campos personalizados por tipo de valor", () => {
    const x = lead({
      id: "x",
      custom_fields: {
        cidade: "São Paulo",
        nota: 8,
        dia: "2026-11-05",
        vip: true,
        cor: ["azul", "verde"],
      },
    });
    const y = lead({
      id: "y",
      custom_fields: { cidade: "Recife", nota: 3, dia: "2026-12-05", vip: false, cor: "vermelho" },
    });
    const z = lead({ id: "z" });
    const so = (f: LeadFilters) => applyFilters([x, y, z], f).map((l) => l.id);
    expect(so({ campos: { cidade: { contem: "paulo" } } })).toEqual(["x"]);
    expect(so({ campos: { nota: { de: "5" } } })).toEqual(["x"]);
    expect(so({ campos: { nota: { ate: "5" } } })).toEqual(["y"]);
    expect(so({ campos: { dia: { de: "2026-12-01" } } })).toEqual(["y"]);
    expect(so({ campos: { vip: { booleano: false } } })).toEqual(["y", "z"]);
    expect(so({ campos: { cor: { opcoes: ["verde", "vermelho"] } } })).toEqual(["x", "y"]);
    // Condição vazia não filtra nada.
    expect(so({ campos: { cidade: {} } })).toEqual(["x", "y", "z"]);
  });

  it("ida e volta pela URL, campos inclusive", () => {
    const f: LeadFilters = {
      status: "all",
      criadoDe: "2026-11-01",
      fechadoAte: "2026-11-30",
      campos: { cor: { opcoes: ["azul", "verde"] }, vip: { booleano: true }, nota: { de: "2" } },
    };
    const volta = filtersFromParams(new URLSearchParams(filtersToParams(f)));
    expect(volta.criadoDe).toBe("2026-11-01");
    expect(volta.fechadoAte).toBe("2026-11-30");
    expect(volta.campos).toEqual(f.campos);
  });

  it("data malformada na URL é ignorada", () => {
    expect(filtersFromParams(new URLSearchParams("criado_de=ontem")).criadoDe).toBeUndefined();
  });

  it("contador do botão Filtros: a busca não conta", () => {
    expect(contarFiltrosAtivos({ status: "all", search: "x" })).toBe(0);
    expect(
      contarFiltrosAtivos({
        status: "lost",
        criadoDe: "2026-11-01",
        campos: { a: { contem: "x" }, b: {} },
      }),
    ).toBe(3);
  });
});

describe("ordenação do funil", () => {
  const um = lead({
    id: "1",
    position_in_stage: 3,
    created_at: "2026-11-01T00:00:00Z",
    stage_changed_at: "2026-11-18T00:00:00Z",
    last_activity_at: "2026-11-19T00:00:00Z",
  });
  const dois = lead({
    id: "2",
    position_in_stage: 1,
    created_at: "2026-11-05T00:00:00Z",
    stage_changed_at: null,
    last_activity_at: null,
  });
  const tres = lead({
    id: "3",
    position_in_stage: 2,
    created_at: "2026-11-03T00:00:00Z",
    stage_changed_at: "2026-11-04T00:00:00Z",
    last_activity_at: "2026-11-20T00:00:00Z",
  });
  const ordem = (o: Parameters<typeof ordenarLeads>[1]) =>
    ordenarLeads([um, dois, tres], o).map((l) => l.id);

  it("cada opção", () => {
    expect(ordem("manual")).toEqual(["2", "3", "1"]);
    expect(ordem("recentes")).toEqual(["2", "3", "1"]);
    expect(ordem("antigos")).toEqual(["1", "3", "2"]);
    // sem stage_changed_at, conta a criação (05/11)
    expect(ordem("movidos_recentes")).toEqual(["1", "2", "3"]);
    expect(ordem("movidos_antigos")).toEqual(["3", "2", "1"]);
    // parado = última atividade mais antiga primeiro; sem atividade, desde que entrou na etapa
    expect(ordem("parados")).toEqual(["2", "1", "3"]);
  });

  it("empate desfaz por id e a entrada não muda", () => {
    const entrada = [lead({ id: "b" }), lead({ id: "a" })];
    expect(ordenarLeads(entrada, "recentes").map((l) => l.id)).toEqual(["a", "b"]);
    expect(entrada.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("valor desconhecido na URL vira manual", () => {
    expect(ordenacaoDaUrl("qualquer")).toBe("manual");
    expect(ordenacaoDaUrl("parados")).toBe("parados");
  });
});
