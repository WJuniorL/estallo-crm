/**
 * Fase 5 das automações, pela tela: a conexão HTTP protegida, o bloco Requisição HTTP, os blocos Buscar ou criar e
 * Extrair dados por IA, e o seletor «Aplicar em».
 *
 * O que se mede é o que um leigo vê e o que a rede devolve: a credencial é digitada UMA vez e nunca volta — nem na
 * resposta do cadastro, nem na lista. Quem cadastra é o admin (MFA); quem monta o fluxo é o manager.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "./helpers/test";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "automacoes-fase5");
fs.mkdirSync(EVIDENCIA, { recursive: true });

let creds = lerCreds();

async function loginManager(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(creds.users.manager!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

async function novoFluxo(page: Page, nome: string): Promise<void> {
  await page.goto("/app/ai/followups");
  await page.getByRole("button", { name: "Novo fluxo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(nome);
  await dialog.getByRole("button", { name: "Criar fluxo" }).click();
  await expect(dialog).not.toBeVisible();
  await page.locator("li", { hasText: nome }).getByRole("link").first().click();
  await page.waitForURL(/\/app\/ai\/followups\/[0-9a-f-]+$/);
  await expect(page.locator(".react-flow")).toBeVisible();
}

test.describe("automações — blocos de integração (Fase 5)", () => {
  test("admin cadastra conexão HTTP protegida e o bloco a usa; a credencial nunca volta", async ({ page }) => {
    creds = await loginComoAdmin(page, creds);
    await novoFluxo(page, `E2E HTTP ${Date.now()}`);

    await page.getByTestId("palette-add-http_request").click();
    const cartao = page.locator('[data-testid^="node-card-http_request-"]');
    await cartao.click();
    const painel = page.getByTestId("node-config-panel");
    await expect(painel.getByLabel("Conexão")).toBeVisible();
    await expect(cartao).toContainText("sem conexão escolhida");

    await painel.getByRole("button", { name: "Gerenciar conexões" }).click();
    const dialogo = page.getByRole("dialog", { name: "Conexões HTTP" });
    const nome = `ERP ${Date.now()}`;
    const segredo = `segredo-e2e-${Date.now()}-9876`;
    await dialogo.getByLabel("Nome da conexão").fill(nome);
    await dialogo.getByLabel("Endereço base").fill("https://api.example.com");
    await dialogo.getByLabel("Credencial").fill(segredo);
    const cadastro = page.waitForResponse(
      (r) => r.url().includes("/api/v1/ai/followup-http-connections") && r.request().method() === "POST",
    );
    await dialogo.getByRole("button", { name: "Cadastrar conexão" }).click();
    const resposta = await cadastro;
    expect(resposta.status()).toBe(201);
    expect(await resposta.text()).not.toContain(segredo);
    await expect(dialogo.getByText(nome)).toBeVisible();
    await expect(dialogo.getByText("••••9876")).toBeVisible();
    // A credencial digitada não fica no campo depois do cadastro.
    await expect(dialogo.getByLabel("Credencial")).toHaveValue("");
    await page.screenshot({ path: path.join(EVIDENCIA, "conexao-cadastrada.png"), fullPage: true });

    const lista = await page.request.get("/api/v1/ai/followup-http-connections");
    expect(lista.status()).toBe(200);
    const corpo = await lista.text();
    expect(corpo).toContain(nome);
    expect(corpo).not.toContain(segredo);
    expect(corpo).not.toContain("secret_encrypted");

    await page.keyboard.press("Escape");
    await expect(dialogo).not.toBeVisible();
    await painel.getByLabel("Conexão").click();
    await page.getByRole("option", { name: nome }).click();
    await expect(cartao).toContainText("GET /");
    await page.screenshot({ path: path.join(EVIDENCIA, "bloco-http-configurado.png"), fullPage: true });
  });

  test("manager monta Buscar ou criar e Extrair dados, e o «Aplicar em» aparece nos blocos de efeito", async ({ page }) => {
    await loginManager(page);
    await novoFluxo(page, `E2E Buscar ${Date.now()}`);

    await page.getByTestId("palette-add-find_or_create_lead").click();
    const negocio = page.locator('[data-testid^="node-card-find_or_create_lead-"]');
    await negocio.click();
    const painel = page.getByTestId("node-config-panel");
    await expect(painel.getByLabel("Funil")).toBeVisible();
    await expect(painel.getByLabel("Criar o negócio se não achar")).toBeChecked();
    await expect(negocio).toContainText("sem funil escolhido");
    await page.screenshot({ path: path.join(EVIDENCIA, "buscar-ou-criar-negocio.png"), fullPage: true });

    await page.getByTestId("palette-add-ai_extract").click();
    await page.locator('[data-testid^="node-card-ai_extract-"]').click();
    await expect(painel.getByLabel("Texto a ler")).toBeVisible();
    await painel.getByLabel("Nome do campo").fill("cidade");
    await painel.getByLabel("O que a IA deve procurar").fill("a cidade onde o cliente mora");
    await expect(page.locator('[data-testid^="node-card-ai_extract-"]')).toContainText("cidade");
    await page.screenshot({ path: path.join(EVIDENCIA, "extrair-dados.png"), fullPage: true });

    await page.getByTestId("palette-add-edit_lead_tag").click();
    await page.locator('[data-testid^="node-card-edit_lead_tag-"]').click();
    const aplicarEm = painel.getByLabel("Aplicar em");
    await expect(aplicarEm).toBeVisible();
    await expect(aplicarEm).toContainText("O negócio e o contato desta execução");
    await page.screenshot({ path: path.join(EVIDENCIA, "aplicar-em.png"), fullPage: true });
  });
});
