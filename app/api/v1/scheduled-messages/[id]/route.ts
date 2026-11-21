import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH  /api/v1/scheduled-messages/[id] — edita texto e/ou horário de uma agendada pendente.
 * DELETE /api/v1/scheduled-messages/[id] — cancela (status `canceled`; a linha fica).
 *
 * Os dois só valem em `pending`: a guarda está no próprio UPDATE, então quem
 * chega depois do claim do cron recebe 409 em vez de um "cancelado" falso.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_AGENDADA, editarAgendadaSchema, horarioInvalido } from "@/lib/inbox/mensagem-agendada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "scheduled_messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const parsed = editarAgendadaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  if (parsed.data.send_at) {
    const motivo = horarioInvalido(parsed.data.send_at, t);
    if (motivo) return fail("validation_failed", motivo, 422, { requestId });
  }

  return alterar(id, parsed.data, "message.schedule_updated", authz, requestId, t);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "scheduled_messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  return alterar(id, { status: "canceled" }, "message.schedule_canceled", authz, requestId, t);
}

async function alterar(
  id: string,
  campos: Record<string, string | undefined>,
  action: "message.schedule_updated" | "message.schedule_canceled",
  authz: { user: { id: string }; org: { orgId: string } },
  requestId: string,
  t: (texto: string) => string,
): Promise<Response> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_messages")
    .update(campos)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    // Cancelar também descarta a que FALHOU (o aviso no fio some); editar, só pendente.
    .in("status", campos.status === "canceled" ? ["pending", "failed"] : ["pending"])
    .select(COLUNAS_AGENDADA)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao alterar mensagem agendada.", 500, { requestId });
  if (!data) {
    return fail("state_conflict", t("Esta mensagem já foi enviada ou cancelada."), 409, { requestId });
  }

  void audit({
    action,
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "scheduled_message",
    resourceId: id,
    requestId,
    metadata: { conversation_id: data.conversation_id },
  });
  return ok(data, { requestId });
}
