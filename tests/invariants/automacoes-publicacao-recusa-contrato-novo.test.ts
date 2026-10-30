import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

// Migration 0707: a função que cria versão publicada recusa, no banco, grafo com a chave
// `execution_contract` enquanto o contrato novo não está habilitado (defesa em profundidade: o
// validador da rota já recusa, mas esta função é a única porta que cria versão publicada).
const publicar = (pointer: string, graph: unknown) =>
  `select fn_publish_followup_flow_version('${GOV_ORG}'::uuid, '${pointer}'::uuid, '${JSON.stringify(graph)}'::jsonb, null)`;

async function ponteiro(): Promise<string> {
  const id = randomUUID();
  sql(
    `insert into public.followup_flow_pointers (id, organization_id, name, status) values ('${id}', '${GOV_ORG}', 'Publicação ${id}', 'draft')`,
  );
  return id;
}

const versoes = (pointer: string) =>
  Number(
    lastLine(
      sql(`select count(*) from public.followup_flow_versions where pointer_id = '${pointer}'`),
    ),
  );

beforeAll(() => {
  seedGov();
});

describe("publicar fluxo: a função recusa o contrato de execução novo", () => {
  it("controle positivo: grafo legado (sem a chave) publica e vira a versão ativa", async () => {
    const pointer = await ponteiro();
    const novo = lastLine(sql(publicar(pointer, { nodes: [], edges: [] })));
    expect(novo).toMatch(/^[0-9a-f-]{36}$/);
    expect(versoes(pointer)).toBe(1);
    expect(
      lastLine(
        sql(`select active_version_id from public.followup_flow_pointers where id = '${pointer}'`),
      ),
    ).toBe(novo);
  });

  it.each([1, 0, null, "1", false])(
    "grafo com execution_contract=%j é recusado e NADA é gravado",
    async (valor) => {
      const pointer = await ponteiro();
      expect(() =>
        sql(publicar(pointer, { nodes: [], edges: [], execution_contract: valor })),
      ).toThrow(/execution_contract_unavailable/);
      expect(versoes(pointer)).toBe(0);
      expect(
        lastLine(
          sql(
            `select active_version_id is null from public.followup_flow_pointers where id = '${pointer}'`,
          ),
        ),
      ).toBe("t");
    },
  );

  it("só a chave do TOPO do grafo conta: execution_contract aninhado num nó não é o marcador e publica", async () => {
    const pointer = await ponteiro();
    const grafo = {
      nodes: [{ id: "n", type: "end", config: { execution_contract: 1 } }],
      edges: [],
    };
    expect(lastLine(sql(publicar(pointer, grafo)))).toMatch(/^[0-9a-f-]{36}$/);
    expect(versoes(pointer)).toBe(1);
  });

  it("a guarda vem ANTES de achar o ponteiro: ponteiro inexistente continua dando pointer_not_found", () => {
    expect(() => sql(publicar(randomUUID(), { nodes: [] }))).toThrow(/pointer_not_found/);
  });

  it("os privilégios foram preservados: só service_role executa (anon e authenticated, não)", () => {
    const pode = (role: string) =>
      lastLine(
        sql(
          `select has_function_privilege('${role}', 'public.fn_publish_followup_flow_version(uuid,uuid,jsonb,uuid)', 'execute')`,
        ),
      );
    expect(pode("service_role")).toBe("t");
    expect(pode("anon")).toBe("f");
    expect(pode("authenticated")).toBe("f");
  });
});
