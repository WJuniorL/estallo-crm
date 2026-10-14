import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TrilhoDeEtapas } from "./TrilhoDeEtapas";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";

const post = vi.hoisted(() => vi.fn(async () => ({ data: { updated_count: 1 } })));
vi.mock("@/lib/api/client", () => ({ apiClient: { post } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const etapa = (id: string, extra: Partial<Stage> = {}) =>
  ({ id, name: id, color: "#3b82f6", is_won: false, is_lost: false, is_archived: false, ...extra }) as Stage;

function renderTrilho(podeMover = true) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TrilhoDeEtapas
        lead={{ id: "l-1", stage_id: "a", stage_changed_at: null } as Lead}
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

  it("um clique move pela mesma rota do lote do quadro", async () => {
    renderTrilho();
    await userEvent.click(screen.getByTestId("trilho-etapa-b"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/leads/bulk", {
        action: "move",
        lead_ids: ["l-1"],
        params: { stage_id: "b" },
      }),
    );
  });

  it("sem permissão, os botões ficam desabilitados", () => {
    renderTrilho(false);
    expect(screen.getByTestId("trilho-etapa-b")).toBeDisabled();
  });
});
