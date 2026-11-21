/**
 * PATCH /api/v1/admin/tenants/[id]/members/[userId]/name — o admin da
 * plataforma corrige o nome de exibição de um membro, pela gestão de tenants.
 *
 * Mesmas guardas da troca de e-mail ao lado (`../email/route.ts`), menos as que
 * só existem porque o e-mail é credencial: o nome não abre conta, então não há
 * aviso na Central nem ao endereço antigo. A pessoa precisa ter acesso ATIVO a
 * este tenant, e o nome de outro admin da plataforma não se troca por aqui.
 */
import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import {
  falhaDaEscritaDePlatformAdmin,
  requirePlatformAdminEscrita,
  type PlatformAdminContext,
} from "@/lib/auth/requirePlatformAdmin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { gravarNomeDoMembro, nomeDoMembroSchema } from "@/lib/team/nome-do-membro";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const requestId = randomUUID();
  const { id, userId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(userId).success) {
    return fail("not_found", "Membro não encontrado", 404, { requestId });
  }

  const supportDenied = await requireSupportWrite(id);
  if (supportDenied) return supportDenied;

  let adminCtx: PlatformAdminContext;
  try {
    adminCtx = await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }

  const parsed = nomeDoMembroSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Informe um nome de até 120 caracteres.", 400, { requestId });
  }

  const admin = createAdminClient();
  const [vinculo, outroAdmin] = await Promise.all([
    admin
      .from("user_organizations")
      .select("id")
      .eq("organization_id", id)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle(),
    admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);
  if (vinculo.error || outroAdmin.error) {
    return fail("internal_error", "Não foi possível ler o membro.", 500, { requestId });
  }
  if (!vinculo.data) {
    return fail("not_found", "Membro sem acesso ativo neste tenant.", 404, { requestId });
  }
  if (outroAdmin.data && userId !== adminCtx.user.id) {
    return fail(
      "forbidden",
      "O nome de um administrador da plataforma só é trocado pelo próprio dono da conta.",
      403,
      { requestId },
    );
  }

  const resultado = await gravarNomeDoMembro(userId, parsed.data.full_name);
  if (!resultado.ok) {
    return resultado.motivo === "nao_encontrado"
      ? fail("not_found", "Login não encontrado.", 404, { requestId })
      : fail("internal_error", "Não foi possível salvar o nome.", 500, { requestId });
  }

  void audit({
    action: "member.name_changed",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: id,
    resourceType: "user",
    resourceId: userId,
    requestId,
    metadata: { nome_anterior: resultado.anterior, nome_novo: parsed.data.full_name },
  });

  return ok({ user_id: userId, full_name: parsed.data.full_name }, { requestId });
}
