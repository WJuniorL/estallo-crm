/**
 * GET /api/v1/dashboard/vendas — a aba Vendas do `/app/dashboard`.
 *
 * A conta inteira é de `fn_dashboard_vendas` (migration 0719), SECURITY
 * INVOKER: lida com o client de SESSÃO, a RLS de `crm_leads` escopa — agent vê
 * os próprios negócios, manager+ a organização. A org vem do cookie validado,
 * NUNCA do query. Read-only ⇒ sem audit.
 *
 * O que esta rota acrescenta à RPC: o nome das pessoas do ranking e da lista de
 * parados (o mesmo enriquecimento de `/api/v1/metrics/attendants`, que degrada
 * para `null` sem service role).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import type { DashboardVendasBruto } from "@/lib/metrics/dashboard-vendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Teto da janela: um ano e um dia. Acima disso a comparação vira outra pergunta. */
const JANELA_MAXIMA_DIAS = 366;

const querySchema = z.object({
  pipeline_id: z.string().uuid(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  owner_user_id: z.string().uuid().optional(),
  source: z.string().trim().min(1).max(200).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("agent", { requestId, resource: "metrics" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    pipeline_id: url.searchParams.get("pipeline_id") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    owner_user_id: url.searchParams.get("owner_user_id") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
  const from = parsed.data.from ? new Date(parsed.data.from) : new Date(to.getTime() - 30 * DIA_MS);
  if (from.getTime() >= to.getTime()) {
    return fail("validation_failed", t("Janela inválida: 'from' deve ser anterior a 'to'."), 422, {
      requestId,
    });
  }
  if (to.getTime() - from.getTime() > JANELA_MAXIMA_DIAS * DIA_MS) {
    return fail("validation_failed", t("O período máximo é de um ano."), 422, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_dashboard_vendas", {
    p_org: activeOrg.orgId,
    p_pipeline: parsed.data.pipeline_id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_owner: parsed.data.owner_user_id,
    p_source: parsed.data.source,
  });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const painel = data as unknown as DashboardVendasBruto;

  const ids = new Set<string>();
  for (const r of painel.ranking) if (r.user_id) ids.add(r.user_id);
  for (const p of painel.parados) if (p.owner_user_id) ids.add(p.owner_user_id);
  const nomes: Record<string, string | null> = {};
  if (isServiceRoleConfigured() && ids.size > 0) {
    const admin = createAdminClient();
    await Promise.all(
      [...ids].map(async (id) => {
        const { data: res } = await admin.auth.admin.getUserById(id);
        const u = res?.user;
        nomes[id] = (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? null;
      }),
    );
  }

  return ok(
    { janela: { from: from.toISOString(), to: to.toISOString() }, ...painel, nomes },
    { requestId },
  );
}
