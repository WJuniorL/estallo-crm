import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ia = vi.hoisted(() => ({ chamada: vi.fn() }));
vi.mock(import("@/lib/followup/extrair-dados"), async (original) => ({
  ...(await original()),
  extrairDadosComIa: ia.chamada,
}));

import { avancarEnrollmentAtivo } from "@/lib/followup/engine";
import { createPgAdminClient } from "@/lib/followup/turn-bridge";

import { criarOrigemDeFollowup } from "./followup-service-origin";
import { GOV_ORG, seedGov } from "./gov-helpers";

/**
 * Extrair dados por IA (Fase 5), motor novo e Postgres real. A chamada de modelo é trocada por uma falsa (o que se
 * prova é o diário): o texto congelado é o que vai para a IA, só os campos configurados viram saída, e sem texto a ler
 * o bloco falha explicado SEM gastar uma chamada.
 */
if (!process.env.TEST_DB_CONTAINER) throw new Error("Rode com pnpm test:db");
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT ?? 54329)}/postgres`,
  max: 4,
});
const adapter = createPgAdminClient(pool);
beforeAll(() => seedGov());
afterAll(() => pool.end());
beforeEach(() => ia.chamada.mockReset());

const deps = {
  db: adapter,
  clock: () => new Date(),
  enqueueJob: async () => {
    throw new Error("extract_must_not_enqueue");
  },
};
const no = (id: string, type: string, config: object) => ({ id, type, label: id, position: { x: 0, y: 0 }, config });

async function rodar(fonte: string, mensagem: string | null) {
  const contact = randomUUID(),
    version = randomUUID(),
    flow = randomUUID(),
    run = randomUUID();
  await pool.query("insert into contacts(id,organization_id,name,display_name) values($1,$2,'Ana','Ana')", [contact, GOV_ORG]);
  const origin = await criarOrigemDeFollowup(pool, GOV_ORG, contact);
  if (mensagem)
    await pool.query(
      `insert into messages(organization_id,conversation_id,channel_session_id,contact_id,direction,type,status,body)
       select $1,c.id,c.channel_session_id,$3,'inbound','text','delivered',$4 from conversations c where c.id=$2`,
      [GOV_ORG, origin.conversation_id, contact, mensagem],
    );
  const g = {
    execution_contract: 1,
    nodes: [
      no("ex", "ai_extract", { fonte, fields: [{ name: "cidade", type: "text", descricao: "onde mora" }], dica: "" }),
      no("fim", "end", { outcome: "converted" }),
    ],
    edges: [{ id: "e1", source: "ex", target: "fim", condition: { type: "always" } }],
  };
  await pool.query("insert into followup_flow_versions(id,organization_id,graph) values($1,$2,$3)", [version, GOV_ORG, g]);
  await pool.query("insert into followup_flow_pointers(id,organization_id,name,status,active_version_id) values($1,$2,$4,'active',$3)", [flow, GOV_ORG, version, `Extrair ${run}`]);
  await pool.query(
    `insert into followup_enrollments
     (id,organization_id,pointer_id,version_id,contact_id,conversation_id,service_boundary,current_node_id,status,next_eval_at,claimed_until)
     values($1,$2,$3,$4,$5,$6,$7,'ex','active',now()-interval '1 second',now()+interval '2 minutes')`,
    [run, GOV_ORG, flow, version, contact, origin.conversation_id, origin],
  );
  await avancarEnrollmentAtivo(deps, (await adapter.loadEnrollmentById(GOV_ORG, run))!);
  const passo = (
    await pool.query(
      `select s.status, a.output_snapshot, a.error_snapshot from followup_execution_steps s join followup_execution_attempts a on a.step_id=s.id
        where s.organization_id=$1 and s.enrollment_id=$2 and s.node_id='ex' order by a.attempt_no desc limit 1`,
      [GOV_ORG, run],
    )
  ).rows[0];
  const e = (await pool.query("select current_node_id from followup_enrollments where id=$1", [run])).rows[0];
  return { passo, e };
}

describe("extrair dados por IA (motor novo, Postgres real)", () => {
  it("lê a última mensagem do cliente, grava só os campos configurados e avança", async () => {
    ia.chamada.mockResolvedValue({ cidade: "Recife", intrusa: "x" });
    const { passo, e } = await rodar("", "Moro em Recife, quero agendar");
    expect(ia.chamada.mock.calls[0]![3]).toMatchObject({ texto: "Moro em Recife, quero agendar" });
    expect(passo.status).toBe("succeeded");
    expect(passo.output_snapshot).toEqual({ fields: { cidade: "Recife" } });
    expect(e.current_node_id).toBe("fim");
  });

  it("sem texto a ler, falha explicado e NÃO chama a IA", async () => {
    const { passo } = await rodar("", null);
    expect(ia.chamada).not.toHaveBeenCalled();
    expect(passo.error_snapshot?.message).toContain("mensagem de texto");
  });
});
