import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { bancoFalso, filtros } from "@/tests/helpers/banco-falso-da-cobranca";

import { excedenteDoPlano, lerUsoDaOrganizacao, maiorPipeline } from "./uso";

describe("excedenteDoPlano — quanto remover para caber (D-4)", () => {
  it.each([
    [{ assentos: 5, canais: 2 }, { max_assentos: 3, max_canais: 1 }, { assentos: 2, canais: 1 }],
    [{ assentos: 3, canais: 2 }, { max_assentos: 3, max_canais: 1 }, { canais: 1 }],
    [{ assentos: 9, canais: 9 }, { max_assentos: null, max_canais: null }, {}],
    [{ assentos: 0, canais: 0 }, { max_assentos: 1, max_canais: 1 }, {}],
  ])("uso %o no plano %o → %o", (uso, plano, esperado) => {
    expect(excedenteDoPlano(uso, plano)).toEqual(esperado);
  });

  it("⭐ os recursos novos entram na conta; teto ausente ou nulo não limita", () => {
    const uso = { assentos: 1, canais: 1, pipelines: 6, etapas: 9, leads: 5001, automacoes: 8, webhooks: 4 };
    const plano = { max_assentos: 4, max_canais: 3, max_pipelines: 5, max_etapas_por_pipeline: 8, max_leads: 5000, max_automacoes: 8, max_webhooks: null };
    expect(excedenteDoPlano(uso, plano)).toEqual({ pipelines: 1, etapas: 1, leads: 1 });
    expect(excedenteDoPlano(uso, { max_assentos: null, max_canais: null })).toEqual({});
  });
});

describe("maiorPipeline", () => {
  it("o teto de etapas é por pipeline: vale o que mais tem", () => {
    expect(maiorPipeline([{ pipeline_id: "a" }, { pipeline_id: "b" }, { pipeline_id: "a" }])).toBe(2);
    expect(maiorPipeline([])).toBe(0);
  });
});

describe("lerUsoDaOrganizacao — a mesma contagem dos gatilhos de limite (spec §5)", () => {
  const CONTAGENS: Record<string, number> = {
    user_organizations: 4, channel_sessions: 2, crm_pipelines: 3, crm_leads: 120, followup_flow_pointers: 5, webhook_sources: 1,
  };

  it("conta cada recurso só desta org, com os predicados dos gatilhos", async () => {
    const b = bancoFalso((c) =>
      c.tabela === "crm_stages"
        ? { data: [{ pipeline_id: "p1" }, { pipeline_id: "p1" }, { pipeline_id: "p2" }] }
        : { count: CONTAGENS[c.tabela] ?? 0 },
    );
    expect(await lerUsoDaOrganizacao(b.cliente as unknown as SupabaseClient, "org-1")).toEqual({
      assentos: 4, canais: 2, pipelines: 3, etapas: 2, leads: 120, automacoes: 5, webhooks: 1,
    });
    const de = (t: string) => filtros(b.cadeias.find((c) => c.tabela === t)!);
    expect(de("user_organizations")).toEqual([
      ["eq", "organization_id", "org-1"],
      ["is", "revoked_at", null],
      ["eq", "provisional_until_handover", false],
    ]);
    expect(de("channel_sessions")).toEqual([
      ["eq", "organization_id", "org-1"],
      ["is", "archived_at", null],
      ["neq", "provider", "wacalls"],
    ]);
    expect(de("crm_pipelines")).toEqual([["eq", "organization_id", "org-1"], ["eq", "is_archived", false]]);
    expect(de("crm_stages")).toEqual([["eq", "organization_id", "org-1"], ["eq", "is_archived", false]]);
    expect(de("crm_leads")).toEqual([["eq", "organization_id", "org-1"]]);
    expect(de("followup_flow_pointers")).toEqual([["eq", "organization_id", "org-1"], ["eq", "surface", "crm_automation"]]);
    expect(de("webhook_sources")).toEqual([["eq", "organization_id", "org-1"]]);
  });

  it("leitura que falha devolve null: quem chama responde 500, nunca 'cabe'", async () => {
    const b = bancoFalso((c) => (c.tabela === "crm_leads" ? { error: { message: "boom" } } : { count: 1, data: [] }));
    expect(await lerUsoDaOrganizacao(b.cliente as unknown as SupabaseClient, "org-1")).toBeNull();
  });
});

/**
 * As duas réguas não podem divergir: se um predicado mudar num lado só, a tela
 * (e a troca de plano) diz "cabe" e o banco recusa com PT402, ou o contrário.
 * O caso acima fixa os filtros do app; este fixa os predicados dos gatilhos no
 * baseline que o kit aplica.
 */
describe("a contagem do app é a dos gatilhos", () => {
  const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
  const corpo = (fn: string) => {
    const inicio = baseline.lastIndexOf(`create or replace function public.${fn}()`);
    expect(inicio, `${fn} sumiu do baseline`).toBeGreaterThan(-1);
    return baseline.slice(inicio, baseline.indexOf("$$;", inicio));
  };

  it("assentos: revoked_at nulo e não provisório", () => {
    const c = corpo("fn_trava_assentos_do_plano");
    expect(c).toContain("uo.revoked_at is null");
    expect(c).toContain("not uo.provisional_until_handover");
  });

  it("canais: não arquivado e não wacalls", () => {
    const c = corpo("fn_trava_canais_do_plano");
    expect(c).toContain("cs.archived_at is null");
    expect(c).toContain("cs.provider <> 'wacalls'");
  });

  it("pipelines e etapas: não arquivados; etapas contadas no mesmo pipeline", () => {
    expect(corpo("fn_trava_pipelines_do_plano")).toContain("p.organization_id = new.organization_id and not p.is_archived");
    expect(corpo("fn_trava_etapas_do_plano")).toContain("s.pipeline_id = new.pipeline_id and not s.is_archived");
  });

  it("leads, automações e webhooks: todos da org; automação é surface crm_automation", () => {
    expect(corpo("fn_trava_leads_do_plano")).toContain("l.organization_id = new.organization_id and l.id <> new.id");
    expect(corpo("fn_trava_automacoes_do_plano")).toContain("f.surface = 'crm_automation'");
    expect(corpo("fn_trava_webhooks_do_plano")).toContain("w.organization_id = new.organization_id and w.id <> new.id");
  });
});
