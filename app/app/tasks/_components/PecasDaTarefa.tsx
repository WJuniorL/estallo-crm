"use client";

import { useState } from "react";

import { useConversaNovaComEscolhaDeCanal } from "@/components/channels/SeletorDeCanalParaConversa";
import { useChatSuspenso } from "@/components/chat-suspenso/ChatSuspensoContext";
import { IconeWhatsapp } from "@/components/chat-suspenso/IconeWhatsapp";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { PrioridadeDaTarefa } from "@/lib/tarefas/tipos";

/** Peças que a lista (dossiê do lead) e o quadro de Tarefas mostram do MESMO jeito. */

/**
 * CONVERSAR COM O CONTATO DA OPORTUNIDADE, SEM SAIR DAS TAREFAS.
 *
 * Abre o MESMO chat suspenso do funil. A conversa é procurada primeiro (sem
 * efeito colateral); só quando o contato não tem nenhuma é que o fluxo de
 * conversa nova — com a escolha de canal, quando há mais de um — a cria.
 */
export function ConversarDaTarefa({ contactId }: { contactId: string }) {
  const t = useT();
  const chat = useChatSuspenso();
  const conversaNova = useConversaNovaComEscolhaDeCanal({ aoAbrir: (id) => chat?.abrir(id) });
  const [buscando, setBuscando] = useState(false);
  if (!chat) return null;

  async function conversar() {
    setBuscando(true);
    try {
      const r = await apiClient.get<{ data: Array<{ id: string }> }>(
        `/api/v1/conversations?contact_id=${encodeURIComponent(contactId)}&limit=1`,
      );
      const existente = r.data[0]?.id;
      if (existente) chat!.abrir(existente);
      else await conversaNova.iniciarConversa({ contact_id: contactId });
    } catch (err) {
      showApiError(err);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void conversar()}
        disabled={buscando || conversaNova.abrindo}
        className="inline-flex size-6 items-center justify-center rounded-full bg-success-bg text-success-fg hover:bg-success-bg/70 disabled:opacity-60"
        title={t("Conversar com o contato sem sair das tarefas")}
        aria-label={t("Conversar com o contato sem sair das tarefas")}
      >
        <IconeWhatsapp size={14} />
      </button>
      {conversaNova.seletor}
    </>
  );
}

/** A cor é do TEMA, nunca um hex: ela tem de sobreviver ao claro e ao escuro. */
export const COR_DA_PRIORIDADE: Record<PrioridadeDaTarefa, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  urgent: "bg-destructive/15 text-destructive",
};
