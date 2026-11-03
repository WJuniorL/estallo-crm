import { describe, expect, it } from "vitest";

import { erroEmTexto, montarPassos, type PassoBruto, type TentativaBruta } from "./passos-da-execucao";

const nos = new Map([
  ["t", { rotulo: "Início", tipo: "trigger" as const }],
  ["a", { rotulo: "Agradecimento", tipo: "action" as const }],
]);
const passo = (id: string, node_id: string, entered_at: string, extra: Partial<PassoBruto> = {}): PassoBruto => ({
  id, node_id, visit: 0, status: "succeeded", branch_id: null, entered_at, completed_at: null, ...extra,
});
const tentativa = (step_id: string, attempt_no: number, extra: Partial<TentativaBruta> = {}): TentativaBruta => ({
  step_id, attempt_no, status: "succeeded", started_at: null, completed_at: null,
  input_snapshot: { config: { body: "texto do dono" } }, output_snapshot: { ok: 1 }, error_snapshot: null, ...extra,
});

describe("montarPassos", () => {
  it("ordena pela entrada, nomeia pelo rótulo do nó e calcula a duração", () => {
    const r = montarPassos(
      [passo("s2", "a", "2026-11-03T20:37:05Z", { completed_at: "2026-11-03T20:37:07Z" }), passo("s1", "t", "2026-11-03T20:36:04Z")],
      [],
      nos,
      false,
    );
    expect(r.map((p) => p.rotulo)).toEqual(["Início", "Agradecimento"]);
    expect(r[1]?.duracao_ms).toBe(2000);
    expect(r[0]?.duracao_ms).toBeNull();
  });

  it("nó que saiu do grafo aparece pelo id, sem derrubar a lista", () => {
    const r = montarPassos([passo("s1", "fantasma", "2026-11-03T20:00:00Z")], [], nos, false);
    expect(r[0]).toMatchObject({ rotulo: "fantasma", tipo: null });
  });

  it("entrada e saída SÓ saem para quem pode ver dados — a entrada carrega a configuração do nó", () => {
    const passos = [passo("s1", "a", "2026-11-03T20:00:00Z")];
    const tentativas = [tentativa("s1", 1)];
    const fechado = montarPassos(passos, tentativas, nos, false)[0]!;
    expect(fechado).not.toHaveProperty("entrada");
    expect(fechado).not.toHaveProperty("saida");
    const aberto = montarPassos(passos, tentativas, nos, true)[0]!;
    expect(aberto.saida).toEqual({ ok: 1 });
    expect(aberto.entrada).toEqual({ config: { body: "texto do dono" } });
  });

  it("conta as tentativas e traz o erro da ÚLTIMA", () => {
    const r = montarPassos(
      [passo("s1", "a", "2026-11-03T20:00:00Z", { status: "failed" })],
      [tentativa("s1", 2, { status: "failed", error_snapshot: { message: "canal fora" } }), tentativa("s1", 1, { status: "failed", error_snapshot: { message: "timeout" } })],
      nos,
      false,
    );
    expect(r[0]).toMatchObject({ tentativas: 2, erro: "canal fora" });
  });
});

describe("erroEmTexto", () => {
  it("aceita texto, objeto com message/code e ignora o resto; corta o excesso", () => {
    expect(erroEmTexto(null)).toBeNull();
    expect(erroEmTexto("falhou")).toBe("falhou");
    expect(erroEmTexto({ code: "execution_send_receipt_missing" })).toBe("execution_send_receipt_missing");
    expect(erroEmTexto({ qualquer: 1 })).toBeNull();
    expect(erroEmTexto("x".repeat(1000))?.length).toBe(300);
  });
});
