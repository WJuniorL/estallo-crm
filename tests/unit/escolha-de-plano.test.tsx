/**
 * A vitrine de Plano e cobrança (decisão do dono, 12/11/2026): mensal,
 * semestral e anual; no semestral e no anual o número grande é a MENSALIDADE
 * equivalente e o valor do período fica pequeno. Escolher troca o plano da
 * assinatura; com assinatura viva, outro período não é escolhível.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn(), showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: h.post } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: h.showApiError }));

import { EscolhaDePlano } from "@/components/cobranca/EscolhaDePlano";
import { INTERVALOS } from "@/lib/cobranca/vocabulario";
import { NIVEIS_DA_ESTALLO, vitrineDoCatalogo, type PlanoDaVitrine } from "@/lib/planos/catalogo";

const DO_BANCO: PlanoDaVitrine[] = NIVEIS_DA_ESTALLO.flatMap((n) =>
  INTERVALOS.map((intervalo) => ({ id: `${n.nome}-${intervalo}`, nome: n.nome, preco_cents: n.precos[intervalo], intervalo, ...n.limites })),
);
const cartao = (nome: string) => document.querySelector(`[data-plano="${nome}"]`) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.post.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("EscolhaDePlano", () => {
  it("⭐ semestral: a mensalidade equivalente em destaque e o valor do período embaixo", async () => {
    render(<EscolhaDePlano planos={DO_BANCO} atualId="Essencial-mes" podeEscolher intervaloTravado={false} />);
    await userEvent.click(screen.getByRole("radio", { name: /Semestral/ }));
    const essencial = cartao("Essencial");
    expect(essencial.querySelector("[data-mensalidade]")?.textContent).toMatch(/R\$\s?205$/);
    expect(essencial.querySelector("[data-periodo]")?.textContent).toMatch(/R\$\s?1\.230 por semestre/);
  });

  it("anual: R$ 2.134 por ano vira R$ 177,83 por mês", async () => {
    render(<EscolhaDePlano planos={DO_BANCO} atualId="Essencial-mes" podeEscolher intervaloTravado={false} />);
    await userEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    expect(cartao("Essencial").querySelector("[data-mensalidade]")?.textContent).toMatch(/177,83/);
    expect(cartao("Essencial").querySelector("[data-periodo]")?.textContent).toMatch(/2\.134 por ano/);
  });

  it("⭐ escolher troca o plano da assinatura e relê a tela", async () => {
    render(<EscolhaDePlano planos={DO_BANCO} atualId="Essencial-mes" podeEscolher intervaloTravado={false} />);
    await userEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    await userEvent.click(within(cartao("Profissional")).getByRole("button", { name: "Escolher este plano" }));
    expect(h.post).toHaveBeenCalledWith("/api/v1/cobranca/assinatura/plano", { plano_id: "Profissional-ano" });
    expect(h.refresh).toHaveBeenCalled();
  });

  it("com assinatura viva, outro período não é escolhível e a tela diz o caminho", async () => {
    render(<EscolhaDePlano planos={DO_BANCO} atualId="Essencial-mes" podeEscolher intervaloTravado />);
    await userEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    expect(within(cartao("Profissional")).getByRole("button", { name: "Escolher este plano" })).toBeDisabled();
    expect(screen.getAllByText(/cancele e assine de novo/).length).toBeGreaterThan(0);
  });

  it("o plano atual aparece marcado; o Essencial não promete API REST", () => {
    render(<EscolhaDePlano planos={DO_BANCO} atualId="Essencial-mes" podeEscolher intervaloTravado={false} />);
    expect(within(cartao("Essencial")).getByRole("button", { name: "Plano atual" })).toBeDisabled();
    expect(within(cartao("Essencial")).queryByText("API REST para integrações externas")).toBeNull();
    expect(within(cartao("Profissional")).getByText("API REST para integrações externas")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/MCP/);
  });

  it("vitrine sem cobrança ligada: nenhum botão contrata", () => {
    render(<EscolhaDePlano planos={vitrineDoCatalogo()} atualId={null} podeEscolher={false} intervaloTravado={false} />);
    for (const b of screen.getAllByRole("button", { name: "Contratação em breve" })) expect(b).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Escolher este plano" })).toBeNull();
  });
});
