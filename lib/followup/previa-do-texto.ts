/**
 * PRÉVIA do texto de uma mensagem no editor (Fase 4): como a frase sairia com uma AMOSTRA EXPLÍCITA. Pura, sem banco e
 * sem dado de cliente — a amostra é fixa e a tela a rotula «exemplo simulado». Não é o valor de nenhuma execução.
 *
 * A régua é a do envio de verdade: variável sem valor some da frase junto com o espaço vizinho (nunca sai `{{...}}` cru
 * nem string vazia calada), e a prévia diz QUAIS variáveis ficariam sem valor com esta amostra.
 */
import type { FlowGraph } from "./graph-schema";
import { ancestrais, CAMPOS_DE_SAIDA, resolverReferencias } from "./variaveis-de-blocos";

const CONTATO_DE_EXEMPLO: Record<string, string> = {
  nome: "Maria Souza",
  primeiro_nome: "Maria",
  telefone: "+55 11 99999-0000",
  email: "maria@exemplo.com",
  "lead.title": "Negócio de exemplo",
  volta: "1",
  voltas: "3",
};

/** Valor de exemplo por campo de saída; o que não está aqui vira texto genérico. */
function valorDeExemplo(caminho: string): unknown {
  if (caminho === "branch_id") return "sim";
  if (caminho.endsWith("tags")) return ["etiqueta-de-exemplo"];
  return `${caminho}-de-exemplo`;
}

export interface PreviaDoTexto {
  texto: string;
  /** Variáveis que ficariam sem valor com a amostra (marca inteira, como escrita). */
  sem_valor: string[];
}

export function previaDoTexto(
  texto: string,
  grafo: Pick<FlowGraph, "nodes" | "edges"> | null,
  noId: string | null,
): PreviaDoTexto {
  // 1) saídas de exemplo só dos blocos que podem vir ANTES do aberto
  const saidas: Record<string, unknown> = {};
  if (grafo && noId) {
    const anteriores = ancestrais(grafo, noId);
    for (const no of grafo.nodes) {
      if (!anteriores.has(no.id)) continue;
      const campos = CAMPOS_DE_SAIDA[no.type];
      if (campos) saidas[no.id] = Object.fromEntries(campos.map((c) => [c.caminho, valorDeExemplo(c.caminho)]));
    }
  }
  const blocos = resolverReferencias(texto, saidas);
  const semValor = blocos.sem_valor.map((r) => r.marca);

  // 2) variáveis do contato e da volta, com a mesma regra de «some junto com o espaço»
  let saida = "";
  let cursor = 0;
  let alguma = false;
  for (const m of blocos.texto.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const inicio = m.index ?? cursor;
    saida += blocos.texto.slice(cursor, inicio);
    const valor = Object.prototype.hasOwnProperty.call(CONTATO_DE_EXEMPLO, m[1]!) ? CONTATO_DE_EXEMPLO[m[1]!]! : null;
    if (valor === null) {
      saida = saida.replace(/\s+$/, "");
      alguma = true;
      semValor.push(m[0]);
    } else saida += valor;
    cursor = inicio + m[0].length;
  }
  saida += blocos.texto.slice(cursor);
  return { texto: alguma ? saida.replace(/^\s+/, "") : saida, sem_valor: semValor };
}
