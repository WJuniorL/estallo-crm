import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, seedGov } from "./gov-helpers";

/**
 * Fase 8 — escala da aba Execuções: 10 mil execuções de UM fluxo (mais ruído de outros fluxos da mesma organização)
 * e um passo com 200 tentativas. Mede, no Postgres real, as consultas que a tela faz — a página da lista (a mesma
 * ordem e o mesmo cursor de `app/api/v1/ai/followups/queue`) e o diário de uma execução — e conta o que elas tocam.
 * O teto de tempo é folgado de propósito (CI compartilhado); o que não pode é a página crescer com o total.
 */
if (!process.env.TEST_DB_CONTAINER) throw new Error("Rode com pnpm test:db");
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT ?? 54329)}/postgres`,
  max: 2,
});

const FLUXO = randomUUID();
const OUTRO = randomUUID();
const VERSAO = randomUUID();
let execucaoComMuitasTentativas = "";
const medicoes: Array<{ consulta: string; ms: number; linhas: number; plano: string }> = [];

async function medir(sql: string, params: unknown[]): Promise<{ ms: number; linhas: number; plano: string }> {
  const { rows } = await pool.query<{ "QUERY PLAN": Array<{ "Execution Time": number; Plan: { "Actual Rows": number } }> }>(
    `explain (analyze, format json) ${sql}`,
    params,
  );
  const r = rows[0]!["QUERY PLAN"][0]!;
  const texto = (await pool.query(`explain ${sql}`, params)).rows.map((x) => x["QUERY PLAN"]).join("\n");
  return { ms: r["Execution Time"], linhas: r.Plan["Actual Rows"], plano: texto };
}

beforeAll(async () => {
  seedGov();
  const g = { execution_contract: 1, nodes: [], edges: [] };
  await pool.query("insert into followup_flow_versions(id,organization_id,graph) values($1,$2,$3)", [VERSAO, GOV_ORG, g]);
  for (const [id, nome] of [
    [FLUXO, "Escala 10k"],
    [OUTRO, "Escala ruído"],
  ])
    await pool.query("insert into followup_flow_pointers(id,organization_id,name,status,active_version_id) values($1,$2,$3,'active',$4)", [id, GOV_ORG, `${nome} ${id}`, VERSAO]);
  // 10 mil contatos e uma execução encerrada de cada um no fluxo medido; mais 5 mil no outro fluxo (ruído).
  await pool.query(
    `with c as (
       insert into contacts(id,organization_id,name) select gen_random_uuid(),$1,'Escala '||g from generate_series(1,15000) g returning id
     ), n as (select id, row_number() over () as k from c)
     insert into followup_enrollments(organization_id,pointer_id,version_id,contact_id,current_node_id,status,next_eval_at,started_at,completed_at)
     select $1, case when k<=10000 then $2::uuid else $3::uuid end, $4, id, 'fim',
            case when k % 10 = 0 then 'dead' else 'completed' end,
            null, now() - (k||' minutes')::interval, now() - (k||' minutes')::interval
     from n`,
    [GOV_ORG, FLUXO, OUTRO, VERSAO],
  );
  execucaoComMuitasTentativas = (
    await pool.query<{ id: string }>("select id from followup_enrollments where pointer_id=$1 limit 1", [FLUXO])
  ).rows[0]!.id;
  const passo = randomUUID();
  await pool.query(
    "insert into followup_execution_steps(id,organization_id,enrollment_id,node_id,visit,status,completed_at) values($1,$2,$3,'http',1,'failed',now())",
    [passo, GOV_ORG, execucaoComMuitasTentativas],
  );
  await pool.query(
    `insert into followup_execution_attempts(organization_id,step_id,attempt_no,status,input_snapshot,error_snapshot,completed_at)
     select $1,$2,g,'failed',jsonb_build_object('n',g),jsonb_build_object('code','x','message','y','category','transient','retryable',true),now()
     from generate_series(1,200) g`,
    [GOV_ORG, passo],
  );
  await pool.query("analyze followup_enrollments; analyze followup_execution_steps; analyze followup_execution_attempts");
}, 300_000);
afterAll(async () => {
  // Evidência versionada da Fase 8: tempos e planos medidos nesta rodada (o arquivo é reescrito a cada uma).
  const pasta = path.join(process.cwd(), "evidence", "automacoes-fase8");
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(
    path.join(pasta, "escala-10k-execucoes.json"),
    JSON.stringify({ medido_em: new Date().toISOString(), execucoes_no_fluxo: 10000, execucoes_de_ruido: 5000, medicoes }, null, 2) + "\n",
  );
  await pool.end();
});

describe("escala da aba Execuções (10 mil execuções num fluxo)", () => {
  const LISTA = `select id, status, next_eval_at, started_at from followup_enrollments
    where organization_id=$1 and pointer_id=$2 order by next_eval_at asc nulls last, id asc limit 51`;

  it("a primeira página devolve 51 linhas, sem trazer as 10 mil", async () => {
    const r = await medir(LISTA, [GOV_ORG, FLUXO]);
    medicoes.push({ consulta: "lista, página 1", ...r });
    expect(r.linhas).toBe(51);
    // Migration 0717: a página sai do índice, já na ordem — nunca varredura + ordenação da organização inteira.
    expect(r.plano).toContain("idx_followup_enrollments_lista_do_fluxo");
    expect(r.plano).not.toMatch(/^\s*->\s*Sort/m);
    expect(r.ms).toBeLessThan(500);
  });

  it("uma página no meio (cursor) custa o mesmo que a primeira", async () => {
    const meio = (await pool.query<{ id: string }>(`select id from followup_enrollments where organization_id=$1 and pointer_id=$2 order by id offset 5000 limit 1`, [GOV_ORG, FLUXO])).rows[0]!.id;
    const r = await medir(
      `select id, status, next_eval_at from followup_enrollments
        where organization_id=$1 and pointer_id=$2 and next_eval_at is null and id > $3 order by id asc limit 51`,
      [GOV_ORG, FLUXO, meio],
    );
    medicoes.push({ consulta: "lista, página no meio pelo cursor", ...r });
    expect(r.linhas).toBe(51);
    expect(r.ms).toBeLessThan(500);
  });

  it("o diário de uma execução com 200 tentativas num passo responde sem ler as outras execuções", async () => {
    const r = await medir(
      `select s.node_id, s.visit, s.status, a.attempt_no, a.status as tentativa
         from followup_execution_steps s join followup_execution_attempts a on a.organization_id=s.organization_id and a.step_id=s.id
        where s.organization_id=$1 and s.enrollment_id=$2 order by s.visit, a.attempt_no`,
      [GOV_ORG, execucaoComMuitasTentativas],
    );
    medicoes.push({ consulta: "diário de uma execução com 200 tentativas", ...r });
    expect(r.linhas).toBe(200);
    expect(r.ms).toBeLessThan(500);
  });
});
