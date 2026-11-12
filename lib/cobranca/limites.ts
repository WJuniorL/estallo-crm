import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "@/lib/api/wrappers";
import type { RecursoDoPlano } from "@/lib/cobranca/vocabulario";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * LIMITES DO PLANO NO APP — a língua entre os gatilhos do banco e as telas
 * (spec da cobrança do revendedor §5).
 *
 * Quem RECUSA é o banco: `trg_trava_assentos_do_plano` e
 * `trg_trava_canais_do_plano` levantam SQLSTATE `PT402` com a mensagem
 * `limite_do_plano:<recurso>:<teto>`. Este módulo só traduz a recusa para
 * 409 `plan_limit_reached` com a frase que diz o número e o caminho.
 *
 * ⚠️ A leitura é pela MENSAGEM, e não pelo SQLSTATE: `savePartnerSession` e
 * `saveGraphPartnerSession` devolvem só `error.message` à rota, e o código não
 * sobrevive até ela. A mensagem é o contrato; `limites.test.ts` confere no
 * `baseline.sql` que os gatilhos a escrevem assim, e os invariantes
 * `cobranca-assentos`/`cobranca-canais` conferem a mensagem que o Postgres entrega.
 *
 * Desde a PR 3a a empresa troca de plano sozinha: a frase aponta o item de menu
 * "Plano e cobrança".
 */

export type RecursoComLimite = Exclude<RecursoDoPlano, "ia_usd_cents">;

const LIMITE_ESTOURADO = /limite_do_plano:(assentos|canais|pipelines|etapas|leads|automacoes|webhooks):(\d+)/;

export function lerLimiteEstourado(
  erro: unknown,
): { recurso: RecursoComLimite; limite: number } | null {
  const texto =
    typeof erro === "string" ? erro : (erro as { message?: unknown } | null | undefined)?.message;
  const achado = typeof texto === "string" ? LIMITE_ESTOURADO.exec(texto) : null;
  return achado ? { recurso: achado[1] as RecursoComLimite, limite: Number(achado[2]) } : null;
}

// PR 3a: a empresa troca de plano sozinha, então a frase diz ONDE — é a saída
// que o convite recusado com o plano cheio precisa mostrar.
const FRASE_DO_LIMITE: Record<RecursoComLimite, { um: string; varios: string }> = {
  assentos: {
    um: "Seu plano permite 1 pessoa e a vaga está ocupada. Revogue o acesso de alguém em Equipe ou troque de plano em Configurações › Plano e cobrança.",
    varios:
      "Seu plano permite {n} pessoas e todas as vagas estão ocupadas. Revogue o acesso de alguém em Equipe ou troque de plano em Configurações › Plano e cobrança.",
  },
  pipelines: {
    um: "Seu plano permite 1 pipeline. Arquive um pipeline ou troque de plano em Configurações › Plano e cobrança.",
    varios: "Seu plano permite {n} pipelines. Arquive um pipeline ou troque de plano em Configurações › Plano e cobrança.",
  },
  etapas: {
    um: "Seu plano permite {n} etapas por pipeline. Arquive uma etapa ou troque de plano em Configurações › Plano e cobrança.",
    varios: "Seu plano permite {n} etapas por pipeline. Arquive uma etapa ou troque de plano em Configurações › Plano e cobrança.",
  },
  leads: {
    um: "Seu plano permite 1 lead. Exclua leads antigos ou troque de plano em Configurações › Plano e cobrança.",
    varios: "Seu plano permite {n} leads e a base está cheia. Exclua leads antigos ou troque de plano em Configurações › Plano e cobrança.",
  },
  automacoes: {
    um: "Seu plano permite 1 automação. Exclua uma automação ou troque de plano em Configurações › Plano e cobrança.",
    varios: "Seu plano permite {n} automações. Exclua uma automação ou troque de plano em Configurações › Plano e cobrança.",
  },
  webhooks: {
    um: "Seu plano permite 1 webhook. Exclua um webhook ou troque de plano em Configurações › Plano e cobrança.",
    varios: "Seu plano permite {n} webhooks. Exclua um webhook ou troque de plano em Configurações › Plano e cobrança.",
  },
  canais: {
    um: "Seu plano permite 1 número conectado. Exclua um número em Conexões ou troque de plano em Configurações › Plano e cobrança.",
    varios:
      "Seu plano permite {n} números conectados. Exclua um número em Conexões ou troque de plano em Configurações › Plano e cobrança.",
  },
};

export function mensagemDoLimite(recurso: RecursoComLimite, limite: number, idioma: Idioma): string {
  const frase = FRASE_DO_LIMITE[recurso];
  return traduzir(limite === 1 ? frase.um : frase.varios, idioma).replace("{n}", String(limite));
}

export interface LimiteDoPlanoTraduzido {
  code: "plan_limit_reached";
  message: string;
  details: { recurso: RecursoComLimite; limite: number };
}

export function traduzirLimiteDoPlano(erro: unknown, idioma: Idioma): LimiteDoPlanoTraduzido | null {
  const estourado = lerLimiteEstourado(erro);
  if (!estourado) return null;
  return {
    code: "plan_limit_reached",
    message: mensagemDoLimite(estourado.recurso, estourado.limite, idioma),
    details: estourado,
  };
}

/**
 * A resposta 409 de uma rota cuja escrita bateu no limite do plano, ou `null`
 * se o erro é outro. Uma linha por rota: `const l = falhaDoLimite(e, idioma, rid); if (l) return l;`
 */
export function falhaDoLimite(erro: unknown, idioma: Idioma, requestId: string) {
  const limite = traduzirLimiteDoPlano(erro, idioma);
  return limite ? fail(limite.code, limite.message, 409, { requestId, details: limite.details }) : null;
}

/**
 * O teto vigente do recurso. `null` = sem limite: cobrança desligada, org sem
 * assinatura (isenta) ou plano sem teto. Erro de banco LANÇA — quem chama decide
 * se aquilo é aviso (segue) ou trava.
 */
export async function lerLimiteDoPlano(
  db: SupabaseClient,
  organizationId: string,
  recurso: RecursoComLimite,
): Promise<number | null> {
  const { data, error } = await db.rpc("fn_limite_do_plano", { p_org: organizationId, p_recurso: recurso });
  if (error) throw new Error(`fn_limite_do_plano: ${error.code ?? "sem_sqlstate"} ${error.message}`);
  return typeof data === "number" ? data : null;
}
