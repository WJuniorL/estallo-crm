import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH  /api/v1/products/categorias/:id — renomeia. O gatilho da 0721 leva o
 *        nome novo aos produtos dela, na mesma transação.
 * DELETE /api/v1/products/categorias/:id — apaga, só se nenhum produto a usa
 *        (409 com a contagem). Apagar em uso deixaria produto com categoria fora
 *        da lista, e o gatilho a recadastraria no próximo salvamento.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { categoriaSchema } from "@/lib/schemas/produtos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const parsed = categoriaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_categories")
    .update({ nome: parsed.data.nome })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select("id, nome")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return fail("conflict", t("Já existe uma categoria com esse nome."), 409, { requestId });
    }
    return fail("internal_error", "Erro ao renomear a categoria.", 500, { requestId });
  }
  if (!data) return fail("not_found", t("Categoria não encontrada."), 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "catalog_category.renamed",
    resourceType: "catalog_categories",
    resourceId: id,
    requestId,
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const supabase = await createClient();
  const { data: categoria } = await supabase
    .from("catalog_categories")
    .select("id, nome")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!categoria) return fail("not_found", t("Categoria não encontrada."), 404, { requestId });

  const { count } = await supabase
    .from("catalog_products")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", authz.org.orgId)
    .ilike("categoria", categoria.nome.replace(/[\\%_]/g, (c: string) => `\\${c}`));
  if ((count ?? 0) > 0) {
    return fail("conflict", t("Há produtos nesta categoria. Troque a categoria deles antes de apagar."), 409, {
      requestId,
      details: { produtos: count },
    });
  }

  const { error } = await supabase
    .from("catalog_categories")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", "Erro ao apagar a categoria.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "catalog_category.deleted",
    resourceType: "catalog_categories",
    resourceId: id,
    requestId,
  });
  return ok({ id }, { requestId });
}
