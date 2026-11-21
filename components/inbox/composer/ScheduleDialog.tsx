"use client";
import { useState } from "react";
import {
  addHours,
  format,
  formatDistanceStrict,
  isToday,
  isTomorrow,
  nextMonday,
  setHours,
  startOfDay,
  addDays,
  type Locale,
} from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { ANTECEDENCIA_MINIMA_MS } from "@/lib/inbox/mensagem-agendada";
import { CalendarBlank, Clock, SunHorizon } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** As três sugestões do diálogo, a partir de `agora` (puro — testado em ScheduleDialog.test.ts). */
export function sugestoesDeHorario(agora: Date): { chave: "1h" | "amanha" | "segunda"; quando: Date }[] {
  const as9 = (d: Date) => setHours(startOfDay(d), 9);
  return [
    { chave: "1h", quando: addHours(agora, 1) },
    { chave: "amanha", quando: as9(addDays(agora, 1)) },
    { chave: "segunda", quando: as9(nextMonday(agora)) },
  ];
}

/** "Hoje às 23:45", "Amanhã às 09:00", "Segunda-feira às 09:00", "20/12 às 10:00". */
export function rotuloDoHorario(d: Date, t: (texto: string) => string, locale: Locale): string {
  const hora = format(d, "HH:mm");
  const dias = (startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86_400_000;
  const dia = isToday(d)
    ? t("Hoje")
    : isTomorrow(d)
      ? t("Amanhã")
      : dias < 7
        ? capitalizar(format(d, "EEEE", { locale }))
        : format(d, "dd/MM");
  return `${dia} ${t("às")} ${hora}`;
}

function capitalizar(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nomeDoContato?: string | null;
  /** Horário já escolhido (editar o chip ou a agendada). */
  inicial?: Date | null;
  /** Presente = edição de uma agendada: mostra o texto também. */
  corpoInicial?: string;
  salvando?: boolean;
  onConfirm: (quando: Date, corpo?: string) => void;
}

export function ScheduleDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Montado só aberto: cada abertura recomeça do horário em vigor (ou de "em 1 hora"). */}
      {props.open && <Formulario {...props} />}
    </Dialog>
  );
}

function Formulario({ onOpenChange, nomeDoContato, inicial, corpoInicial, salvando, onConfirm }: Props) {
  const t = useT();
  const locale = useLocaleDeData();
  const editando = corpoInicial !== undefined;
  const [base] = useState(() => inicial ?? addHours(new Date(), 1));
  const [data, setData] = useState(() => format(base, "yyyy-MM-dd"));
  const [hora, setHora] = useState(() => format(base, "HH:mm"));
  const [corpo, setCorpo] = useState(corpoInicial ?? "");

  const quando = data && hora ? new Date(`${data}T${hora}`) : null;
  const agora = new Date();
  const valido = !!quando && !Number.isNaN(quando.getTime()) && quando.getTime() >= agora.getTime() + ANTECEDENCIA_MINIMA_MS;
  const escolher = (d: Date) => {
    setData(format(d, "yyyy-MM-dd"));
    setHora(format(d, "HH:mm"));
  };
  const icones = { "1h": Clock, amanha: SunHorizon, segunda: CalendarBlank } as const;
  const titulos = { "1h": t("Em 1 hora"), amanha: t("Amanhã de manhã"), segunda: t("Próxima segunda") };

  return (
    <>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
              <Clock size={20} aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle>{editando ? t("Editar mensagem agendada") : t("Agendar mensagem")}</DialogTitle>
              <DialogDescription>
                {nomeDoContato
                  ? `${t("Enviada automaticamente para")} ${nomeDoContato} ${t("no horário escolhido.")}`
                  : t("Enviada automaticamente no horário escolhido.")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {editando && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Mensagem")}</p>
            <Textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={3} maxLength={4096} />
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Sugestões")}</p>
          <div className="grid grid-cols-2 gap-2">
            {sugestoesDeHorario(agora).map(({ chave, quando: q }) => {
              const Icone = icones[chave];
              const ativa = !!quando && Math.abs(quando.getTime() - q.getTime()) < 60_000;
              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => escolher(q)}
                  aria-pressed={ativa}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border border-border p-2.5 text-left transition-colors hover:border-primary/60",
                    ativa && "border-primary bg-accent-soft",
                  )}
                >
                  <Icone size={16} className={cn("mt-0.5 shrink-0", ativa ? "text-accent-text" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", ativa && "text-accent-text")}>{titulos[chave]}</span>
                    <span className="block text-xs text-muted-foreground">{rotuloDoHorario(q, t, locale)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Data e hora")}</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="date"
              value={data}
              min={format(agora, "yyyy-MM-dd")}
              onChange={(e) => setData(e.target.value)}
              aria-label={t("Data")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              aria-label={t("Hora")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm",
            valido ? "bg-accent-soft text-foreground" : "bg-destructive/10 text-destructive",
          )}
        >
          <Clock size={16} className="shrink-0" aria-hidden />
          {valido && quando ? (
            <span>
              {t("Envio")} <strong>{rotuloDoHorario(quando, t, locale).toLocaleLowerCase()}</strong> ·{" "}
              {formatDistanceStrict(quando, agora, { locale, addSuffix: true })}
            </span>
          ) : (
            <span>{t("Escolha um horário pelo menos 1 minuto no futuro.")}</span>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            disabled={!valido || salvando || (editando && !corpo.trim())}
            onClick={() => quando && onConfirm(quando, editando ? corpo.trim() : undefined)}
          >
            <Clock size={16} aria-hidden />
            {editando ? t("Salvar") : t("Definir horário")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}
