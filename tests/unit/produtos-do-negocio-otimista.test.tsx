import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeadDossierDoFunil } from "@/components/kanban/LeadDossierDoFunil";
import { useProdutosDoNegocio } from "@/hooks/leads/useProdutosDoNegocio";
import type { ProdutoDoNegocio } from "@/lib/schemas/produtos-do-negocio";

/**
 * Duas esperas que pareciam travamento (15/10/2026):
 *  - adicionar produto no dossiê só aparecia depois do servidor responder;
 *  - o dossiê aberto pelo Inbox não desenhava NADA até o quadro do funil
 *    inteiro chegar (segundos, num funil de mil negócios).
 */

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post, patch: vi.fn(), delete: vi.fn() } }));
const showApiError = vi.hoisted(() => vi.fn());
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError }));
vi.mock("@/hooks/kanban/useBoard", () => ({
  chaveDoQuadro: (id: string | null) => ["board", id],
  useBoard: () => ({ data: undefined }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));

const LEAD = "a0000000-0000-4000-8000-000000000001";
const PRODUTO = "0c000000-0000-4000-8000-000000000001";
const EXISTENTE: ProdutoDoNegocio = {
  id: "i-1",
  lead_id: LEAD,
  product_id: "0c000000-0000-4000-8000-000000000009",
  nome: "Coleta",
  quantidade: 1,
  preco_unitario_cents: 5000,
  desconto_cents: 0,
  created_at: "2026-10-15T12:00:00Z",
};

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    ["catalogo-de-produtos"],
    [{ id: PRODUTO, nome: "Coleta VCA", preco_cents: 19700, ativo: true }],
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useProdutosDoNegocio(LEAD, "p-1"), { wrapper });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  showApiError.mockReset();
  get.mockResolvedValue({ data: [EXISTENTE] });
});

describe("produto no dossiê — otimista", () => {
  it("o produto aparece ANTES de o servidor responder", async () => {
    post.mockReturnValue(new Promise(() => {})); // servidor que nunca responde
    const { result } = montar();
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => result.current.adicionar.mutate(PRODUTO));

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data?.[1]).toMatchObject({
      product_id: PRODUTO,
      nome: "Coleta VCA",
      preco_unitario_cents: 19700,
    });
  });

  it("se o servidor recusar, a lista volta ao que era e o erro aparece", async () => {
    let recusar: (e: unknown) => void = () => {};
    post.mockReturnValue(new Promise((_, rej) => (recusar = rej)));
    const { result } = montar();
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => result.current.adicionar.mutate(PRODUTO));
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    await act(async () => recusar(new Error("recusado")));

    await waitFor(() => expect(result.current.data).toEqual([EXISTENTE]));
    expect(showApiError).toHaveBeenCalled();
  });
});

describe("dossiê pelo Inbox — abre na hora", () => {
  it("a gaveta abre com o título antes de o quadro do funil chegar", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <LeadDossierDoFunil
          pipelineId="p-1"
          leadId={LEAD}
          titulo="Coleta · Marina"
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("dialog").textContent).toContain("Coleta · Marina");
    expect(screen.getByTestId("dossie-carregando")).toBeTruthy();
  });
});
