/**
 * O uso de uma empresa contra os limites de um plano (spec da cobrança §5, D-4).
 *
 * `lerUsoDaOrganizacao` conta como os gatilhos `trg_trava_*_do_plano` contam:
 * membro ativo (`revoked_at` nulo) e não provisório; canal não arquivado que
 * não é `wacalls` (voz não é número de mensagem); pipeline e etapa não
 * arquivados; todo lead; fluxo com surface `crm_automation`; todo webhook de
 * entrada. Etapas é o MAIOR pipeline, porque o teto é por pipeline. Se a régua
 * de um mudar, a do outro muda junto — `uso.test.ts` confere os dois lados.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface UsoDaOrganizacao {
  assentos: number;
  canais: number;
  pipelines: number;
  /** Etapas não arquivadas do pipeline que mais tem. */
  etapas: number;
  leads: number;
  automacoes: number;
  webhooks: number;
}
export interface LimitesDoPlano {
  max_assentos: number | null;
  max_canais: number | null;
  max_pipelines?: number | null;
  max_etapas_por_pipeline?: number | null;
  max_leads?: number | null;
  max_automacoes?: number | null;
  max_webhooks?: number | null;
}
export type RecursoContado = keyof UsoDaOrganizacao;
export type Excedente = Partial<Record<RecursoContado, number>>;

const TETO_DO_RECURSO: Record<RecursoContado, keyof LimitesDoPlano> = {
  assentos: "max_assentos",
  canais: "max_canais",
  pipelines: "max_pipelines",
  etapas: "max_etapas_por_pipeline",
  leads: "max_leads",
  automacoes: "max_automacoes",
  webhooks: "max_webhooks",
};

/** Quanto o uso passa do plano; só as chaves com excesso. Vazio = cabe. `null`/ausente no plano = sem limite. */
export function excedenteDoPlano(uso: Partial<UsoDaOrganizacao>, plano: LimitesDoPlano): Excedente {
  const excedente: Excedente = {};
  for (const recurso of Object.keys(TETO_DO_RECURSO) as RecursoContado[]) {
    const teto = plano[TETO_DO_RECURSO[recurso]] ?? null;
    const usado = uso[recurso] ?? 0;
    if (teto !== null && usado > teto) excedente[recurso] = usado - teto;
  }
  return excedente;
}

/** O maior número de etapas de um mesmo pipeline. */
export function maiorPipeline(etapas: ReadonlyArray<{ pipeline_id: string }>): number {
  const porPipeline = new Map<string, number>();
  for (const e of etapas) porPipeline.set(e.pipeline_id, (porPipeline.get(e.pipeline_id) ?? 0) + 1);
  return Math.max(0, ...porPipeline.values());
}

/** `null` = uma das leituras falhou. */
export async function lerUsoDaOrganizacao(db: SupabaseClient, orgId: string): Promise<UsoDaOrganizacao | null> {
  const contar = (tabela: string) => db.from(tabela).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  const [membros, canais, pipelines, etapas, leads, automacoes, webhooks] = await Promise.all([
    db
      .from("user_organizations")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("revoked_at", null)
      .eq("provisional_until_handover", false),
    contar("channel_sessions").is("archived_at", null).neq("provider", "wacalls"),
    contar("crm_pipelines").eq("is_archived", false),
    db.from("crm_stages").select("pipeline_id").eq("organization_id", orgId).eq("is_archived", false),
    contar("crm_leads"),
    contar("followup_flow_pointers").eq("surface", "crm_automation"),
    contar("webhook_sources"),
  ]);
  if (membros.error || canais.error || pipelines.error || etapas.error || leads.error || automacoes.error || webhooks.error) return null;
  return {
    assentos: membros.count ?? 0,
    canais: canais.count ?? 0,
    pipelines: pipelines.count ?? 0,
    etapas: maiorPipeline(Array.isArray(etapas.data) ? (etapas.data as Array<{ pipeline_id: string }>) : []),
    leads: leads.count ?? 0,
    automacoes: automacoes.count ?? 0,
    webhooks: webhooks.count ?? 0,
  };
}
