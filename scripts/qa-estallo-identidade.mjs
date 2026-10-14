// Prova visual local, sem operações de pagamento, mensagens ou alterações cadastrais.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const origin = process.env.ESTALLO_QA_URL ?? "http://127.0.0.1:3001";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw new Error("QA visual só aceita ambiente local.");
const destination = path.resolve("evidence/estallo-identidade");
await fs.mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(120_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message.replace(/https?:\/\/\S+/g, "[url]")));
const checks = {};

async function capture(name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      'nextjs-portal, button[aria-label*="React Query Devtools"] { visibility: hidden !important; }',
  });
  await page.screenshot({ path: path.join(destination, name), fullPage });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    throw new Error(`Overflow horizontal: ${name}`);
}

try {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor({ timeout: 120_000 });
  checks.title = await page.title();
  await capture("login-desktop.png");
  await page.evaluate(() => localStorage.setItem("deskcomm-theme", "dark"));
  await page.reload({ waitUntil: "networkidle" });
  await capture("login-escuro.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("login-mobile-escuro.png");
  await page.evaluate(() => localStorage.setItem("deskcomm-theme", "light"));
  await page.reload({ waitUntil: "networkidle" });
  await capture("login-mobile.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const icon = await context.request.get(`${origin}/icon`);
  checks.icon = { status: icon.status(), type: icon.headers()["content-type"] };

  const credentialsPath = process.env.ESTALLO_QA_CREDENTIALS;
  if (credentialsPath) {
    const raw = await fs.readFile(credentialsPath, "utf8");
    const credentials = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => {
          const position = line.indexOf("=");
          return [
            line.slice(0, position),
            line
              .slice(position + 1)
              .trim()
              .replace(/^("|')(.*)\1$/, "$2"),
          ];
        }),
    );
    if (!credentials.OWNER_EMAIL || !credentials.OWNER_PASSWORD)
      throw new Error("Arquivo sem credenciais do administrador.");
    await page.getByLabel("Email", { exact: true }).fill(credentials.OWNER_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(credentials.OWNER_PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((url) => !["/login", "/app"].includes(url.pathname), {
      timeout: 120_000,
    });
    await page.goto(`${origin}/app/settings/billing`, {
      waitUntil: "domcontentloaded",
      timeout: 300_000,
    });
    checks.billingPath = new URL(page.url()).pathname;
    if (checks.billingPath === "/app/settings/billing") {
      await page.getByRole("heading", { name: "Plano e cobrança", exact: true }).waitFor();
      await page.waitForFunction(() => {
        const button = document.querySelector('button[aria-label="Recolher sidebar"]');
        return button && Object.keys(button).some((key) => key.startsWith("__reactFiber$"));
      });
      if ((await page.getByRole("button", { name: "Contratação em breve" }).count()) !== 3)
        throw new Error("Planos demonstrativos ausentes.");
      await capture("planos-desktop.png");
      checks.navColor = await page
        .locator("aside.estallo-navigation")
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      await page.getByRole("button", { name: "Recolher sidebar", exact: true }).click();
      await page.getByRole("button", { name: "Expandir sidebar", exact: true }).waitFor();
      await capture("navegacao-recolhida.png");
      await page.getByRole("button", { name: "Expandir sidebar", exact: true }).click();
      await page.getByRole("button", { name: "Recolher sidebar", exact: true }).waitFor();
      await page.evaluate(() => localStorage.setItem("deskcomm-theme", "dark"));
      await page.reload({ waitUntil: "networkidle" });
      await capture("planos-escuro.png");
      await page.setViewportSize({ width: 390, height: 844 });
      await capture("planos-mobile.png");
      await page.getByRole("button", { name: "Abrir navegação", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await capture("navegacao-mobile.png", false);
      checks.mobileDrawer = true;
    }
  }
  checks.pageErrors = errors.length;
  if (errors.length) throw new Error("Erros de navegador durante a prova visual.");
  await fs.writeFile(
    path.join(destination, "resultado.json"),
    JSON.stringify(checks, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify(checks) + "\n");
} finally {
  await browser.close();
}
