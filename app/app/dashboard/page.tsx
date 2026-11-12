import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

import { DashboardVendas } from "./_components/DashboardVendas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard — aba Vendas (Fase 1). A conta é de `fn_dashboard_vendas`
 * (migration 0719), servida por `/api/v1/dashboard/vendas`.
 *
 * Os funis são lidos AQUI, com filtro explícito da organização ativa: a policy
 * de `crm_pipelines` libera todas as organizações do usuário (ver o cabeçalho
 * de `app/app/kanban/page.tsx`), e o seletor não pode misturar as duas.
 */
export default async function DashboardPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const t = (texto: string) => traduzir(texto, user.idioma);
  const podeComparar = ROLE_RANK[org.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_pipelines")
    .select("id, name, is_default, position")
    .eq("organization_id", org.orgId)
    .eq("is_archived", false)
    .order("position", { ascending: true });
  const funis = (data ?? []).map((f) => ({ id: f.id, nome: f.name, padrao: f.is_default }));

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Dashboard de vendas")}</h1>
        <p className="text-sm text-muted-foreground">
          {podeComparar
            ? t("Funil, conversão e desempenho da equipe no período.")
            : t("Seu funil, sua conversão e seus negócios no período.")}
        </p>
      </header>
      <DashboardVendas funis={funis} podeComparar={podeComparar} />
    </div>
  );
}
