import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/products/categorias — as categorias cadastradas da organização (lista da tela).
 * POST /api/v1/products/categorias — cadastra uma categoria (manager+).
 *
 * O produto guarda o NOME em `catalog_products.categoria`; este cadastro (0721)
 * é a fonte da lista pesquisável. Ver a migration para os gatilhos.
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

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_categories")
    .select("id, nome")
    .eq("organization_id", authz.org.orgId)
    .order("nome", { ascending: true });
  if (error) return fail("internal_error", "Erro ao listar categorias.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

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
    .insert({ organization_id: authz.org.orgId, nome: parsed.data.nome })
    .select("id, nome")
    .single();
  if (error) {
    if (error.code === "23505") {
      return fail("conflict", t("Já existe uma categoria com esse nome."), 409, { requestId });
    }
    return fail("internal_error", "Erro ao salvar a categoria.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "catalog_category.created",
    resourceType: "catalog_categories",
    resourceId: data.id,
    requestId,
  });
  return ok(data, { requestId, status: 201 });
}
