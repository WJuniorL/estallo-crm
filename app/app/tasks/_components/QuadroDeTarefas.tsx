"use client";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import {
  COLUNAS_DO_QUADRO,
  ordenarTarefas,
  porColuna,
  type SentidoDoPrazo,
} from "@/lib/tarefas/quadro";
import {
  estaAtrasada,
  estaEncerrada,
  proximoEstadoAoAlternar,
  SITUACOES_DA_TAREFA,
  type PrioridadeDaTarefa,
  type SituacaoDaTarefa,
  type Tarefa,
} from "@/lib/tarefas/tipos";
import {
  CalendarBlank,
  Check,
  Kanban,
  SortAscending,
  SortDescending,
  Trash,
  UserCircle,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { COR_DA_PRIORIDADE, ConversarDaTarefa } from "./PecasDaTarefa";

/** A cor do ponto de cada coluna — a mesma que o calendário usa para a situação. */
export const COR_DA_SITUACAO: Record<SituacaoDaTarefa, string> = {
  cancelled: "bg-muted-foreground/50",
  pending: "bg-warning",
  in_progress: "bg-primary",
  done: "bg-success",
};

const CHAVE_DA_ORDEM = "tarefas.quadro.ordem";

/** A ordem escolhida em cada coluna, independente das outras; lembrada neste navegador. */
function useOrdemPorColuna() {
  const [ordem, setOrdem] = useState<Record<SituacaoDaTarefa, SentidoDoPrazo>>({
    cancelled: "antigas",
    pending: "antigas",
    in_progress: "antigas",
    done: "antigas",
  });
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_DA_ORDEM) ?? "null") as Record<
        string,
        string
      > | null;
      if (!salvo) return;
      // Depois da montagem, de propósito: no servidor não há localStorage, e ler
      // no estado inicial faria o HTML do servidor e o do navegador divergirem.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrdem((atual) => {
        const proximo = { ...atual };
        for (const s of SITUACOES_DA_TAREFA)
          if (salvo[s] === "antigas" || salvo[s] === "recentes") proximo[s] = salvo[s];
        return proximo;
      });
    } catch {
      /* navegador sem storage: fica a ordem padrão */
    }
  }, []);
  const alternar = (s: SituacaoDaTarefa) =>
    setOrdem((atual) => {
      const proximo = { ...atual, [s]: atual[s] === "antigas" ? "recentes" : "antigas" } as const;
      try {
        localStorage.setItem(CHAVE_DA_ORDEM, JSON.stringify(proximo));
      } catch {
        /* idem */
      }
      return proximo;
    });
  return { ordem, alternar };
}

interface Props {
  tarefas: Tarefa[];
  podeEditar: boolean;
  nomeDoResponsavel: (tarefa: Tarefa) => string | null;
  aoMover: (tarefa: Tarefa, status: SituacaoDaTarefa) => Promise<unknown>;
  aoEditar: (tarefa: Tarefa) => void;
  aoApagar: (tarefa: Tarefa) => Promise<unknown>;
}

/**
 * O QUADRO DE TAREFAS: uma coluna por situação, arrastar muda a situação.
 *
 * Mesma estrutura do quadro do funil (`components/kanban/KanbanBoard.tsx`): a
 * página não rola; cada coluna tem a altura do quadro, título fixo, e rola só
 * os próprios cards (a área de soltar é a rolagem). Do tablet para cima o
 * quadro não rola de lado — um rolável só por coluna, o que o dnd suporta.
 * Soltar na MESMA coluna não faz nada: a ordem vem da ordenação por prazo, não
 * de uma posição gravada.
 */
export function QuadroDeTarefas({
  tarefas,
  podeEditar,
  nomeDoResponsavel,
  aoMover,
  aoEditar,
  aoApagar,
}: Props) {
  const t = useT();
  const { ordem, alternar } = useOrdemPorColuna();
  const colunas = porColuna(tarefas);

  const titulo: Record<SituacaoDaTarefa, string> = {
    cancelled: t("Canceladas"),
    pending: t("Pendentes"),
    in_progress: t("Em andamento"),
    done: t("Concluídas"),
  };

  function aoSoltar({ source, destination, draggableId }: DropResult) {
    if (!destination || destination.droppableId === source.droppableId) return;
    const tarefa = tarefas.find((x) => x.id === draggableId);
    if (!tarefa) return;
    mover(tarefa, destination.droppableId as SituacaoDaTarefa);
  }

  function mover(tarefa: Tarefa, status: SituacaoDaTarefa) {
    aoMover(tarefa, status).then(
      () => toast.success(`${t("Tarefa movida para")} ${titulo[status]}`),
      (erro: unknown) =>
        toast.error(t("Não foi possível mover a tarefa"), {
          description: erro instanceof Error ? erro.message : undefined,
        }),
    );
  }

  return (
    <DragDropContext onDragEnd={aoSoltar}>
      <div
        // Do tablet para cima as 4 colunas DIVIDEM a largura (crescem quando a
        // barra lateral fecha) e não há rolagem lateral; no celular, uma coluna
        // por tela com rolagem lateral e encaixe.
        className="flex min-h-0 flex-1 snap-x overflow-x-auto overflow-y-hidden pb-4 md:snap-none md:overflow-x-hidden"
        data-testid="quadro-de-tarefas"
      >
        <div className="flex h-full w-max gap-3 md:w-full">
          {COLUNAS_DO_QUADRO.map((status) => {
            const sentido = ordem[status];
            const lista = ordenarTarefas(colunas[status], sentido);
            return (
              <section
                key={status}
                aria-label={titulo[status]}
                data-coluna-de-tarefas={status}
                className="flex h-full min-h-0 w-[85vw] max-w-[320px] shrink-0 snap-center flex-col md:w-auto md:min-w-0 md:max-w-none md:flex-1 md:shrink"
              >
                <header className="flex shrink-0 items-center justify-between gap-2 bg-background pb-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", COR_DA_SITUACAO[status])} />
                    <h2 className="truncate text-sm font-semibold">{titulo[status]}</h2>
                    <span
                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums"
                      data-testid={`contagem-${status}`}
                    >
                      {lista.length}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 shrink-0 p-0 text-muted-foreground"
                    onClick={() => alternar(status)}
                    aria-label={`${titulo[status]}: ${
                      sentido === "antigas"
                        ? t("prazo mais antigo primeiro")
                        : t("prazo mais recente primeiro")
                    }`}
                    title={sentido === "antigas" ? t("Mais antigas primeiro") : t("Mais recentes primeiro")}
                    data-testid={`ordem-${status}`}
                    data-sentido={sentido}
                  >
                    {sentido === "antigas" ? (
                      <SortAscending size={16} aria-hidden />
                    ) : (
                      <SortDescending size={16} aria-hidden />
                    )}
                  </Button>
                </header>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted/20">
                  <Droppable droppableId={status} isDropDisabled={!podeEditar}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain rounded-2xl p-2 transition-colors *:shrink-0",
                          snapshot.isDraggingOver && "bg-accent-soft ring-2 ring-accent/40",
                        )}
                      >
                        {lista.map((tarefa, i) => (
                          <CardDeTarefa
                            key={tarefa.id}
                            tarefa={tarefa}
                            index={i}
                            podeEditar={podeEditar}
                            responsavel={nomeDoResponsavel(tarefa)}
                            aoEditar={aoEditar}
                            aoApagar={aoApagar}
                            // A caixa da lista antiga, mantida: concluir (ou
                            // reabrir) sem arrastar. Mesma regra da lista (#2549).
                            aoAlternar={(x) => mover(x, proximoEstadoAoAlternar(x.status))}
                          />
                        ))}
                        {provided.placeholder}
                        {lista.length === 0 && !snapshot.isDraggingOver && (
                          <p className="py-6 text-center text-xs text-muted-foreground">
                            {t("Nenhuma tarefa aqui.")}
                          </p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}

function CardDeTarefa({
  tarefa,
  index,
  podeEditar,
  responsavel,
  aoEditar,
  aoApagar,
  aoAlternar,
}: {
  tarefa: Tarefa;
  index: number;
  podeEditar: boolean;
  responsavel: string | null;
  aoEditar: (t: Tarefa) => void;
  aoApagar: (t: Tarefa) => Promise<unknown>;
  aoAlternar: (t: Tarefa) => void;
}) {
  const t = useT();
  const tag = useTagDeIdioma();
  const [confirmando, setConfirmando] = useState(false);
  const atrasada = estaAtrasada(tarefa);
  const contato = tarefa.lead ? (tarefa.lead.contact_id ?? tarefa.contact_id) : null;
  const rotuloDaPrioridade: Record<PrioridadeDaTarefa, string> = {
    low: t("Baixa"),
    medium: t("Média"),
    high: t("Alta"),
    urgent: t("Urgente"),
  };

  return (
    <Draggable draggableId={tarefa.id} index={index} isDragDisabled={!podeEditar}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          role="group"
          aria-label={`${t("Tarefa")}: ${tarefa.title}`}
          onClick={podeEditar ? () => aoEditar(tarefa) : undefined}
          className={cn(
            "group rounded-xl border border-border bg-card p-3 text-left transition-colors",
            podeEditar && "cursor-pointer hover:border-border-strong",
            snapshot.isDragging && "shadow-lg ring-1 ring-accent/40",
            atrasada && "border-l-2 border-l-destructive",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                COR_DA_PRIORIDADE[tarefa.priority],
              )}
            >
              {rotuloDaPrioridade[tarefa.priority]}
            </span>
            {atrasada && (
              <span
                className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive"
                data-testid="tag-atrasada"
              >
                {t("Atrasada")}
              </span>
            )}
            {podeEditar && (
              <button
                type="button"
                role="checkbox"
                aria-checked={estaEncerrada(tarefa)}
                aria-label={
                  estaEncerrada(tarefa) ? t("Reabrir a tarefa") : t("Marcar como concluída")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  aoAlternar(tarefa);
                }}
                className={cn(
                  "ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors",
                  estaEncerrada(tarefa)
                    ? "border-primary bg-primary text-primary-foreground dark:bg-accent-700"
                    : "border-muted-foreground/40 hover:border-primary",
                )}
              >
                {estaEncerrada(tarefa) ? <Check size={12} weight="bold" aria-hidden /> : null}
              </button>
            )}
          </div>

          <p className="mt-2 line-clamp-2 text-sm font-medium">{tarefa.title}</p>

          {tarefa.lead && (
            <p
              className="mt-1 flex min-w-0 items-center gap-1 text-sm font-semibold text-text"
              title={tarefa.lead.title}
            >
              <Kanban size={13} aria-hidden className="shrink-0 text-muted-foreground" />
              <span className="truncate">{tarefa.lead.title}</span>
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "flex items-center gap-1",
                atrasada && "font-semibold text-destructive",
              )}
            >
              <CalendarBlank size={13} aria-hidden />
              {tarefa.due_date
                ? new Date(tarefa.due_date).toLocaleString(tag, {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : t("Sem prazo")}
            </span>
            {responsavel && (
              <span className="flex min-w-0 items-center gap-1">
                <UserCircle size={13} aria-hidden className="shrink-0" />
                <span className="truncate">{responsavel}</span>
              </span>
            )}
            {/* Os botões do card não abrem o modal nem iniciam arraste. */}
            <span
              className="ml-auto flex shrink-0 items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {podeEditar &&
                (confirmando ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => void aoApagar(tarefa)}
                    onBlur={() => setConfirmando(false)}
                    autoFocus
                  >
                    {t("Confirmar")}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    aria-label={t("Apagar a tarefa")}
                    onClick={() => setConfirmando(true)}
                  >
                    <Trash size={13} aria-hidden />
                  </Button>
                ))}
              {contato && <ConversarDaTarefa contactId={contato} />}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
