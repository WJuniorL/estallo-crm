import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";
import { assinar, chaveDeCobranca, comoServidor, criarOrg, criarPlano, criarUsuarios, erroDe, numero, uuid, valor, vincular } from "./cobranca-helpers";

/**
 * OS LIMITES DO CRM NO PLANO (migration 0718): pipelines, etapas por pipeline,
 * leads, automações e webhooks. Mesmo molde dos assentos e canais: PT402 com a
 * mensagem `limite_do_plano:<recurso>:<teto>`, só conta quem PASSA a ocupar
 * vaga, cobrança desligada ou plano sem teto não confere nada. E a API REST:
 * `fn_plano_libera_api` responde pelo plano da assinatura.
 *
 * Os tetos são relativos ao que a org já tem (a criação da org pode semear um
 * funil padrão): o caso conta antes e põe o teto em "cabe exatamente mais um".
 */

const P = "c0b00716-0000-4000-8000";
const ORG = uuid(P, 1);
const ORG_SEM_TETO = uuid(P, 2);
const DONO = uuid(P, 11);
const PLANO = uuid(P, 101);
const PLANO_SEM_TETO = uuid(P, 102);
const FUNIL = uuid(P, 201);
const ETAPA = uuid(P, 301);

const contar = (consulta: string) => numero(consulta);
const teto = (coluna: string, n: number | null) =>
  sql(`update public.cobranca_planos set ${coluna} = ${n === null ? "null" : n} where id = '${PLANO}';`);

const funil = (id: string, org = ORG) =>
  `insert into public.crm_pipelines (id, organization_id, name, slug) values ('${id}', '${org}', 'f-${id.slice(-6)}', 'f-${id.slice(-6)}')`;
const etapa = (id: string, pipeline = FUNIL, org = ORG) =>
  `insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position)
     values ('${id}', '${org}', '${pipeline}', 'e-${id.slice(-6)}', 'e-${id.slice(-6)}', ${Number(id.slice(-4))})`;
const lead = (n: number, org = ORG) =>
  `insert into public.crm_leads (organization_id, pipeline_id, stage_id, title, owner_user_id)
     values ('${org}', '${FUNIL}', '${ETAPA}', 'lead ${n}', '${DONO}')`;
const automacao = (id: string, surface = "crm_automation") =>
  `insert into public.followup_flow_pointers (id, organization_id, name, status, surface) values ('${id}', '${ORG}', 'a-${id.slice(-6)}', 'draft', '${surface}')`;
const webhook = (id: string) =>
  `insert into public.webhook_sources (id, organization_id, name, path_token, default_pipeline_id, default_stage_id)
     values ('${id}', '${ORG}', 'w-${id.slice(-6)}', 'tok-${id}', '${FUNIL}', '${ETAPA}')`;

beforeAll(() => {
  criarUsuarios([[DONO, "dono-0716@invariant.test"]]);
  criarOrg(ORG, "cob-crm-1");
  criarOrg(ORG_SEM_TETO, "cob-crm-2");
  vincular(DONO, ORG, "admin");
  criarPlano({ id: PLANO, nome: "Tetos do CRM" });
  criarPlano({ id: PLANO_SEM_TETO, nome: "Sem tetos do CRM" });
  chaveDeCobranca("ligado");
  sql(`${funil(FUNIL)} on conflict do nothing; ${etapa(ETAPA)} on conflict do nothing;`);
  assinar(ORG, PLANO);
  assinar(ORG_SEM_TETO, PLANO_SEM_TETO);
});

describe("0718 — limites do CRM", () => {
  it("⭐ pipelines: o que passa do teto é PT402 com a mensagem que o app lê; arquivar libera; desarquivar acima é recusado", () => {
    const agora = contar(`select count(*) from public.crm_pipelines where organization_id = '${ORG}' and not is_archived`);
    teto("max_pipelines", agora + 1);
    expect(erroDe(`${funil(uuid(P, 211))};`)).toBe("");
    const e = erroDe(`${funil(uuid(P, 212))};`);
    expect(e).toContain("PT402");
    expect(e).toContain(`limite_do_plano:pipelines:${agora + 1}`);
    sql(`update public.crm_pipelines set is_archived = true where id = '${uuid(P, 211)}';`);
    expect(erroDe(`${funil(uuid(P, 212))};`)).toBe("");
    expect(erroDe(`update public.crm_pipelines set is_archived = false where id = '${uuid(P, 211)}';`)).toContain("PT402");
    teto("max_pipelines", null);
  });

  it("⭐ etapas: o teto é POR pipeline — outro funil tem a sua cota", () => {
    const agora = contar(`select count(*) from public.crm_stages where pipeline_id = '${FUNIL}' and not is_archived`);
    teto("max_etapas_por_pipeline", agora + 1);
    expect(erroDe(`${etapa(uuid(P, 3011))};`)).toBe("");
    expect(erroDe(`${etapa(uuid(P, 3012))};`)).toContain(`limite_do_plano:etapas:${agora + 1}`);
    const outro = uuid(P, 221);
    sql(`${funil(outro)};`);
    expect(erroDe(`${etapa(uuid(P, 3013), outro)};`)).toBe("");
    teto("max_etapas_por_pipeline", null);
  });

  it("⭐ leads: a base cheia recusa o próximo, de qualquer status", () => {
    const agora = contar(`select count(*) from public.crm_leads where organization_id = '${ORG}'`);
    teto("max_leads", agora + 1);
    expect(erroDe(`${lead(1)};`)).toBe("");
    expect(erroDe(`${lead(2)};`)).toContain(`limite_do_plano:leads:${agora + 1}`);
    teto("max_leads", null);
  });

  it("⭐ automações: só conta o fluxo do CRM (surface crm_automation); follow-up não ocupa vaga", () => {
    const agora = contar(`select count(*) from public.followup_flow_pointers where organization_id = '${ORG}' and surface = 'crm_automation'`);
    teto("max_automacoes", agora + 1);
    expect(erroDe(`${automacao(uuid(P, 401))};`)).toBe("");
    expect(erroDe(`${automacao(uuid(P, 402))};`)).toContain(`limite_do_plano:automacoes:${agora + 1}`);
    expect(erroDe(`${automacao(uuid(P, 403), "followup")};`)).toBe("");
    teto("max_automacoes", null);
  });

  it("⭐ webhooks: o próximo acima do teto é recusado", () => {
    const agora = contar(`select count(*) from public.webhook_sources where organization_id = '${ORG}'`);
    teto("max_webhooks", agora + 1);
    expect(erroDe(`${webhook(uuid(P, 501))};`)).toBe("");
    expect(erroDe(`${webhook(uuid(P, 502))};`)).toContain(`limite_do_plano:webhooks:${agora + 1}`);
    teto("max_webhooks", null);
  });

  it("cobrança desligada: nenhum teto novo confere, mesmo com o plano cheio", () => {
    teto("max_webhooks", 1);
    chaveDeCobranca("desligado");
    try {
      expect(erroDe(`${webhook(uuid(P, 503))};`)).toBe("");
    } finally {
      chaveDeCobranca("ligado");
      teto("max_webhooks", null);
    }
  });

  it("⭐ API REST: o plano decide; cobrança desligada ou org isenta liberam", () => {
    const libera = (org: string) => valor(comoServidor(`select public.fn_plano_libera_api('${org}')::text`));
    sql(`update public.cobranca_planos set libera_api = false where id = '${PLANO}';`);
    expect(libera(ORG)).toBe("false");
    expect(libera(ORG_SEM_TETO)).toBe("true");
    expect(libera(uuid(P, 999))).toBe("true");
    chaveDeCobranca("desligado");
    expect(libera(ORG)).toBe("true");
    chaveDeCobranca("ligado");
    sql(`update public.cobranca_planos set libera_api = true where id = '${PLANO}';`);
  });

  it("o intervalo semestral é aceito; outro valor não", () => {
    expect(erroDe(`update public.cobranca_planos set intervalo = 'semestre' where id = '${PLANO_SEM_TETO}';`)).toBe("");
    expect(erroDe(`update public.cobranca_planos set intervalo = 'trimestre' where id = '${PLANO_SEM_TETO}';`)).toContain("23514");
    sql(`update public.cobranca_planos set intervalo = 'mes' where id = '${PLANO_SEM_TETO}';`);
  });

  it("nenhuma sessão executa fn_plano_libera_api; o servidor sim", () => {
    const chamada = `select public.fn_plano_libera_api('${ORG}')`;
    expect(erroDe(`set role authenticated; ${chamada};`)).toContain("permission denied for function");
    expect(erroDe(`set role anon; ${chamada};`)).toContain("permission denied for function");
    expect(erroDe(comoServidor(chamada))).toBe("");
  });
});
