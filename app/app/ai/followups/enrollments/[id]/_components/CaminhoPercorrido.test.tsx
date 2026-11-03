import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { NoDoDossie } from "@/lib/followup/eventos-legiveis";
import type { PassoDaExecucao } from "@/lib/followup/passos-da-execucao";

import { CaminhoPercorrido } from "./CaminhoPercorrido";

const nos: NoDoDossie[] = [
  { id: "t", tipo: "trigger", rotulo: "Início", resumo: "" },
  { id: "c", tipo: "condition", rotulo: "Produto", resumo: "" },
  { id: "m1", tipo: "action", rotulo: "Áudio Coleta", resumo: "" },
  { id: "m2", tipo: "action", rotulo: "Áudio Micro", resumo: "" },
];
const arestas = [
  { id: "e1", source: "t", target: "c" },
  { id: "e2", source: "c", target: "m1" },
  { id: "e3", source: "c", target: "m2" },
];
const passo = (node_id: string, extra: Partial<PassoDaExecucao> = {}): PassoDaExecucao => ({
  step_id: `s-${node_id}`, node_id, rotulo: nos.find((n) => n.id === node_id)!.rotulo, tipo: "action",
  status: "succeeded", branch_id: null, visit: 0, entered_at: "2026-11-03T20:00:00Z", completed_at: null,
  duracao_ms: 1500, tentativas: 1, erro: null, ...extra,
});

describe("CaminhoPercorrido", () => {
  it("mostra os passos em ordem, o ramo tomado e separa o que NÃO foi percorrido", () => {
    render(
      <CaminhoPercorrido
        passos={[passo("t"), passo("c", { branch_id: "coleta_vca" }), passo("m1")]}
        nos={nos}
        arestas={arestas}
        verDados={false}
      />,
    );
    expect(screen.getAllByTestId("caminho-passo")).toHaveLength(3);
    expect(screen.getByTestId("caminho-ramo")).toHaveTextContent("coleta_vca");
    // O ramo da Micro não foi tomado: aparece só entre os não percorridos.
    expect(screen.getByTestId("caminho-nao-percorridos")).toHaveTextContent("Áudio Micro");
    expect(screen.getByTestId("caminho-nao-percorridos")).not.toHaveTextContent("Áudio Coleta");
  });

  it("falha aparece com o erro, sem esconder", () => {
    render(
      <CaminhoPercorrido passos={[passo("m1", { status: "failed", erro: "canal fora", tentativas: 3 })]} nos={nos} arestas={arestas} verDados={false} />,
    );
    expect(screen.getByTestId("caminho-passo")).toHaveAttribute("data-status", "failed");
    expect(screen.getByTestId("caminho-erro")).toHaveTextContent("canal fora");
  });

  it("entrada e saída só abrem para quem pode ver dados", async () => {
    const comDados = passo("m1", { entrada: { a: 1 }, saida: { ok: true } });
    const { rerender } = render(<CaminhoPercorrido passos={[comDados]} nos={nos} arestas={arestas} verDados={false} />);
    expect(screen.queryByText("Ver entrada e saída")).toBeNull();
    rerender(<CaminhoPercorrido passos={[comDados]} nos={nos} arestas={arestas} verDados />);
    await userEvent.click(screen.getByText("Ver entrada e saída"));
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it("execução anterior ao diário diz isso, sem inventar caminho", () => {
    render(<CaminhoPercorrido passos={[]} nos={nos} arestas={arestas} verDados={false} />);
    expect(screen.getByTestId("caminho-vazio")).toBeInTheDocument();
    expect(screen.queryByTestId("caminho-nao-percorridos")).toBeNull();
  });
});
