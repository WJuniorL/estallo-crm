/**
 * GET/POST /api/v1/cron/scheduled-messages — envia as mensagens agendadas vencidas (migration 0720).
 *
 * A cada minuto: pega `pending` com `send_at <= now()` de organização operante,
 * faz o claim atômico (`pending → sending`, guardado pelo status — dois ticks
 * concorrentes nunca enviam a mesma) e chama o MESMO `sendMessageHandler` do
 * envio manual, com o ator = quem agendou.
 *
 * Falha (janela de 24h fechada, canal fora, quem agendou saiu da equipe) vira
 * `failed` com o motivo, aparece no fio, e abre aviso na Central — o mesmo
 * kind `message_send_stuck` do `recover-stuck-messages`. **Nunca reenvia**:
 * envio em dobro é pior que não-envio.
 *
 * Auth: mesmo contrato dos demais crons (`autorizaCron`, fail-closed).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { podeEnviar } from "@/lib/inbox/mensagem-agendada";
import { logger } from "@/lib/logger";
import { ehOperante, OrgNaoOperanteError, statusDaOrgEmbutida, STATUS_OPERANTE } from "@/lib/organizacao/operante";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Por invocação. ponytail: envio sequencial; paralelizar por canal se a fila crescer. */
const SCAN_LIMIT = 50;

interface Vencida {
  id: string;
  organization_id: string;
  conversation_id: string;
  created_by_user_id: string;
  body: string;
  organizations: { status?: string | null } | Array<{ status?: string | null }> | null;
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scheduled_messages")
    .select("id, organization_id, conversation_id, created_by_user_id, body, organizations:organization_id!inner(status)")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .eq("organizations.status", STATUS_OPERANTE)
    .order("send_at", { ascending: true })
    .limit(SCAN_LIMIT);
  if (error) {
    logger.error("[scheduled-messages] query failed", { error: error.message, requestId });
    return fail("internal_error", "Failed to query scheduled messages.", 500, { requestId });
  }

  let enviadas = 0;
  let falhas = 0;
  for (const s of (data ?? []) as Vencida[]) {
    if (!ehOperante(statusDaOrgEmbutida(s.organizations))) continue;

    const { data: claimed } = await admin
      .from("scheduled_messages")
      .update({ status: "sending" })
      .eq("id", s.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // outro tick pegou, ou foi cancelada agora

    const motivo = await enviar(admin, s, requestId);
    if (motivo === null) {
      enviadas++;
      continue;
    }
    if (motivo === ORG_PARADA) {
      // Suspensa no meio da rodada: volta a pendente. A varredura pula org
      // parada, então ela só sai quando a organização for reativada.
      await admin.from("scheduled_messages").update({ status: "pending" }).eq("id", s.id).eq("status", "sending");
      continue;
    }
    falhas++;
    await admin
      .from("scheduled_messages")
      .update({ status: "failed", error_message: motivo.slice(0, 500) })
      .eq("id", s.id);
    const { error: avisoErr } = await admin.from("agent_inbox_items").insert({
      organization_id: s.organization_id,
      kind: "message_send_stuck",
      severity: "warn",
      title: "Uma mensagem agendada não foi enviada",
      body: `${motivo} Nada foi reenviado automaticamente — abra a conversa para decidir.`,
      ref_kind: "conversation",
      ref_id: s.conversation_id,
    });
    if (avisoErr) {
      logger.error("[scheduled-messages] aviso na Central falhou", { error: avisoErr.message, requestId });
    }
  }

  // Rodada vazia não é mutação e não audita (cron-audita-so-quando-ha-efeito).
  if (enviadas + falhas > 0) {
    void audit({
      action: "message.scheduled_run",
      organizationId: null,
      bypassedRls: true,
      metadata: { sent: enviadas, failed: falhas },
      requestId,
    });
  }
  return ok({ sent: enviadas, failed: falhas }, { requestId });
}

const ORG_PARADA = "org_parada" as const;

/** `null` = saiu (linha já marcada `sent`); `ORG_PARADA` = adiar; string = motivo legível da falha. */
async function enviar(
  admin: ReturnType<typeof createAdminClient>,
  s: Vencida,
  requestId: string,
): Promise<string | null> {
  const { data: vinculo } = await admin
    .from("user_organizations")
    .select("role, revoked_at")
    .eq("organization_id", s.organization_id)
    .eq("user_id", s.created_by_user_id)
    .maybeSingle();
  if (!podeEnviar(vinculo as { role: string; revoked_at: string | null } | null)) {
    return "Quem agendou não faz mais parte da equipe.";
  }

  try {
    const mensagem = await sendMessageHandler(
      admin,
      {
        organization_id: s.organization_id,
        actor: { type: "user", id: s.created_by_user_id },
        requestId: `scheduled:${s.id}`,
      } as Parameters<typeof sendMessageHandler>[1],
      {
        conversation_id: s.conversation_id,
        type: "text",
        body: s.body,
        metadata: { source: "scheduled_message", scheduled_message_id: s.id },
      } as Parameters<typeof sendMessageHandler>[2],
    );
    const status = (mensagem as { status?: string }).status;
    const messageId = (mensagem as { id?: string }).id ?? null;
    if (status === "failed") {
      await admin.from("scheduled_messages").update({ message_id: messageId }).eq("id", s.id);
      return (mensagem as { error_message?: string | null }).error_message || "O canal recusou o envio.";
    }
    await admin
      .from("scheduled_messages")
      .update({ status: "sent", message_id: messageId })
      .eq("id", s.id);
    return null;
  } catch (err) {
    if (err instanceof OrgNaoOperanteError) return ORG_PARADA;
    logger.warn("[scheduled-messages] envio falhou", {
      id: s.id,
      error: err instanceof Error ? err.message : String(err),
      requestId,
    });
    return err instanceof Error && err.message ? err.message : "Falha ao enviar.";
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
