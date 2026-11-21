"use client";
import { useState } from "react";

import { ScheduleDialog, rotuloDoHorario } from "@/components/inbox/composer/ScheduleDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useAlterarAgendada } from "@/hooks/inbox/useScheduledMessages";
import type { MensagemAgendada } from "@/lib/inbox/mensagem-agendada";
import { Clock, PencilSimple, Trash, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O balão da mensagem AGENDADA — ainda não saiu. Fica à direita como as
 * enviadas, mas com borda tracejada e fundo claro: não pode ser confundido com
 * mensagem que o cliente já recebeu. Clicar em qualquer ponto abre Editar /
 * Cancelar envio. A que falhou mostra o motivo e só oferece descartar.
 */
export function ScheduledMessageCard({
  agendada,
  conversationId,
  nomeDoContato,
}: {
  agendada: MensagemAgendada;
  conversationId: string;
  nomeDoContato?: string | null;
}) {
  const t = useT();
  const locale = useLocaleDeData();
  const { editar, cancelar } = useAlterarAgendada(conversationId);
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const falhou = agendada.status === "failed";
  const saindo = agendada.status === "sending";
  const quando = new Date(agendada.send_at);

  return (
    <div className="flex w-full min-w-0 justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={saindo}>
          <button
            type="button"
            data-testid="scheduled-message"
            aria-label={t("Opções da mensagem agendada")}
            className={cn("ibx-bubble ibx-agendada text-left", falhou && "ibx-agendada-falhou")}
          >
            <span className="ibx-bubble-label flex items-center gap-1">
              {falhou ? <Warning size={14} aria-hidden /> : <Clock size={14} aria-hidden />}
              {falhou
                ? t("Agendada · não enviada")
                : saindo
                  ? t("Enviando agora…")
                  : `${t("Agendada")} · ${rotuloDoHorario(quando, t, locale).toLocaleLowerCase()}`}
            </span>
            <span className="block whitespace-pre-wrap wrap-anywhere leading-snug">{agendada.body}</span>
            {falhou && agendada.error_message && (
              <span className="mt-1 block text-xs text-destructive">{agendada.error_message}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!falhou && (
            <>
              <DropdownMenuItem onSelect={() => setEditando(true)}>
                <PencilSimple size={16} aria-hidden />
                {t("Editar mensagem ou horário")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setCancelando(true)} className="text-destructive focus:text-destructive">
            <Trash size={16} aria-hidden />
            {falhou ? t("Descartar") : t("Cancelar envio")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ScheduleDialog
        open={editando}
        onOpenChange={setEditando}
        nomeDoContato={nomeDoContato}
        inicial={quando}
        corpoInicial={agendada.body}
        salvando={editar.isPending}
        onConfirm={(novo, corpo) =>
          editar.mutate(
            { id: agendada.id, send_at: novo.toISOString(), body: corpo },
            { onSuccess: () => setEditando(false) },
          )
        }
      />

      <AlertDialog open={cancelando} onOpenChange={setCancelando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{falhou ? t("Descartar esta mensagem?") : t("Cancelar o envio agendado?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("A mensagem não será enviada ao cliente.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Voltar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelar.mutate(agendada.id)}>
              {falhou ? t("Descartar") : t("Cancelar envio")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
