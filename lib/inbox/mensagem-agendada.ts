/**
 * Mensagem agendada no Inbox (migration 0720): o atendente escreve agora e o
 * cron `scheduled-messages` envia no horário, pelo MESMO `sendMessageHandler`
 * do envio manual, como quem agendou.
 *
 * Estados: pending → sending → sent | failed; ou canceled. Editar e cancelar só
 * valem em `pending` — a guarda mora no UPDATE (`.eq("status","pending")`),
 * então um cancelamento que chega depois do claim do cron recebe 409 em vez de
 * fingir que segurou um envio que já saiu.
 */
import { z } from "zod";

import { roleAtLeast } from "@/lib/auth/types";

export const COLUNAS_AGENDADA =
  "id, conversation_id, body, send_at, status, error_message, created_by_user_id, created_at";

export interface MensagemAgendada {
  id: string;
  conversation_id: string;
  body: string;
  send_at: string;
  status: "pending" | "sending" | "sent" | "canceled" | "failed";
  error_message: string | null;
  created_by_user_id: string;
  created_at: string;
}

/** Folga mínima: menos que isto é "enviar agora", não agendar. */
export const ANTECEDENCIA_MINIMA_MS = 60_000;
export const HORIZONTE_MAXIMO_MS = 366 * 24 * 60 * 60 * 1000;

const corpo = z.string().trim().min(1).max(4096);
const horario = z.string().datetime({ offset: true });

export const agendarSchema = z.object({ body: corpo, send_at: horario });
export const editarAgendadaSchema = z
  .object({ body: corpo.optional(), send_at: horario.optional() })
  .refine((v) => v.body !== undefined || v.send_at !== undefined, { message: "nada para alterar" });

/** `null` quando o horário serve; senão a mensagem 422, já traduzida. */
export function horarioInvalido(
  sendAt: string,
  t: (texto: string) => string,
  agora = Date.now(),
): string | null {
  const ms = new Date(sendAt).getTime();
  if (ms < agora + ANTECEDENCIA_MINIMA_MS) return t("O horário precisa ser pelo menos 1 minuto no futuro.");
  if (ms > agora + HORIZONTE_MAXIMO_MS) return t("O horário não pode passar de um ano.");
  return null;
}

/** Quem agendou ainda pode enviar? Membro ativo, agent+. */
export function podeEnviar(vinculo: { role: string; revoked_at: string | null } | null): boolean {
  return !!vinculo && !vinculo.revoked_at && roleAtLeast(vinculo.role, "agent");
}
