import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * `fn_dashboard_vendas` (migration 0719) contra o Postgres REAL do baseline.
 *
 * A função é SECURITY INVOKER: quem separa organização e dono é a RLS de
 * `crm_leads`, não o `p_org`. Aqui se prova a conta (ganhos, ciclo, fluxo,
 * moeda que não mistura, transferência que não é perda) e o que um `p_org`
 * forjado NÃO alcança.
 *
 * Namespace d0717… (exclusivo deste arquivo). Sem PII: e-mails @invariant.test.
 * As linhas entram com os gatilhos desligados (`session_replication_role`)
 * para que `closed_at`/`value_cents` fiquem nos valores LITERAIS da semeadura.
 */

const ORG = "d0717000-0000-4000-8000-000000000001";
const ORG_2 = "d0717000-0000-4000-8000-000000000002";
const MANAGER = "d0717000-1111-4000-8000-000000000001";
const AGENT_A = "d0717000-1111-4000-8000-000000000002";
const AGENT_B = "d0717000-1111-4000-8000-000000000003";
const MANAGER_2 = "d0717000-1111-4000-8000-000000000004";
const P = "d0717000-2222-4000-8000-000000000001";
const P_2 = "d0717000-2222-4000-8000-000000000002";
const S1 = "d0717000-3333-4000-8000-000000000001";
const S2 = "d0717000-3333-4000-8000-000000000002";
const S3 = "d0717000-3333-4000-8000-000000000003";
const SW = "d0717000-3333-4000-8000-000000000004";
const SL = "d0717000-3333-4000-8000-000000000005";
const S_ORG2 = "d0717000-3333-4000-8000-000000000006";
const L = (n: number) => `d0717000-4444-4000-8000-00000000000${n}`;

const FROM = "2026-07-01T00:00:00+00";
const TO = "2026-08-01T00:00:00+00";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${MANAGER}', 'd0717-manager@invariant.test'),
      ('${AGENT_A}', 'd0717-agent-a@invariant.test'),
      ('${AGENT_B}', 'd0717-agent-b@invariant.test'),
      ('${MANAGER_2}', 'd0717-manager-2@invariant.test')
    on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG}', 'd0717-vendas', 'D0717 Vendas', 'D0717', jsonb_build_object('visibility_mode', 'own')),
      ('${ORG_2}', 'd0717-vendas-2', 'D0717 Vendas 2', 'D0717 2', '{}'::jsonb)
    on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MANAGER}', '${ORG}', 'manager', now()),
      ('${AGENT_A}', '${ORG}', 'agent', now()),
      ('${AGENT_B}', '${ORG}', 'agent', now()),
      ('${MANAGER_2}', '${ORG_2}', 'manager', now())
    on conflict do nothing;

    insert into public.crm_pipelines (id, organization_id, name, slug) values
      ('${P}', '${ORG}', 'D0717 Funil', 'd0717-funil'),
      ('${P_2}', '${ORG_2}', 'D0717 Funil 2', 'd0717-funil-2')
    on conflict do nothing;

    insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position, is_won, is_lost) values
      ('${S1}', '${ORG}', '${P}', 'Novo', 'd0717-novo', 1000, false, false),
      ('${S2}', '${ORG}', '${P}', 'Proposta', 'd0717-proposta', 2000, false, false),
      ('${S3}', '${ORG}', '${P}', 'Negociação', 'd0717-negociacao', 3000, false, false),
      ('${SW}', '${ORG}', '${P}', 'Ganho', 'd0717-ganho', 4000, true, false),
      ('${SL}', '${ORG}', '${P}', 'Perdido', 'd0717-perdido', 5000, false, true),
      ('${S_ORG2}', '${ORG_2}', '${P_2}', 'Ganho', 'd0717-ganho-2', 1000, true, false)
    on conflict do nothing;

    set session_replication_role = replica;
    insert into public.crm_leads
      (id, organization_id, pipeline_id, stage_id, title, status, value_cents, currency,
       owner_kind, owner_user_id, created_at, closed_at, stage_changed_at, lost_reason, lost_from_stage_id) values
      -- ganhos na janela: ciclos de 10 e 20 dias ⇒ mediana 15
      ('${L(1)}', '${ORG}', '${P}', '${SW}', 'L1', 'won', 10000, 'BRL', 'user', '${AGENT_A}', '2026-07-05T12:00:00+00', '2026-07-15T12:00:00+00', null, null, null),
      ('${L(2)}', '${ORG}', '${P}', '${SW}', 'L2', 'won', 30000, 'BRL', 'user', '${AGENT_B}', '2026-07-06T12:00:00+00', '2026-07-26T12:00:00+00', null, null, null),
      -- perdido saindo da Proposta
      ('${L(3)}', '${ORG}', '${P}', '${SL}', 'L3', 'lost', 5000, 'BRL', 'user', '${AGENT_A}', '2026-07-07T12:00:00+00', '2026-07-20T12:00:00+00', null, 'Preço', '${S2}'),
      -- abertos
      ('${L(4)}', '${ORG}', '${P}', '${S3}', 'L4', 'open', 7000, 'BRL', 'user', '${AGENT_A}', '2026-07-08T12:00:00+00', null, '2026-07-09T12:00:00+00', null, null),
      ('${L(5)}', '${ORG}', '${P}', '${S1}', 'L5', 'open', 2000, 'BRL', 'user', '${AGENT_B}', '2026-07-09T00:00:00+00', null, null, null, null),
      -- ganho na janela ANTERIOR (10 dias)
      ('${L(6)}', '${ORG}', '${P}', '${SW}', 'L6', 'won', 40000, 'BRL', 'user', '${AGENT_A}', '2026-06-10T12:00:00+00', '2026-06-20T12:00:00+00', null, null, null),
      -- transferência entre funis: não é perda, não entra em nada
      ('${L(7)}', '${ORG}', '${P}', '${SL}', 'L7', 'lost', 99900, 'BRL', 'user', '${AGENT_A}', '2026-07-10T12:00:00+00', '2026-07-11T12:00:00+00', null, 'moved_to_another_pipeline', '${S1}'),
      -- outra moeda: não soma com BRL
      ('${L(8)}', '${ORG}', '${P}', '${S2}', 'L8', 'open', 9900, 'USD', 'user', '${AGENT_B}', '2026-07-11T12:00:00+00', null, '2026-07-11T12:00:00+00', null, null),
      -- outra organização
      ('${L(9)}', '${ORG_2}', '${P_2}', '${S_ORG2}', 'L9', 'won', 12300, 'BRL', 'user', '${MANAGER_2}', '2026-07-05T12:00:00+00', '2026-07-15T12:00:00+00', null, null, null)
    on conflict do nothing;

    update public.crm_leads set source = 'd0717-site' where id = '${L(2)}';

    insert into public.crm_lead_products (organization_id, lead_id, nome, quantidade, preco_unitario_cents, desconto_cents)
      select '${ORG}', '${L(1)}', 'Consulta', 2, 5000, 0
      where not exists (select 1 from public.crm_lead_products where lead_id = '${L(1)}');
    set session_replication_role = origin;
  `);
});

function asRole(actorId: string): string {
  return `set role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${actorId}"}', false); end $c$;`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Painel = any;

function painel(actorId: string, org: string, pipeline: string, owner?: string): Painel {
  const p_owner = owner ? `'${owner}'::uuid` : "null";
  const out = sql(`
    ${asRole(actorId)}
    select 'ROW:' || public.fn_dashboard_vendas('${org}', '${pipeline}', '${FROM}', '${TO}', ${p_owner}, null)::text;
  `);
  return JSON.parse(out.split("\n").pop()!.replace(/^ROW:/, ""));
}

describe("fn_dashboard_vendas — a conta de um funil, no banco real", () => {
  it("período: 2 ganhos, 1 perdido, mediana de 15 dias; a transferência não conta", () => {
    const d = painel(MANAGER, ORG, P);
    expect(d.periodo.atual.ganhos).toBe(2);
    expect(d.periodo.atual.perdidos).toBe(1);
    expect(d.periodo.atual.ciclo_mediana_dias).toBe(15);
    expect(d.periodo.atual.ganhos_por_moeda).toEqual([
      { moeda: "BRL", quantidade: 2, valor_cents: 40000 },
    ]);
    expect(d.periodo.anterior.ganhos).toBe(1);
    expect(d.periodo.anterior.ciclo_mediana_dias).toBe(10);
  });

  it("carteira aberta agora: moeda não mistura", () => {
    expect(painel(MANAGER, ORG, P).carteira).toEqual([
      { moeda: "BRL", quantidade: 2, valor_cents: 9000 },
      { moeda: "USD", quantidade: 1, valor_cents: 9900 },
    ]);
  });

  it("fluxo: chegada posicional; ganho alcança todas, perdido até a etapa de onde saiu", () => {
    const fluxo = painel(MANAGER, ORG, P).fluxo as Array<{ nome: string; chegaram: number; ganho: boolean }>;
    expect(fluxo.map((e) => [e.nome, e.chegaram, e.ganho])).toEqual([
      ["Novo", 6, false],
      ["Proposta", 5, false],
      ["Negociação", 3, false],
      ["Ganho", 2, true],
    ]);
  });

  it("ranking, produtos, perdas e parados", () => {
    const d = painel(MANAGER, ORG, P);
    expect(d.ranking.map((r: Painel) => [r.tipo, r.user_id, r.ganhos, r.valor_cents])).toEqual([
      ["pessoa", AGENT_B, 1, 30000],
      ["pessoa", AGENT_A, 1, 10000],
    ]);
    expect(d.produtos).toEqual([
      { product_id: null, nome: "Consulta", moeda: "BRL", quantidade: 2, receita_cents: 10000, negocios: 1 },
    ]);
    expect(d.perdas).toEqual([{ motivo: "Preço", quantidade: 1 }]);
    expect(d.parados.map((p: Painel) => p.titulo)).toEqual(["L5", "L4", "L8"]);
  });

  it("evolução mensal no fuso da organização inclui o mês da janela anterior", () => {
    const mensal = painel(MANAGER, ORG, P).mensal as Array<{ mes: string; status: string; moeda: string; quantidade: number }>;
    expect(mensal).toContainEqual(expect.objectContaining({ mes: "2026-06", status: "won", moeda: "BRL", quantidade: 1 }));
    expect(mensal.some((m) => m.status === "lost" && m.quantidade > 1)).toBe(false);
  });

  it("agent no modo 'só os seus' vê só os próprios negócios (a RLS escopa)", () => {
    const d = painel(AGENT_A, ORG, P);
    expect(d.periodo.atual.ganhos).toBe(1);
    expect(d.carteira).toEqual([{ moeda: "BRL", quantidade: 1, valor_cents: 7000 }]);
  });

  it("origens listam o funil inteiro, e p_source recorta", () => {
    expect(painel(MANAGER, ORG, P).origens).toContain("d0717-site");
    const out = sql(`
      ${asRole(MANAGER)}
      select 'ROW:' || public.fn_dashboard_vendas('${ORG}', '${P}', '${FROM}', '${TO}', null, 'd0717-site')::text;
    `);
    const d = JSON.parse(out.split("\n").pop()!.replace(/^ROW:/, ""));
    expect(d.periodo.atual.ganhos_por_moeda).toEqual([{ moeda: "BRL", quantidade: 1, valor_cents: 30000 }]);
    expect(d.origens).toContain("d0717-site");
  });

  it("p_owner recorta pelo dono", () => {
    const d = painel(MANAGER, ORG, P, AGENT_B);
    expect(d.periodo.atual.ganhos_por_moeda).toEqual([{ moeda: "BRL", quantidade: 1, valor_cents: 30000 }]);
  });

  it("p_org de OUTRA organização não devolve nada — nos dois sentidos", () => {
    const vazio = painel(MANAGER_2, ORG, P);
    expect(vazio.carteira).toEqual([]);
    expect(vazio.periodo.atual.ganhos).toBe(0);
    expect(vazio.fluxo).toEqual([]);
    expect(painel(MANAGER, ORG_2, P_2).periodo.atual.ganhos).toBe(0);
    // controle: a organização 2 tem dado, e o dono dela o vê
    expect(painel(MANAGER_2, ORG_2, P_2).periodo.atual.ganhos).toBe(1);
  });

  it("anon NÃO executa a função; authenticated executa", () => {
    const out = sql(`
      select has_function_privilege('anon', 'public.fn_dashboard_vendas(uuid,uuid,timestamptz,timestamptz,uuid,text)', 'execute')
        || '|' ||
        has_function_privilege('authenticated', 'public.fn_dashboard_vendas(uuid,uuid,timestamptz,timestamptz,uuid,text)', 'execute');
    `);
    expect(out.split("\n").pop()).toBe("false|true");
  });
});
