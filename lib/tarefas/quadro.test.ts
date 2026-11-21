import { describe, expect, it } from "vitest";

import {
  contarFiltros,
  filtrarTarefas,
  filtroDaUrl,
  filtroParaUrl,
  ordenarTarefas,
  porColuna,
  semanaDe,
  type FiltroDoQuadro,
} from "./quadro";
import type { Tarefa } from "./tipos";

// Quarta, 18/11/2026, 12h no fuso local.
const AGORA = new Date(2026, 10, 18, 12, 0);
const em = (d: number, h = 9) => new Date(2026, 10, d, h, 0).toISOString();

function tarefa(p: Partial<Tarefa> & { id: string }): Tarefa {
  return {
    organization_id: "o",
    title: p.id,
    description: null,
    due_date: null,
    priority: "medium",
    status: "pending",
    lead_id: null,
    contact_id: null,
    assigned_to: null,
    created_by: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...p,
  };
}

const EU = "eu";
const atrasada = tarefa({ id: "atrasada", due_date: em(17), assigned_to: EU, priority: "high" });
const concluidaVencida = tarefa({ id: "feita", due_date: em(10), status: "done", assigned_to: EU });
const hoje = tarefa({ id: "hoje", due_date: em(18, 20), assigned_to: "outro", priority: "urgent" });
const sabado = tarefa({ id: "sabado", due_date: em(21), assigned_to: EU });
const proxima = tarefa({ id: "proxima", due_date: em(23), priority: "low" });
const semPrazo = tarefa({ id: "sem", assigned_to: EU });
const todas = [atrasada, concluidaVencida, hoje, sabado, proxima, semPrazo];
const ids = (f: FiltroDoQuadro) =>
  filtrarTarefas(todas, f, { usuarioId: EU, agora: AGORA }).map((t) => t.id);

describe("filtros do quadro", () => {
  it("atrasadas: vencidas e ainda abertas — concluída nunca está atrasada", () => {
    expect(ids({ prazo: "atrasadas" })).toEqual(["atrasada"]);
  });

  it("hoje e esta semana (domingo a sábado, a grade do calendário)", () => {
    expect(ids({ prazo: "hoje" })).toEqual(["hoje"]);
    expect(semanaDe(AGORA)).toEqual({ de: "2026-11-15", ate: "2026-11-21" });
    expect(ids({ prazo: "semana" })).toEqual(["atrasada", "hoje", "sabado"]);
  });

  it("personalizado: intervalo inclusivo; sem prazo fica fora", () => {
    expect(ids({ prazo: "personalizado", de: "2026-11-21", ate: "2026-11-23" })).toEqual([
      "sabado",
      "proxima",
    ]);
  });

  it("combináveis: minhas + atrasadas + alta", () => {
    expect(ids({ minhas: true })).toEqual(["atrasada", "feita", "sabado", "sem"]);
    expect(ids({ minhas: true, prazo: "atrasadas", prioridades: ["high"] })).toEqual(["atrasada"]);
    expect(ids({ responsaveis: ["outro"], prazo: "semana" })).toEqual(["hoje"]);
  });

  it("filtrar não altera as tarefas", () => {
    const antes = JSON.stringify(todas);
    ids({ minhas: true, prazo: "semana" });
    expect(JSON.stringify(todas)).toBe(antes);
  });

  it("contador e ida e volta pela URL", () => {
    const f: FiltroDoQuadro = {
      minhas: true,
      prazo: "personalizado",
      de: "2026-11-01",
      ate: "2026-11-30",
      prioridades: ["high", "urgent"],
      responsaveis: ["a", "b"],
    };
    expect(contarFiltros(f)).toBe(3);
    expect(filtroDaUrl(new URLSearchParams(filtroParaUrl(f)))).toEqual(f);
  });
});

describe("ordenação por prazo", () => {
  const manha = tarefa({ id: "manha", due_date: em(20, 8) });
  const tarde = tarefa({ id: "tarde", due_date: em(20, 17) });
  const sem = tarefa({ id: "sem" });
  const ordem = (s: "antigas" | "recentes") =>
    ordenarTarefas([sem, tarde, manha], s).map((t) => t.id);

  it("a hora conta, e sem prazo vai ao fim nos dois sentidos", () => {
    expect(ordem("antigas")).toEqual(["manha", "tarde", "sem"]);
    expect(ordem("recentes")).toEqual(["tarde", "manha", "sem"]);
  });
});

it("toda tarefa cai na coluna da sua situação", () => {
  const c = porColuna(todas);
  expect(Object.keys(c)).toEqual(["cancelled", "pending", "in_progress", "done"]);
  expect(c.done.map((t) => t.id)).toEqual(["feita"]);
  expect(c.pending).toHaveLength(5);
});
