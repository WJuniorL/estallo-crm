/**
 * A recusa de uma operação de domínio virando `Response`.
 *
 * Existe desde que as operações saíram dos Route Handlers (BRIEFING §3, Decisão
 * 4): a regra passou a viver em `lib/<dominio>/`, lança `ApiError` e não conhece
 * HTTP; a rota traduz. Sem este ponto único, cada rota reescreveria o mesmo
 * `catch` — e a que esquecesse o `details` engoliria em silêncio o número que a
 * tela usa para perguntar "para onde vão os N negócios?".
 *
 * O limite do plano (migration 0718) chega aqui como `ApiError(500)` com a
 * mensagem do gatilho (`limite_do_plano:<recurso>:<teto>`): vira 409
 * `plan_limit_reached` com a frase que diz o teto e o caminho.
 *
 * ⚠️ O `throw` DE VOLTA NÃO É DESCUIDO. Erro que não é `ApiError` é defeito de
 * programação (ou o Supabase quebrando de um jeito não previsto): traduzi-lo
 * para um 500 educado apagaria o stack trace que o Sentry precisa e transformaria
 * um bug em "erro interno" indistinguível de uma recusa legítima.
 */
import { ApiError } from "@/lib/api/types";
import { fail } from "@/lib/api/wrappers";
import { falhaDoLimite } from "@/lib/cobranca/limites";
import type { Idioma } from "@/lib/i18n/idiomas";

export function respostaDeRecusa(err: unknown, requestId: string, idioma: Idioma = "pt-BR"): Response {
  if (err instanceof ApiError) {
    return falhaDoLimite(err, idioma, requestId) ?? fail(err.code, err.message, err.status, { requestId, details: err.details });
  }
  throw err;
}
