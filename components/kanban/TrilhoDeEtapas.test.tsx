import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TrilhoDeEtapas } from "./TrilhoDeEtapas";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";

const post = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ data: {} })));
vi.mock("@/lib/api/client", () => ({ apiClient: { post } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const etapa = (id: string, extra: Partial<Stage> = {}) =>
  ({ id, name: id, color: "#3b82f6", is_won: false, is_lost: false, is_archived: false, ...extra }) as Stage;

function renderTrilho(podeMover = true) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TrilhoDeEtapas
        lead={{ id: "l-1", stage_id: "a", stage_changed_at: null, updated_at: "2026-10-14T10:00:00Z" } as Lead}
        stages={[etapa("a"), etapa("b"), etapa("ganho", { is_won: true }), etapa("perdido", { is_lost: true })]}
        pipelineId="p-1"
        podeMover={podeMover}
      />
    </QueryClientProvider>,
  );
}

describe("TrilhoDeEtapas", () => {
  it("mostra só as etapas abertas, com a atual marcada", () => {
    renderTrilho();
    expect(screen.getByTestId("trilho-etapa-a")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("trilho-etapa-b")).toBeInTheDocument();
    expect(screen.queryByTestId("trilho-etapa-ganho")).toBeNull();
    expect(screen.queryByTestId("trilho-etapa-perdido")).toBeNull();
  });

  it("um clique move pela mesma rota do arrasto, com a versão do lead", async () => {
    renderTrilho();
    await userEvent.click(screen.getByTestId("trilho-etapa-b"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/leads/l-1/move",
        expect.objectContaining({ stage_id: "b", expected_updated_at: "2026-10-14T10:00:00Z" }),
      ),
    );
  });

  it("campo obrigatório faltando abre o diálogo em vez de quebrar", async () => {
    const { ApiError } = await import("@/lib/api/types");
    post.mockRejectedValueOnce(
      new ApiError(422, "required_fields_missing", { faltando: [{ chave: "cpf", rotulo: "CPF" }] }, "req-1"),
    );
    renderTrilho();
    await userEvent.click(screen.getByTestId("trilho-etapa-b"));
    expect(await screen.findByLabelText("CPF")).toBeInTheDocument();
  });

  it("não trava: o 2º clique durante o move em voo muda a tela na hora e sai depois, com o updated_at novo", async () => {
    post.mockClear();
    let soltar: (v: { data: unknown }) => void = () => {};
    post.mockImplementationOnce(() => new Promise<{ data: object }>((r) => (soltar = r as (v: { data: unknown }) => void)));
    const client = new QueryClient();
    const lead = { id: "l-1", stage_id: "a", stage_changed_at: null, updated_at: "T1", position_in_stage: 1 } as Lead;
    client.setQueryData(["board", "p-1"], { leads: [lead], stages: [] });
    render(
      <QueryClientProvider client={client}>
        <TrilhoDeEtapas lead={lead} stages={[etapa("a"), etapa("b"), etapa("c")]} pipelineId="p-1" podeMover />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByTestId("trilho-etapa-b"));
    expect(screen.getByTestId("trilho-etapa-b")).toHaveAttribute("aria-current", "step");
    // O primeiro ainda não voltou: o botão não está desabilitado e o clique vale.
    expect(screen.getByTestId("trilho-etapa-c")).not.toBeDisabled();
    await userEvent.click(screen.getByTestId("trilho-etapa-c"));
    expect(screen.getByTestId("trilho-etapa-c")).toHaveAttribute("aria-current", "step");
    expect(post).toHaveBeenCalledTimes(1);

    soltar({ data: { ...lead, stage_id: "b", updated_at: "T2" } });
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(
        "/api/v1/leads/l-1/move",
        expect.objectContaining({ stage_id: "c", expected_updated_at: "T2" }),
      ),
    );
  });

  it("erro devolve a etapa anterior", async () => {
    const { ApiError } = await import("@/lib/api/types");
    post.mockRejectedValueOnce(new ApiError(500, "internal_error", undefined, "req-2"));
    renderTrilho();
    await userEvent.click(screen.getByTestId("trilho-etapa-b"));
    await waitFor(() => expect(screen.getByTestId("trilho-etapa-a")).toHaveAttribute("aria-current", "step"));
  });

  it("sem permissão, os botões ficam desabilitados", () => {
    renderTrilho(false);
    expect(screen.getByTestId("trilho-etapa-b")).toBeDisabled();
  });
});
