/**
 * PATCH /api/v1/team/[user_id]/name — o admin da organização corrige o nome de
 * exibição de um membro. Vale também para o admin da plataforma em modo
 * suporte com escrita (ele entra como admin da organização).
 *
 * O nome é do login, então aparece em todas as empresas da pessoa. Por isso o
 * nome de um admin da plataforma não se troca por aqui: uma organização não
 * decide como ele aparece nas outras.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { gravarNomeDoMembro, nomeDoMembroSchema } from "@/lib/team/nome-do-membro";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ user_id: string }> }) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;

  const { user_id } = await ctx.params;
  const parsed = nomeDoMembroSchema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(user_id).success || !parsed.success)
    return fail("validation_failed", "Informe um nome de até 120 caracteres.", 400, { requestId });

  const db = await createClient();
  const [{ data: member, error: readError }, { data: ehAdmin, error: adminError }] =
    await Promise.all([
      db
        .from("user_organizations")
        .select("id")
        .eq("organization_id", authz.org.orgId)
        .eq("user_id", user_id)
        .is("revoked_at", null)
        .maybeSingle(),
      // `platform_admins` não é legível pela sessão da organização; a consulta
      // é por user_id do path, já preso à organização pela leitura ao lado.
      createAdminClient()
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user_id)
        .is("revoked_at", null)
        .maybeSingle(),
    ]);
  if (readError || adminError)
    return fail("internal_error", "Não foi possível ler o membro.", 500, { requestId });
  if (!member) return fail("not_found", "Membro ativo não encontrado.", 404, { requestId });
  if (ehAdmin && user_id !== authz.user.id)
    return fail(
      "forbidden",
      "O nome de um administrador da plataforma só é trocado pelo próprio dono da conta.",
      403,
      { requestId },
    );

  const resultado = await gravarNomeDoMembro(user_id, parsed.data.full_name);
  if (!resultado.ok)
    return resultado.motivo === "nao_encontrado"
      ? fail("not_found", "Login não encontrado.", 404, { requestId })
      : fail("internal_error", "Não foi possível salvar o nome.", 500, { requestId });

  void audit({
    action: "member.name_changed",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "user",
    resourceId: user_id,
    requestId,
    metadata: { nome_anterior: resultado.anterior, nome_novo: parsed.data.full_name },
  });
  return ok({ user_id, full_name: parsed.data.full_name }, { requestId });
}
