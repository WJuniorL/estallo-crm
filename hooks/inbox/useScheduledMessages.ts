"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { MensagemAgendada } from "@/lib/inbox/mensagem-agendada";

const chave = (conversationId: string | null) => ["scheduled-messages", conversationId] as const;

/**
 * Mensagens agendadas da conversa (pendentes e as que falharam). Sem canal de
 * tempo real próprio: o envio pelo cron gera um INSERT em `messages`, e
 * `useMessagesRealtime` invalida esta chave junto.
 */
export function useScheduledMessages(conversationId: string | null) {
  const query = useQuery({
    queryKey: chave(conversationId),
    enabled: !!conversationId,
    queryFn: () =>
      apiClient.get<{ data: MensagemAgendada[] }>(`/api/v1/conversations/${conversationId}/scheduled-messages`),
    select: (res) => res.data,
  });
  return query.data ?? [];
}

export function useAgendarMensagem(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; send_at: string }) =>
      apiClient.post(`/api/v1/conversations/${conversationId}/scheduled-messages`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(conversationId) }),
  });
}

export function useAlterarAgendada(conversationId: string) {
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: chave(conversationId) });
  const editar = useMutation({
    mutationFn: ({ id, ...campos }: { id: string; body?: string; send_at?: string }) =>
      apiClient.patch(`/api/v1/scheduled-messages/${id}`, campos),
    onError: showApiError,
    onSettled: invalidar,
  });
  const cancelar = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/scheduled-messages/${id}`),
    onError: showApiError,
    onSettled: invalidar,
  });
  return { editar, cancelar };
}
