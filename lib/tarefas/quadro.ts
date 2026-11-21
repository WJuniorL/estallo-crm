/**
 * O QUADRO DE TAREFAS — colunas, filtros e ordenação, em funções puras.
 *
 * A tela de Tarefas virou Kanban: uma coluna por situação, na ordem pedida pelo
 * dono do produto (Canceladas, Pendentes, Em andamento, Concluídas). As quatro
 * situações são EXATAMENTE o CHECK de `crm_tasks.status` (`SITUACOES_DA_TAREFA`),
 * então toda tarefa cai numa coluna e nenhuma fica de fora.
 *
 * Filtro e ordenação só escolhem o que MOSTRAR: nada aqui altera a tarefa.
 */
import {
  diaLocalDoPrazo,
  estaAtrasada,
  type PrioridadeDaTarefa,
  type SituacaoDaTarefa,
  type Tarefa,
} from "./tipos";

export const COLUNAS_DO_QUADRO = [
  "cancelled",
  "pending",
  "in_progress",
  "done",
] as const satisfies readonly SituacaoDaTarefa[];

export type PeriodoDoPrazo = "atrasadas" | "hoje" | "semana" | "personalizado";

export interface FiltroDoQuadro {
  /** Só as do usuário logado ("Minhas tarefas"). */
  minhas?: boolean;
  prazo?: PeriodoDoPrazo;
  /** `YYYY-MM-DD`, inclusivos — só com `prazo: "personalizado"`. */
  de?: string;
  ate?: string;
  prioridades?: PrioridadeDaTarefa[];
  /** user_ids. */
  responsaveis?: string[];
}

/** Quantos filtros do botão "Filtro" estão ligados ("Minhas tarefas" tem botão próprio). */
export function contarFiltros(f: FiltroDoQuadro): number {
  return (f.prazo ? 1 : 0) + (f.prioridades?.length ? 1 : 0) + (f.responsaveis?.length ? 1 : 0);
}

const dia = (d: Date) => diaLocalDoPrazo(d.toISOString());

/** A semana corrente, domingo a sábado — a mesma grade do calendário de Tarefas. */
export function semanaDe(agora: Date): { de: string; ate: string } {
  const domingo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - agora.getDay());
  const sabado = new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate() + 6);
  return { de: dia(domingo), ate: dia(sabado) };
}

function passaPrazo(t: Tarefa, f: FiltroDoQuadro, agora: Date): boolean {
  if (!f.prazo) return true;
  if (f.prazo === "atrasadas") return estaAtrasada(t, agora);
  if (!t.due_date) return false;
  const diaDoPrazo = diaLocalDoPrazo(t.due_date);
  if (f.prazo === "hoje") return diaDoPrazo === dia(agora);
  const { de, ate } = f.prazo === "semana" ? semanaDe(agora) : { de: f.de, ate: f.ate };
  if (de && diaDoPrazo < de) return false;
  if (ate && diaDoPrazo > ate) return false;
  return true;
}

export function filtrarTarefas(
  tarefas: readonly Tarefa[],
  f: FiltroDoQuadro,
  ctx: { usuarioId: string; agora?: Date },
): Tarefa[] {
  const agora = ctx.agora ?? new Date();
  return tarefas.filter((t) => {
    if (f.minhas && t.assigned_to !== ctx.usuarioId) return false;
    if (f.prioridades?.length && !f.prioridades.includes(t.priority)) return false;
    if (f.responsaveis?.length && !(t.assigned_to && f.responsaveis.includes(t.assigned_to)))
      return false;
    return passaPrazo(t, f, agora);
  });
}

export type SentidoDoPrazo = "antigas" | "recentes";

/**
 * Ordena pelo prazo COMPLETO (data e hora). Sem prazo vai SEMPRE para o fim,
 * nos dois sentidos — "mais recentes primeiro" não pode pôr no topo justamente
 * o que nem tem data. Empate desfaz pela criação, depois pelo id.
 */
export function ordenarTarefas(tarefas: readonly Tarefa[], sentido: SentidoDoPrazo): Tarefa[] {
  const sinal = sentido === "antigas" ? 1 : -1;
  return [...tarefas].sort((a, b) => {
    if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
    const porPrazo =
      a.due_date && b.due_date ? (Date.parse(a.due_date) - Date.parse(b.due_date)) * sinal : 0;
    return (
      porPrazo ||
      a.created_at.localeCompare(b.created_at) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
}

/** Agrupa por situação, já na ordem das colunas. */
export function porColuna(tarefas: readonly Tarefa[]): Record<SituacaoDaTarefa, Tarefa[]> {
  const grupos = Object.fromEntries(COLUNAS_DO_QUADRO.map((s) => [s, [] as Tarefa[]])) as Record<
    SituacaoDaTarefa,
    Tarefa[]
  >;
  for (const t of tarefas) grupos[t.status]?.push(t);
  return grupos;
}

/** O filtro na URL (deep-link e F5), como o do funil. */
export function filtroDaUrl(sp: URLSearchParams): FiltroDoQuadro {
  const prazo = sp.get("prazo");
  const DATA = /^\d{4}-\d{2}-\d{2}$/;
  const data = (v: string | null) => (v && DATA.test(v) ? v : undefined);
  const prioridades = sp
    .getAll("prioridade")
    .filter((p): p is PrioridadeDaTarefa => ["low", "medium", "high", "urgent"].includes(p));
  return {
    minhas: sp.get("minhas") === "1" || undefined,
    prazo:
      prazo === "atrasadas" || prazo === "hoje" || prazo === "semana" || prazo === "personalizado"
        ? prazo
        : undefined,
    de: data(sp.get("de")),
    ate: data(sp.get("ate")),
    prioridades: prioridades.length ? prioridades : undefined,
    responsaveis: sp.getAll("responsavel").length ? sp.getAll("responsavel") : undefined,
  };
}

export function filtroParaUrl(f: FiltroDoQuadro): string {
  const p = new URLSearchParams();
  if (f.minhas) p.set("minhas", "1");
  if (f.prazo) p.set("prazo", f.prazo);
  if (f.prazo === "personalizado") {
    if (f.de) p.set("de", f.de);
    if (f.ate) p.set("ate", f.ate);
  }
  for (const v of f.prioridades ?? []) p.append("prioridade", v);
  for (const v of f.responsaveis ?? []) p.append("responsavel", v);
  return p.toString();
}
