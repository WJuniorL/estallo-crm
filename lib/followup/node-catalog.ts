import type { FollowupFlowSurface } from "./api-schemas";
import type { NodeType } from "./graph-schema";
import { NODE_OUTPUT_CONTRACTS } from "./node-output-contracts";
import { EXECUTION_CONTRACT_VERSION } from "./execution-contract";

/** Fonte compartilhada pela publicação e pelo construtor; não contém executores futuros. */
export const NODE_CATEGORIES = {
  triggers: "Gatilhos",
  messages: "Mensagens",
  leads: "Leads e funil",
  team: "Equipe e tarefas",
  flow: "Fluxo e tempo",
  ai: "Inteligência artificial",
  data: "Dados e perguntas",
} as const;

export type NodeCategory = keyof typeof NODE_CATEGORIES;
export type NodeEffect = "none" | "crm" | "message" | "agent";

interface NodeDefinition {
  label: string;
  description: string;
  category: NodeCategory;
  keywords: readonly string[];
  surfaces: readonly FollowupFlowSurface[];
  effect: NodeEffect;
}

const CLOCK_SURFACES = ["followup", "crm_automation"] as const;
const ALL_SURFACES = [...CLOCK_SURFACES, "atendimento"] as const;

const NODE_DEFINITIONS = {
  trigger: {
    label: "Gatilho",
    description: "Define como a execução começa.",
    category: "triggers",
    keywords: ["início", "evento", "disparo"],
    surfaces: ALL_SURFACES,
    effect: "none",
  },
  wait: {
    label: "Aguardar",
    description: "Aguarda um prazo fixo ou adaptativo.",
    category: "flow",
    keywords: ["espera", "tempo", "atraso", "cadência"],
    surfaces: CLOCK_SURFACES,
    effect: "none",
  },
  condition: {
    label: "Condição",
    description: "Escolhe um caminho conforme os dados do lead.",
    category: "flow",
    keywords: ["se", "if", "switch", "filtro", "regra"],
    surfaces: CLOCK_SURFACES,
    effect: "none",
  },
  ai_classify: {
    label: "Classificar (IA)",
    description: "Interpreta a resposta e escolhe uma classificação.",
    category: "ai",
    keywords: ["intenção", "resposta", "interesse"],
    surfaces: CLOCK_SURFACES,
    effect: "agent",
  },
  match_reply: {
    label: "Resposta (texto)",
    description: "Aguarda e compara a resposta com regras de texto.",
    category: "flow",
    keywords: ["aguardar mensagem", "respondeu", "texto"],
    surfaces: CLOCK_SURFACES,
    effect: "none",
  },
  repeat: {
    label: "Repetir",
    description: "Repete um caminho conforme a quantidade respondida.",
    category: "flow",
    keywords: ["volta", "loop", "repetição"],
    surfaces: CLOCK_SURFACES,
    effect: "none",
  },
  collect: {
    label: "Pergunta",
    description: "Coleta um campo durante o roteiro de atendimento.",
    category: "data",
    keywords: ["coletar", "campo", "cadastro"],
    surfaces: ["atendimento"],
    effect: "agent",
  },
  skill: {
    label: "Skill",
    description: "Disponibiliza uma habilidade no roteiro de atendimento.",
    category: "ai",
    keywords: ["habilidade", "agente"],
    surfaces: ["atendimento"],
    effect: "agent",
  },
  action: {
    label: "Enviar mensagem",
    description: "Envia texto, modelo pronto ou mensagem gerada por IA.",
    category: "messages",
    keywords: ["ação", "texto", "template", "modelo", "envio"],
    surfaces: CLOCK_SURFACES,
    effect: "message",
  },
  internal_task: {
    label: "Criar tarefa",
    description: "Cria uma tarefa interna para a equipe.",
    category: "team",
    keywords: ["lembrete interno", "vendedor", "prazo", "responsável"],
    surfaces: CLOCK_SURFACES,
    effect: "crm",
  },
  move_lead: {
    label: "Mover lead no funil",
    description: "Move o lead para outra etapa do funil.",
    category: "leads",
    keywords: ["etapa", "card", "kanban", "mover"],
    surfaces: CLOCK_SURFACES,
    effect: "crm",
  },
  edit_lead_tag: {
    label: "Adicionar tags ao lead",
    description: "Acrescenta tags preservando as tags existentes.",
    category: "leads",
    keywords: ["etiqueta", "segmentação", "marcador", "editar tag"],
    surfaces: CLOCK_SURFACES,
    effect: "crm",
  },
  map_data: {
    label: "Mapear dados",
    description: "Monta campos a partir das saídas dos blocos anteriores.",
    category: "data",
    keywords: ["variável", "campo", "transformar", "converter", "set", "renomear"],
    surfaces: CLOCK_SURFACES,
    effect: "none",
  },
  end: {
    label: "Fim",
    description: "Encerra o fluxo e registra seu desfecho.",
    category: "flow",
    keywords: ["encerrar", "concluir", "terminar"],
    surfaces: ALL_SURFACES,
    effect: "none",
  },
} as const satisfies Record<NodeType, NodeDefinition>;

function withOutputContract<T extends NodeType>(type: T) {
  return {
    ...NODE_DEFINITIONS[type],
    output_schema: NODE_OUTPUT_CONTRACTS[type],
    output_contract_version: NODE_OUTPUT_CONTRACTS[type] ? EXECUTION_CONTRACT_VERSION : null,
  };
}

/** Mantém os tipos específicos dos schemas por nó, além dos metadados da paleta. */
export const NODE_CATALOG = {
  trigger: withOutputContract("trigger"),
  wait: withOutputContract("wait"),
  condition: withOutputContract("condition"),
  ai_classify: withOutputContract("ai_classify"),
  match_reply: withOutputContract("match_reply"),
  repeat: withOutputContract("repeat"),
  collect: withOutputContract("collect"),
  skill: withOutputContract("skill"),
  action: withOutputContract("action"),
  internal_task: withOutputContract("internal_task"),
  move_lead: withOutputContract("move_lead"),
  edit_lead_tag: withOutputContract("edit_lead_tag"),
  map_data: withOutputContract("map_data"),
  end: withOutputContract("end"),
} as const;

export function nodeTypesForSurface(surface: FollowupFlowSurface): NodeType[] {
  return (Object.keys(NODE_CATALOG) as NodeType[]).filter((type) => {
    const surfaces: readonly FollowupFlowSurface[] = NODE_CATALOG[type].surfaces;
    return surfaces.includes(surface);
  });
}

/** A busca ignora acentos; não altera IDs, rótulos do usuário ou valores do fluxo. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function searchNodeTypes(surface: FollowupFlowSurface, query: string): NodeType[] {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  return nodeTypesForSurface(surface).filter((type) => {
    const node = NODE_CATALOG[type];
    const text = normalizeSearch(
      [node.label, node.description, NODE_CATEGORIES[node.category], ...node.keywords].join(" "),
    );
    return terms.every((term) => text.includes(term));
  });
}
