import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LeadDossierDoFunil } from "@/components/kanban/LeadDossierDoFunil";
import { LeadFieldsForm } from "@/components/kanban/LeadFieldsForm";
import { useSaidaProtegida } from "@/components/kanban/SaidaSemSalvar";
import { diferencaDoRascunho, type ItemDoRascunho } from "@/lib/leads/rascunho-de-produtos";

/**
 * A ficha do lead só grava no "Salvar" (15/10/2026): produtos gravavam a cada
 * clique, e o botão Salvar parecia não mandar em nada. Fechar a gaveta com
 * alteração não salva PERGUNTA antes — e o dossiê aberto pelo Inbox abre na
 * hora, sem esperar o quadro do funil.
 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ currency: "BRL", country: null, role: "agent" }),
  useAuth: () => ({ activeOrg: { orgId: "org-1" } }),
  useUser: () => ({ id: "u-1", is_platform_admin: false, support: null }),
}));
vi.mock("@/hooks/kanban/useBoard", () => ({
  chaveDoQuadro: (id: string | null) => ["board", id],
  useBoard: () => ({ data: undefined }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));

const LEAD = "a0000000-0000-4000-8000-000000000001";
const PRODUTO = "0c000000-0000-4000-8000-000000000001";
const GRAVADO: ItemDoRascunho = {
  id: "i-1",
  product_id: "0c000000-0000-4000-8000-000000000009",
  nome: "Coleta",
  quantidade: 1,
  preco_unitario_cents: 5000,
  desconto_cents: 0,
};
const NEGOCIO = {
  id: LEAD,
  title: "Negócio",
  description: null,
  value_cents: 5000,
  currency: "BRL",
  stage_id: "22222222-2222-4222-8222-222222222222",
  expected_close_date: null,
  tags: [],
  custom_fields: {},
} as never;

function comQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  api.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/produtos")) return { data: [{ ...GRAVADO, lead_id: LEAD, created_at: "" }] };
    if (url === "/api/v1/products")
      return { data: [{ id: PRODUTO, nome: "Coleta VCA", preco_cents: 19700, ativo: true }] };
    return { data: [] };
  });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: NEGOCIO });
  api.delete.mockResolvedValue({ data: {} });
});
afterEach(() => vi.clearAllMocks());

describe("o rascunho dos produtos vira só a diferença", () => {
  it("novo, alterado e removido — e o que não mudou não viaja", () => {
    const outro = { ...GRAVADO, id: "i-2", product_id: "p-2" };
    const d = diferencaDoRascunho(
      [GRAVADO, outro],
      [
        { ...GRAVADO, desconto_cents: 500 },
        { ...GRAVADO, id: "novo-x-1", product_id: PRODUTO, quantidade: 2 },
      ],
    );
    expect(d).toEqual({
      remover: ["i-2"],
      adicionar: [{ product_id: PRODUTO, quantidade: 2, desconto_cents: 0 }],
      alterar: [{ itemId: "i-1", desconto_cents: 500 }],
    });
    expect(diferencaDoRascunho([GRAVADO], [GRAVADO])).toEqual({
      remover: [],
      adicionar: [],
      alterar: [],
    });
  });
});

describe("ficha do lead — nada grava antes do Salvar", () => {
  it("adicionar e remover produto mudam a tela, não o servidor; o Salvar grava tudo", async () => {
    const user = userEvent.setup();
    comQuery(<LeadFieldsForm lead={NEGOCIO} pipelineId="p-1" />);
    await screen.findByText("Coleta");

    await user.click(screen.getByTestId("adicionar-produto"));
    await user.click(await screen.findByRole("option", { name: /Coleta VCA/ }));
    await user.click(screen.getByRole("button", { name: "Remover produto: Coleta" }));
    expect(screen.getByText("Coleta VCA")).toBeTruthy();
    expect(screen.queryByText("Coleta")).toBeNull();
    // O valor já mostra a soma do rascunho…
    expect((screen.getByTestId("valor-pelos-produtos") as HTMLInputElement).value).toMatch(
      /197,00/,
    );
    // …e o servidor ainda não soube de nada.
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/produtos`, {
      product_id: PRODUTO,
      quantidade: 1,
      desconto_cents: 0,
    });
    expect(api.delete).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/produtos/i-1`);
    // Com produtos, o valor é da trigger: o PATCH do lead não leva value_cents.
    expect(api.patch.mock.calls[0]?.[1]).not.toHaveProperty("value_cents");
  });
});

/** O dono da gaveta: a ficha + o pedido de fechar, como no dossiê. */
function GavetaDeTeste({ aoFechar }: { aoFechar: () => void }) {
  const saida = useSaidaProtegida(aoFechar);
  const [, forcar] = useState(0);
  return (
    <>
      <LeadFieldsForm
        lead={NEGOCIO}
        pipelineId="p-1"
        formId={saida.formId}
        semBotoes
        onEstado={saida.aoMudarEstado}
        onSaved={saida.aoSalvar}
        onErroAoSalvar={saida.aoFalharAoSalvar}
      />
      <button type="button" onClick={() => (saida.pedirFechar(), forcar((n) => n + 1))}>
        Fechar gaveta
      </button>
      {saida.dialogo}
    </>
  );
}

describe("fechar com alteração não salva pergunta antes", () => {
  it("sem alteração, fecha direto", async () => {
    const user = userEvent.setup();
    const aoFechar = vi.fn();
    comQuery(<GavetaDeTeste aoFechar={aoFechar} />);
    await screen.findByText("Coleta");
    await user.click(screen.getByRole("button", { name: "Fechar gaveta" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("com alteração: avisa, 'Continuar editando' fica, 'Descartar' sai sem gravar", async () => {
    const user = userEvent.setup();
    const aoFechar = vi.fn();
    comQuery(<GavetaDeTeste aoFechar={aoFechar} />);
    await screen.findByText("Coleta");
    await user.type(screen.getByLabelText("Título"), " editado");

    await user.click(screen.getByRole("button", { name: "Fechar gaveta" }));
    expect(await screen.findByTestId("dossie-sair-sem-salvar")).toBeTruthy();
    expect(aoFechar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(aoFechar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Fechar gaveta" }));
    await user.click(await screen.findByRole("button", { name: "Descartar alterações" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("'Salvar e fechar' grava e só então fecha", async () => {
    const user = userEvent.setup();
    const aoFechar = vi.fn();
    comQuery(<GavetaDeTeste aoFechar={aoFechar} />);
    await screen.findByText("Coleta");
    await user.type(screen.getByLabelText("Título"), " editado");

    await user.click(screen.getByRole("button", { name: "Fechar gaveta" }));
    await user.click(await screen.findByRole("button", { name: "Salvar e fechar" }));

    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(api.patch.mock.calls[0]?.[1]).toMatchObject({ title: "Negócio editado" });
  });
});

describe("dossiê pelo Inbox — abre na hora", () => {
  it("a gaveta abre com o título antes de o quadro do funil chegar", () => {
    comQuery(
      <LeadDossierDoFunil
        pipelineId="p-1"
        leadId={LEAD}
        titulo="Coleta · Marina"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog").textContent).toContain("Coleta · Marina");
    expect(screen.getByTestId("dossie-carregando")).toBeTruthy();
  });
});
