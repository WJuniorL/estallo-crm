import { describe, expect, it } from "vitest";

import { flowGraphSchema } from "./graph-schema";
import { NODE_OUTPUT_CONTRACTS } from "./node-output-contracts";
import {
  ancestrais,
  CAMPOS_DE_SAIDA,
  extrairReferencias,
  resolverReferencias,
  textosDoBloco,
} from "./variaveis-de-blocos";
import { validateFlowForPublish } from "./validate-publish";

describe("extrairReferencias", () => {
  it("lê o id do bloco com hífen e o caminho; ignora o que não é {{nodes.…}}", () => {
    expect(extrairReferencias("Oi {{nome}}, {{ nodes.cond-produto.branch_id }} e {{nodes.t.lead_id}}")).toEqual([
      { marca: "{{ nodes.cond-produto.branch_id }}", no_id: "cond-produto", caminho: "branch_id" },
      { marca: "{{nodes.t.lead_id}}", no_id: "t", caminho: "lead_id" },
    ]);
  });
});

describe("resolverReferencias", () => {
  const saidas = { "cond-produto": { branch_id: "coleta_vca" }, tag: { tags: ["Cliente", "VIP"] }, tarefa: { task_id: 7 } };

  it("resolve texto, lista (separada por vírgula) e número", () => {
    const r = resolverReferencias("Caminho {{nodes.cond-produto.branch_id}}; etiquetas: {{nodes.tag.tags}}; {{nodes.tarefa.task_id}}", saidas);
    expect(r.texto).toBe("Caminho coleta_vca; etiquetas: Cliente, VIP; 7");
    expect(r.sem_valor).toEqual([]);
  });

  it("referência SEM valor some da frase com o espaço vizinho — nunca sai crua nem deixa espaço órfão", () => {
    const r = resolverReferencias("Seu código {{nodes.nao-rodou.codigo}} chegou", saidas);
    expect(r.texto).toBe("Seu código chegou");
    expect(r.sem_valor.map((x) => x.no_id)).toEqual(["nao-rodou"]);
    expect(resolverReferencias("{{nodes.x.y}} oi", {}).texto).toBe("oi");
  });

  it("objeto não vira texto, e chave do protótipo nunca é lida", () => {
    expect(resolverReferencias("a {{nodes.tag.constructor}} b", saidas).sem_valor).toHaveLength(1);
    expect(resolverReferencias("a {{nodes.__proto__.x}} b", saidas).sem_valor).toHaveLength(1);
    expect(resolverReferencias("a {{nodes.cond-produto}} b", saidas).texto).toBe("a {{nodes.cond-produto}} b"); // sem caminho: não é marca de bloco
  });
});

const no = (id: string, type: string, config: unknown) => ({ id, type, label: id, position: { x: 0, y: 0 }, config });
const aresta = (id: string, source: string, target: string, condition: unknown = { type: "always" }) => ({ id, source, target, priority: 0, condition });

describe("ancestrais e validação na publicação", () => {
  const base = (texto: string) =>
    flowGraphSchema.parse({
      nodes: [
        no("t", "trigger", {}),
        no("c", "condition", { combinator: "and", branching: "per_check", checks: [{ id: "a", field: "tag", op: "eq", value: "x" }] }),
        no("m1", "action", { mode: "text", body: texto }),
        no("m2", "action", { mode: "text", body: "outro ramo" }),
        no("f", "end", { outcome: "converted" }),
      ],
      edges: [
        aresta("e1", "t", "c"),
        aresta("e2", "c", "m1", { type: "branch", branch_id: "a" }),
        aresta("e3", "c", "m2"),
        aresta("e4", "m1", "f"),
        aresta("e5", "m2", "f"),
      ],
    });

  it("ancestrais: só o que leva até o bloco, nunca ele mesmo nem o ramo vizinho", () => {
    const g = base("x");
    expect([...ancestrais(g, "m1")].sort()).toEqual(["c", "t"]);
    expect(ancestrais(g, "m1").has("m2")).toBe(false);
  });

  it("referência a bloco anterior publica", () => {
    expect(validateFlowForPublish(base("Caminho {{nodes.c.branch_id}}"), {})).toEqual({ ok: true });
  });

  it("bloco que não existe é recusado com o nome da caixa e da variável", () => {
    const r = validateFlowForPublish(base("Oi {{nodes.fantasma.x}}"), {});
    expect(r).toMatchObject({ ok: false, errors: [{ code: "variavel_de_bloco_inexistente", node_id: "m1" }] });
  });

  it("bloco de OUTRO ramo (não anterior) é recusado", () => {
    const r = validateFlowForPublish(base("Oi {{nodes.m2.x}}"), {});
    expect(r).toMatchObject({ ok: false, errors: [{ code: "variavel_de_bloco_nao_anterior", node_id: "m1" }] });
  });

  it("campo que o tipo do bloco não produz é recusado, listando os que existem", () => {
    const r = validateFlowForPublish(base("Tarefa {{nodes.c.task_id}}"), {});
    expect(r).toMatchObject({ ok: false, errors: [{ code: "variavel_de_bloco_campo_inexistente", node_id: "m1" }] });
    const msg = (r as { errors: Array<{ message: string }> }).errors[0]!.message;
    expect(msg).toContain('"task_id"');
    expect(msg).toContain("branch_id"); // diz o que PODE ser citado
  });

  it("campo declarado, com caminho dentro dele, continua publicando", () => {
    expect(validateFlowForPublish(base("Item {{nodes.c.checks.0.matched}}"), {})).toEqual({ ok: true });
  });

  it("textosDoBloco cobre texto fixo, textos e legendas do bloco de mensagens", () => {
    const g = flowGraphSchema.parse({
      nodes: [
        no("t", "trigger", {}),
        no("m", "action", { mode: "messages", items: [{ kind: "text", body: "um" }, { kind: "image", path: "o/flow-assets/u/a.png", mime: "image/png", filename: "a.png", size_bytes: 10, caption: "legenda" }] }),
        no("f", "end", { outcome: "converted" }),
      ],
      edges: [aresta("e1", "t", "m"), aresta("e2", "m", "f")],
    });
    expect(textosDoBloco(g.nodes[1]!)).toEqual(["um", "legenda"]);
  });
});

describe("campos de saída oferecidos", () => {
  it("cada caminho do seletor existe no contrato de saída do bloco (o seletor não promete o que o motor não grava)", () => {
    const exemplos: Record<string, unknown> = {
      trigger: { contact_id: "00000000-0000-4000-8000-000000000001", lead_id: "00000000-0000-4000-8000-000000000002", conversation_id: null },
    };
    for (const [tipo, campos] of Object.entries(CAMPOS_DE_SAIDA)) {
      const contrato = NODE_OUTPUT_CONTRACTS[tipo as keyof typeof NODE_OUTPUT_CONTRACTS];
      expect(contrato, `sem contrato para ${tipo}`).toBeTruthy();
      const shape = (contrato as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      for (const c of campos ?? []) expect(Object.keys(shape), `${tipo}.${c.caminho}`).toContain(c.caminho);
    }
    expect(exemplos).toBeTruthy();
  });
});

describe("o motor entrega as saídas dos blocos ao texto (comSaidasDosBlocos)", () => {
  const inscricao = (contrato: number) => ({ id: "enr", organization_id: "org", execution_contract: contrato }) as never;
  const db = (saidas: Record<string, unknown>) => ({ loadStepOutputs: async () => saidas }) as never;

  it("contrato 1: o contexto ganha `nodes`, e o texto resolve com ele", async () => {
    const { comSaidasDosBlocos } = await import("./engine");
    const ctx = await comSaidasDosBlocos(db({ c: { branch_id: "micro" } }), inscricao(1), { contact: { name: "Ana" } });
    expect(ctx).toMatchObject({ contact: { name: "Ana" }, nodes: { c: { branch_id: "micro" } } });
    expect(resolverReferencias("Caminho {{nodes.c.branch_id}}", ctx!.nodes as Record<string, unknown>).texto).toBe("Caminho micro");
  });

  it("contrato 0 (sem diário) ou sem leitor: o contexto fica como estava, sem `nodes`", async () => {
    const { comSaidasDosBlocos } = await import("./engine");
    expect(await comSaidasDosBlocos(db({ c: { x: 1 } }), inscricao(0), { contact: {} })).toEqual({ contact: {} });
    expect(await comSaidasDosBlocos({} as never, inscricao(1), null)).toBeNull();
  });
});
