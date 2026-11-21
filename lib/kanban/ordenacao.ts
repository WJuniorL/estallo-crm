import type { Lead } from "@/lib/types/leads";

/**
 * Ordenação dos cards dentro de cada etapa do funil.
 *
 * `manual` é a ordem arrastada (`position_in_stage`) e é o padrão. Nas outras,
 * a posição gravada continua existindo, mas a TELA mostra a ordem pedida — e
 * por isso reordenar dentro da mesma etapa só vale no modo manual (o índice do
 * arraste seria lido numa lista que não é a da posição).
 */
export const ORDENACOES_DO_FUNIL = [
  "manual",
  "recentes",
  "antigos",
  "movidos_recentes",
  "movidos_antigos",
  "parados",
] as const;
export type OrdenacaoDoFunil = (typeof ORDENACOES_DO_FUNIL)[number];

export const ROTULO_DA_ORDENACAO: Record<OrdenacaoDoFunil, string> = {
  manual: "Manual",
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  movidos_recentes: "Movidos recentemente",
  movidos_antigos: "Movidos há mais tempo",
  parados: "Mais tempo parados",
};

export function ordenacaoDaUrl(valor: string | null | undefined): OrdenacaoDoFunil {
  return (ORDENACOES_DO_FUNIL as readonly string[]).includes(valor ?? "")
    ? (valor as OrdenacaoDoFunil)
    : "manual";
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) || 0 : 0);
const movido = (l: Lead) => ms(l.stage_changed_at ?? l.created_at);
// "Parado" = sem atividade há mais tempo; lead que nunca teve atividade conta
// desde que entrou na etapa.
const ultimaAtividade = (l: Lead) => ms(l.last_activity_at ?? l.stage_changed_at ?? l.created_at);

const CRITERIO: Record<Exclude<OrdenacaoDoFunil, "manual">, (a: Lead, b: Lead) => number> = {
  recentes: (a, b) => ms(b.created_at) - ms(a.created_at),
  antigos: (a, b) => ms(a.created_at) - ms(b.created_at),
  movidos_recentes: (a, b) => movido(b) - movido(a),
  movidos_antigos: (a, b) => movido(a) - movido(b),
  parados: (a, b) => ultimaAtividade(a) - ultimaAtividade(b),
};

/** Ordena uma lista (de uma etapa ou do quadro todo). Estável: empate desfaz por `id`. */
export function ordenarLeads(leads: readonly Lead[], ordem: OrdenacaoDoFunil): Lead[] {
  const criterio =
    ordem === "manual"
      ? (a: Lead, b: Lead) => a.position_in_stage - b.position_in_stage
      : CRITERIO[ordem];
  return [...leads].sort((a, b) => criterio(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
