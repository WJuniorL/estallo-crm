import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ContactTagsEditor } from "@/components/inbox/ContactTagsEditor";

/**
 * Estallo (0659): atribuir etiqueta oferece as CADASTRADAS daquela entidade
 * (tela Tags) e permite criar na hora. O cadastro vem de `/api/v1/tags/cores`,
 * com a entidade de cada etiqueta.
 */

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { orgId: "org-1" } }),
}));
const get = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn(), patch: vi.fn() },
}));
const mutate = vi.fn();
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutate, isPending: false }),
}));

const CADASTRO = [
  { tag: "VIP", cor: "#1099d3", entidade: "contact" },
  { tag: "Retorno", cor: null, entidade: "contact" },
  { tag: "Proposta enviada", cor: "#10ba84", entidade: "lead" },
];

function montar(tags: string[]) {
  get.mockResolvedValue({ data: CADASTRO });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactTagsEditor contactId="c-1" tags={tags} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  mutate.mockReset();
});

describe("seletor de tags do contato", () => {
  it("oferece só as cadastradas de CONTATO que o contato ainda não tem, e clicar grava", async () => {
    montar(["vip"]);
    await userEvent.click(screen.getByLabelText("Adicionar tag ao contato"));
    const retorno = await screen.findByRole("option", { name: /Retorno/ }, { timeout: 5000 });
    expect(get).toHaveBeenCalledWith("/api/v1/tags/cores");
    // "VIP" já está (caixa diferente) e "Proposta enviada" é de oportunidade.
    expect(screen.queryByRole("option", { name: /VIP/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Proposta enviada/ })).toBeNull();

    await userEvent.click(retorno);
    // O contato grava a forma normalizada, como o servidor.
    expect(mutate).toHaveBeenCalledWith({ tags: ["vip", "retorno"] });
  });

  it("cria na hora uma tag que não está no cadastro", async () => {
    montar([]);
    const campo = screen.getByLabelText("Adicionar tag ao contato");
    await userEvent.type(campo, "Indicação");
    await userEvent.click(await screen.findByRole("option", { name: /Criar «Indicação»/ }));
    expect(mutate).toHaveBeenCalledWith({ tags: ["indicação"] });
  });

  it("digitar o nome de uma cadastrada não oferece 'Criar' — usa a do cadastro", async () => {
    montar([]);
    await userEvent.type(screen.getByLabelText("Adicionar tag ao contato"), "retorno");
    await screen.findByRole("option", { name: /Retorno/ }, { timeout: 5000 });
    expect(screen.queryByRole("option", { name: /Criar/ })).toBeNull();
  });
});
