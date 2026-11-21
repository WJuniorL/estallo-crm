"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { COLUNAS_DO_QUADRO } from "@/lib/tarefas/quadro";
import {
  diaLocalDoPrazo,
  estaAtrasada,
  estaEncerrada,
  type SituacaoDaTarefa,
  type Tarefa,
} from "@/lib/tarefas/tipos";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { COR_DA_SITUACAO } from "./QuadroDeTarefas";

interface Props {
  tarefas: Tarefa[];
  podeEditar: boolean;
  aoAbrirTarefa: (tarefa: Tarefa) => void;
  /** `YYYY-MM-DD` do dia clicado — o formulário abre já com esse prazo. */
  aoClicarNoDia: (dia: string) => void;
}

const POR_DIA_VISIVEIS = 3;

/**
 * O mês, com o que vence em cada dia.
 *
 * ⚠️ Nem o nome do mês nem o do dia da semana são escritos à mão: os do
 * original eram dois arrays em português, e a tela em espanhol mostraria
 * "Março". `Intl` os produz a partir da etiqueta de idioma de quem está lendo,
 * que é a mesma regra que `tests/unit/i18n-a-data-segue-o-idioma.test.ts` cobra.
 */
function diasDaGrade(ano: number, mes: number): (Date | null)[] {
  const primeiroDiaDaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const grade: (Date | null)[] = Array<Date | null>(primeiroDiaDaSemana).fill(null);
  for (let dia = 1; dia <= diasNoMes; dia++) grade.push(new Date(ano, mes, dia));
  while (grade.length % 7 !== 0) grade.push(null);
  return grade;
}

export function CalendarioDeTarefas({ tarefas, podeEditar, aoAbrirTarefa, aoClicarNoDia }: Props) {
  const t = useT();
  const tag = useTagDeIdioma();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());

  const grade = diasDaGrade(ano, mes);
  const diaDeHoje = diaLocalDoPrazo(hoje.toISOString());

  const porDia = new Map<string, Tarefa[]>();
  for (const tarefa of tarefas) {
    if (!tarefa.due_date) continue;
    const chave = diaLocalDoPrazo(tarefa.due_date);
    const atual = porDia.get(chave);
    if (atual) atual.push(tarefa);
    else porDia.set(chave, [tarefa]);
  }

  const nomeDoMes = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(
    new Date(ano, mes, 1),
  );
  const nomeDoDiaDaSemana = new Intl.DateTimeFormat(tag, { weekday: "short" });
  // 2026-03-01 é um domingo: a semana começa no índice 0 da grade.
  const cabecalhos = Array.from({ length: 7 }, (_, i) =>
    nomeDoDiaDaSemana.format(new Date(2026, 2, 1 + i)),
  );

  const nomeDaSituacao: Record<SituacaoDaTarefa, string> = {
    cancelled: t("Canceladas"),
    pending: t("Pendentes"),
    in_progress: t("Em andamento"),
    done: t("Concluídas"),
  };
  const hora = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" });

  function mover(delta: number) {
    const alvo = new Date(ano, mes + delta, 1);
    setAno(alvo.getFullYear());
    setMes(alvo.getMonth());
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t("Mês anterior")}
          onClick={() => mover(-1)}
        >
          <CaretLeft size={16} aria-hidden />
        </Button>
        <h2 className="text-base font-semibold capitalize">{nomeDoMes}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t("Próximo mês")}
          onClick={() => mover(1)}
        >
          <CaretRight size={16} aria-hidden />
        </Button>
      </div>

      {/* A MESMA cor de cada coluna do quadro: as duas visões falam a mesma língua. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-[11px] text-muted-foreground">
        {COLUNAS_DO_QUADRO.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", COR_DA_SITUACAO[s])} aria-hidden />
            {nomeDaSituacao[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" aria-hidden />
          {t("Atrasada")}
        </span>
      </div>

      <div className="grid grid-cols-7 border-b bg-muted/40">
        {cabecalhos.map((rotulo) => (
          <div
            key={rotulo}
            className="py-2 text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
          >
            {rotulo}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y">
        {grade.map((dia, i) => {
          if (!dia) return <div key={`vazio-${i}`} className="min-h-[104px] bg-muted/15" />;

          const chave = diaLocalDoPrazo(dia.toISOString());
          const doDia = porDia.get(chave) ?? [];
          const excedente = doDia.length - POR_DIA_VISIVEIS;
          const atrasadasNoDia = doDia.filter((x) => estaAtrasada(x)).length;

          return (
            <div
              key={chave}
              className={cn(
                "flex min-h-[104px] flex-col gap-1 p-1.5",
                chave === diaDeHoje && "bg-primary/5",
                podeEditar && "cursor-pointer transition-colors hover:bg-muted/30",
              )}
              onClick={podeEditar ? () => aoClicarNoDia(chave) : undefined}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    chave === diaDeHoje
                      ? "bg-primary font-bold text-primary-foreground dark:bg-accent-700"
                      : "text-muted-foreground",
                  )}
                >
                  {dia.getDate()}
                </span>
                {atrasadasNoDia > 0 && (
                  <span
                    className="rounded-full bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive"
                    title={t("Atrasadas")}
                    aria-label={`${atrasadasNoDia} ${t("Atrasadas")}`}
                  >
                    {atrasadasNoDia}
                  </span>
                )}
              </div>

              {doDia.slice(0, POR_DIA_VISIVEIS).map((tarefa) => (
                <button
                  key={tarefa.id}
                  type="button"
                  title={[
                    tarefa.title,
                    nomeDaSituacao[tarefa.status],
                    estaAtrasada(tarefa) ? t("Atrasada") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={(e) => {
                    e.stopPropagation();
                    aoAbrirTarefa(tarefa);
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium",
                    estaEncerrada(tarefa)
                      ? "bg-muted text-muted-foreground line-through"
                      : estaAtrasada(tarefa)
                        ? "bg-destructive/15 font-semibold text-destructive"
                        : "bg-accent-soft text-accent-text",
                  )}
                >
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", COR_DA_SITUACAO[tarefa.status])}
                    aria-hidden
                  />
                  <span className="shrink-0 tabular-nums opacity-80">
                    {hora.format(new Date(tarefa.due_date!))}
                  </span>
                  <span className="truncate">{tarefa.title}</span>
                </button>
              ))}

              {excedente > 0 ? (
                <span className="pl-1 text-[10px] font-semibold text-muted-foreground">
                  +{excedente} {t("mais")}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
