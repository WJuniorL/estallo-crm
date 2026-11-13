import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";

/**
 * Os dois e-mails de ACESSO — confirmar conta e redefinir senha — no formato
 * que o GoTrue renderiza.
 *
 * ─── POR QUE ISTO É DIFERENTE DE `invite.ts` ────────────────────────────────
 *
 * O convite de time é montado e ENVIADO por nós. Estes dois não: quem os
 * renderiza e envia é o GoTrue, um processo de terceiro. Nós só entregamos o
 * MOLDE, e ele preenche `{{ .RedirectTo }}` e `{{ .TokenHash }}` na hora do
 * envio. Por isso a saída aqui é uma string de template Go, não um e-mail
 * pronto — e por isso as chaves duplas NÃO passam por escape: elas são sintaxe
 * do renderizador, não dado.
 *
 * ─── POR QUE `token_hash` E NÃO `{{ .ConfirmationURL }}` ────────────────────
 *
 * O modelo PADRÃO do GoTrue linka para `/auth/v1/verify`, que devolve um `code`
 * PKCE. O verificador desse code vive num cookie `SameSite=Strict`
 * (`lib/supabase/server.ts`), e clique vindo de webmail é navegação
 * cross-site: o cookie não viaja, `exchangeCodeForSession` falha, e a conta é
 * confirmada sem que a sessão feche. `token_hash` não depende de cookie nenhum.
 *
 * Medido numa instalação self-hosted em 2026-09-10: com o modelo padrão, o
 * `api_audit_log` registrava `auth.email_link_rejected` com
 * `"PKCE code verifier not found in storage"`; com estes moldes, o mesmo fluxo
 * fecha a sessão.
 *
 * ─── `&`, NUNCA `?` ────────────────────────────────────────────────────────
 *
 * `.RedirectTo` já chega com `?type=` embutido — `signUp.ts` e
 * `requestPasswordReset.ts` o anexam de propósito, porque é o único jeito de o
 * `type` sobreviver ao hop pelo GoTrue no outro formato. Um `?` aqui duplicaria
 * o separador e o parser de URL do browser pararia de reconhecer `token_hash`.
 */

export type ModeloDeAcesso = "confirmation" | "recovery";

export const MODELOS_DE_ACESSO: readonly ModeloDeAcesso[] = ["confirmation", "recovery"];

/** O texto de cada modelo. Assunto entra no `GOTRUE_MAILER_SUBJECTS_*`. */
const COPIA: Record<ModeloDeAcesso, { assunto: (marca: string) => string; titulo: string; corpo: (marca: string) => string; botao: string; rodape: string }> = {
  confirmation: {
    assunto: (marca) => `Confirme seu e-mail · ${marca}`,
    titulo: "Confirme seu e-mail",
    corpo: (marca) =>
      `Sua conta no ${marca} está quase pronta. Clique no botão abaixo para confirmar seu e-mail e ativar sua conta.`,
    botao: "Confirmar e-mail",
    rodape: "Se você não criou esta conta, ignore este e-mail.",
  },
  recovery: {
    assunto: (marca) => `Redefinir sua senha · ${marca}`,
    titulo: "Redefinir sua senha",
    corpo: (marca) =>
      `Recebemos um pedido para redefinir a senha da sua conta no ${marca}. Clique no botão abaixo para escolher uma nova.`,
    botao: "Definir nova senha",
    rodape:
      "Se não foi você quem pediu, ignore este e-mail — sua senha continua a mesma.",
  },
};

export function assuntoDoModelo(modelo: ModeloDeAcesso, marca: MarcaDeSaida): string {
  return COPIA[modelo].assunto(marca.nome);
}

/**
 * O molde, com a marca da INSTALAÇÃO já aplicada.
 *
 * Estilo inline apenas e zero asset externo além do logo, pelas mesmas razões
 * de `invite.ts` — inclusive a dimensão no atributo, que o Outlook desktop
 * exige porque descarta `height` de style em imagem.
 */
export function montarTemplateDeAcesso(modelo: ModeloDeAcesso, marca: MarcaDeSaida, logoPadraoUrl?: string): string {
  const t = COPIA[modelo];
  const nome = escapeHtml(marca.nome);
  // A identidade fixa não tem logo no banco (`marcaDaSaida` devolve null): quem
  // serve o molde passa o logo do produto, em URL absoluta (e-mail não resolve relativa).
  const logoUrl = marca.logoUrl ?? logoPadraoUrl ?? null;
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${nome}" height="32" style="height:32px;width:auto;max-width:180px;border:0;display:block">`
    : `<span style="font-size:18px;font-weight:700;color:${NEUTROS_DE_SAIDA.texto}">${nome}</span>`;

  // `&`, nunca `?`: `.RedirectTo` já chega com `?type=` (app/actions/auth/signUp.ts).
  const destino = "{{ .RedirectTo }}&token_hash={{ .TokenHash }}";

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t.titulo)}</title></head>
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:Manrope,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${NEUTROS_DE_SAIDA.fundo}">
    <tr><td align="center" style="padding:40px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
        <tr><td style="padding:0 4px 20px">${logo}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${NEUTROS_DE_SAIDA.linha};border-radius:12px;padding:36px 32px">
          <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px;color:${NEUTROS_DE_SAIDA.texto}">${escapeHtml(t.titulo)}</h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${NEUTROS_DE_SAIDA.texto}">${escapeHtml(t.corpo(marca.nome))}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-radius:8px;background:${marca.accent}">
              <a href="${destino}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${marca.accentFg};text-decoration:none;border-radius:8px">${escapeHtml(t.botao)}</a>
            </td>
          </tr></table>
          <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:${NEUTROS_DE_SAIDA.suave}">
            Se o botão não funcionar, copie e cole este link no navegador:<br>
            <span style="word-break:break-all;color:${marca.accent}">${destino}</span>
          </p>
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:${NEUTROS_DE_SAIDA.suave}">${escapeHtml(t.rodape)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
