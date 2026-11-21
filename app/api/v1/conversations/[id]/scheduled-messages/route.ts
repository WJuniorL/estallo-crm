import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/conversations/[id]/scheduled-messages — agendadas pendentes (e as que falharam) da conversa.
 * POST /api/v1/conversations/[id]/scheduled-messages — agenda uma mensagem de texto (autor = user.id).
 *
 * Quem envia é o cron `scheduled-messages` (ver `lib/inbox/mensagem-agendada.ts`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { agendarSchema, COLUNAS_AGENDADA, horarioInvalido } from "@/lib/inbox/mensagem-agendada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  // LER é de quem vê a conversa (a RLS `scheduled_messages_select` confere
  // `fn_can_view_conversation`): `viewer` e o suporte só-leitura abrem o Inbox,
  // e com `agent` aqui cada conversa aberta por eles virava um 403.
  const authz = await requireRole("viewer", { requestId, resource: "scheduled_messages" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select(COLUNAS_AGENDADA)
    .eq("conversation_id", id)
    .eq("organization_id", authz.org.orgId)
    .in("status", ["pending", "sending", "failed"])
    .order("send_at", { ascending: true });
  if (error) return fail("internal_error", "Erro ao listar mensagens agendadas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "scheduled_messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const parsed = agendarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const motivo = horarioInvalido(parsed.data.send_at, t);
  if (motivo) return fail("validation_failed", motivo, 422, { requestId });

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!conversation) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const { data, error } = await supabase
    .from("scheduled_messages")
    .insert({
      organization_id: org.orgId,
      conversation_id: id,
      created_by_user_id: user.id,
      body: parsed.data.body,
      send_at: parsed.data.send_at,
    })
    .select(COLUNAS_AGENDADA)
    .single();
  if (error || !data) return fail("internal_error", "Erro ao agendar mensagem.", 500, { requestId });

  void audit({
    action: "message.scheduled",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "scheduled_message",
    resourceId: data.id,
    requestId,
    metadata: { conversation_id: id, send_at: data.send_at },
  });
  return ok(data, { requestId, status: 201 });
}
