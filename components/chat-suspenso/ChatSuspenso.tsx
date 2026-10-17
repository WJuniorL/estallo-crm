"use client";

import "@/components/inbox/inbox.css";
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { buscarConversa, useConversation } from "@/hooks/inbox/useConversation";
import { useMarkAsRead } from "@/hooks/inbox/useMarkAsRead";
import { useEstadoDoEnvio } from "@/hooks/inbox/useEstadoDoEnvio";
import { alinharFioComAPrevia } from "@/hooks/inbox/recargaDasConversas";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { OpenConversationProvider } from "@/hooks/notifications/OpenConversationContext";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useVoiceCall } from "@/components/voice/VoiceCallContext";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { corDoAvatar } from "@/components/inbox/ConversationListItem";
import { RetentionNotice } from "@/components/inbox/RetentionNotice";
import { JanelaFechadaAviso } from "@/components/inbox/JanelaFechadaAviso";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowSquareOut, ChatCircle, Minus, X } from "@/lib/ui/icons";
import { usePecaDoRodape, type PecaDoRodape } from "@/lib/ui/rodape-ocupado";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types/messaging";
import { useChatSuspenso, type ChatSuspensoApi } from "./ChatSuspensoContext";

// O fio e o composer são os do Inbox — não uma segunda implementação. Carregados
// sob demanda: quem nunca abre um chat suspenso não paga por eles em toda tela.
const ChatThread = dynamic(() => import("@/components/inbox/ChatThread").then((m) => m.ChatThread));
const Composer = dynamic(() => import("@/components/inbox/Composer").then((m) => m.Composer));

/**
 * O QUE O CHAT SUSPENSO OCUPA DO RODAPÉ: a bolha minimizada (56px a 16px do
 * fundo). A janela aberta flutua por cima do conteúdo, como um diálogo — se ela
 * entrasse na reserva, abrir um chat encolheria a tela de baixo (o quadro do
 * funil pularia). Só registra enquanto há chat aberto.
 */
export const CHAT_SUSPENSO: PecaDoRodape = {
  dono: "components/chat-suspenso/ChatSuspenso.tsx",
  distancia: 16,
  altura: 56,
};

/** Com chamada de voz no ar o canto de baixo é do painel da chamada: o chat sobe. */
const ACIMA_DA_CHAMADA = 96;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return `${partes[0]![0] ?? ""}${partes[partes.length - 1]![0] ?? ""}`.toUpperCase();
}

function AvatarDoContato({
  conversa,
  nome,
  className,
}: {
  conversa: ConversationWithContact | undefined;
  nome: string;
  className?: string;
}) {
  const c = conversa?.contacts;
  return (
    <Avatar className={className}>
      {c?.avatar_storage_path && !c.is_anonymized ? (
        <AvatarImage src={`/api/v1/contacts/${c.id}/avatar`} alt="" className="object-cover" />
      ) : null}
      <AvatarFallback className={cn("text-xs font-semibold", corDoAvatar(nome))}>
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * CHATS SUSPENSOS — conversar com o contato sem sair do funil ou das tarefas.
 *
 * Uma janela compacta no canto inferior direito, com os MESMOS fio e composer do
 * Inbox (mesmas mensagens, mesma ordem, mesmas regras de envio, mesmo tempo
 * real). Vários contatos ficam como avatares empilhados à esquerda da janela;
 * só um fica expandido. Minimizado, vira uma bolha com o total de não lidas.
 *
 * No próprio Inbox não aparece: a tela já é o chat. O estado continua guardado
 * e volta ao sair de lá.
 */
export function ChatSuspenso() {
  const chat = useChatSuspenso();
  const rota = usePathname();
  // Sem chat aberto nada é lido — nem a sessão: a casca monta isto em toda tela.
  if (!chat || chat.abertos.length === 0) return null;
  if (rota?.startsWith("/app/inbox")) return null;
  return <Doca chat={chat} />;
}

function Doca({ chat }: { chat: ChatSuspensoApi }) {
  const t = useT();
  const orgId = useAuth().activeOrg?.orgId ?? null;
  const qc = useQueryClient();
  const ancora = usePecaDoRodape(CHAT_SUSPENSO);
  const { call, minha } = useVoiceCall();
  const elevado = Boolean(minha && call && call.status !== "ended");
  const { abertos, ativo, minimizado } = chat;

  // Uma busca por conversa aberta — a MESMA chave do Inbox, então os dois
  // compartilham o dado (e o que um atualiza o outro vê).
  const conversas = useQueries({
    queries: abertos.map((id) => ({
      queryKey: ["conversation", id],
      queryFn: () => buscarConversa(id),
      retry: false,
    })),
    combine: (rs) => rs.map((r) => r.data),
  });
  const porId = new Map(abertos.map((id, i) => [id, conversas[i]]));
  const naoLidas = (id: string) => porId.get(id)?.unread_count_for_assignee ?? 0;
  const totalNaoLidas = abertos.reduce((soma, id) => soma + naoLidas(id), 0);

  // Um canal de conversas da org enquanto há chat aberto: contador de não lidas,
  // status e prévia acompanham sem polling, e o fio é relido se ficou para trás.
  const aoMudar = useCallback(
    (payload: unknown) => {
      alinharFioComAPrevia(qc, payload);
      const id = (payload as { new?: { id?: unknown } } | null)?.new?.id;
      if (typeof id === "string" && abertos.includes(id)) {
        void qc.invalidateQueries({ queryKey: ["conversation", id] });
      }
    },
    [qc, abertos],
  );
  useRealtimeChannel({
    name: orgId ? `chat-suspenso-${orgId}` : "chat-suspenso-desligado",
    postgresChanges: orgId
      ? {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${orgId}`,
        }
      : undefined,
    onChange: aoMudar,
    enabled: !!orgId,
  });

  const nomeDe = (id: string) => rotuloDoContato(porId.get(id)?.contacts ?? null, t);

  return (
    <aside
      ref={ancora}
      aria-label={t("Chats suspensos")}
      style={{ bottom: elevado ? ACIMA_DA_CHAMADA : "var(--chat-suspenso-base)" }}
      className="ibx fixed right-2 z-40 flex items-end gap-2 [--chat-suspenso-base:5rem] md:right-4 md:[--chat-suspenso-base:1rem]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented && !minimizado) {
          e.stopPropagation();
          chat.minimizar();
        }
      }}
    >
      {/* O trilho: um avatar por contato aberto, empilhados. */}
      {!minimizado && (
        <TooltipProvider delayDuration={200}>
          <nav
            aria-label={t("Conversas abertas")}
            className="chat-suspenso-entrada flex max-h-[min(560px,calc(100dvh-9rem))] flex-col gap-2 overflow-y-auto rounded-full border border-border bg-background/90 p-1.5 shadow-lg backdrop-blur-sm"
          >
            {abertos.map((id) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <span className="group relative">
                    <button
                      type="button"
                      onClick={() => chat.alternar(id)}
                      aria-label={nomeDe(id)}
                      aria-current={id === ativo ? "true" : undefined}
                      className={cn(
                        "block rounded-full transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2",
                        id === ativo && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      )}
                    >
                      <AvatarDoContato conversa={porId.get(id)} nome={nomeDe(id)} className="size-10" />
                    </button>
                    {naoLidas(id) > 0 && id !== ativo && (
                      <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ring-2 ring-background">
                        {naoLidas(id)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => chat.fechar(id)}
                      aria-label={`${t("Fechar chat de")} ${nomeDe(id)}`}
                      className="absolute -left-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-foreground text-background group-focus-within:flex group-hover:flex"
                    >
                      <X size={10} weight="bold" aria-hidden />
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">{nomeDe(id)}</TooltipContent>
              </Tooltip>
            ))}
          </nav>
        </TooltipProvider>
      )}

      {/* A janela fica SEMPRE montada, inclusive minimizada (invisível e fora
          do fluxo): minimizar não pode perder o texto não enviado, a posição
          de leitura nem o canal de tempo real de cada conversa. */}
      <section
        aria-label={ativo ? `${t("Chat com")} ${nomeDe(ativo)}` : undefined}
        aria-hidden={minimizado}
        className={cn(
          "relative flex h-[min(560px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-5.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl",
          minimizado ? "pointer-events-none invisible absolute right-0" : "chat-suspenso-entrada",
        )}
      >
        {/* Todas as conversas abertas ficam montadas; só a ativa aparece (e só
            ela conta como lida). */}
        {abertos.map((id) => (
          <PainelDaConversa
            key={id}
            conversationId={id}
            visivel={!minimizado && id === ativo}
            aoMinimizar={chat.minimizar}
            aoFechar={() => chat.fechar(id)}
          />
        ))}
      </section>

      {minimizado && (
        <button
          type="button"
          onClick={chat.restaurar}
          aria-label={
            totalNaoLidas > 0
              ? `${t("Abrir chats")} — ${totalNaoLidas} ${t("não lidas")}`
              : t("Abrir chats")
          }
          className="chat-suspenso-entrada relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
        >
          <ChatCircle size={26} weight="fill" aria-hidden />
          {totalNaoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground ring-2 ring-background">
              {totalNaoLidas > 99 ? "99+" : totalNaoLidas}
            </span>
          )}
        </button>
      )}
    </aside>
  );
}

function PainelDaConversa({
  conversationId,
  visivel,
  aoMinimizar,
  aoFechar,
}: {
  conversationId: string;
  visivel: boolean;
  aoMinimizar: () => void;
  aoFechar: () => void;
}) {
  const t = useT();
  const consulta = useConversation(conversationId, true);
  const conversa = consulta.data ?? null;
  const [respondendo, setRespondendo] = useState<Message | null>(null);
  const { motivoDaJanela, blockedReason, fechada } = useEstadoDoEnvio(conversa);
  // Minimizada ou atrás de outra, a conversa NÃO é lida: só a que está à vista.
  useMarkAsRead(visivel && conversa ? conversationId : null, conversa?.unread_count_for_assignee ?? 0);
  const nome = rotuloDoContato(conversa?.contacts ?? null, t);

  return (
    <div
      aria-hidden={!visivel}
      // `invisible` e não `hidden`: com `display: none` o navegador zera a
      // rolagem do fio, e voltar à conversa a devolveria ao topo.
      className={cn(
        "absolute inset-0 flex flex-col",
        visivel ? "visible" : "pointer-events-none invisible",
      )}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
        {conversa?.contact_id ? (
          <Link
            href={`/app/contacts/${conversa.contact_id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg focus-visible:outline-2"
            title={t("Abrir o cadastro do contato")}
          >
            <AvatarDoContato conversa={conversa} nome={nome} className="size-9" />
            <span className="block min-w-0">
              {/* `h2`: o título usa a fonte de títulos do sistema (Sora). */}
              <h2 className="truncate text-sm font-semibold text-foreground">{nome}</h2>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChannelLogo channel={conversa.channel_sessions} size={12} />
                <span className="truncate">{conversa.channel_sessions?.display_name ?? "WhatsApp"}</span>
              </span>
            </span>
          </Link>
        ) : (
          <span className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
          </span>
        )}
        <Button asChild size="icon" variant="ghost" className="size-8">
          <Link
            href={`/app/inbox?id=${conversationId}`}
            aria-label={t("Abrir no Inbox")}
            title={t("Abrir no Inbox")}
          >
            <ArrowSquareOut size={18} aria-hidden />
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={t("Minimizar chat")}
          title={t("Minimizar chat")}
          onClick={aoMinimizar}
        >
          <Minus size={18} aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={t("Fechar chat")}
          title={t("Fechar chat")}
          onClick={aoFechar}
        >
          <X size={18} aria-hidden />
        </Button>
      </header>

      {consulta.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <p role="alert">{t("Conversa não encontrada ou fora do seu acesso.")}</p>
          <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </div>
      ) : !conversa ? (
        <div className="space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-2/3" />
          ))}
        </div>
      ) : (
        <OpenConversationProvider conversationId={visivel ? conversationId : null}>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatThread
              conversationId={conversationId}
              provider={conversa.channel_sessions?.provider ?? null}
              onResponder={setRespondendo}
              dono={{
                userId: conversa.assigned_to_user_id ?? null,
                nome: conversa.assigned_to_user_name ?? null,
              }}
              contatoId={conversa.contacts?.id ?? null}
            />
          </div>
          <div className="max-h-[50%] shrink-0 overflow-y-auto">
            <RetentionNotice conversationId={conversationId} />
            {motivoDaJanela && (
              <JanelaFechadaAviso
                conversationId={conversationId}
                provider={conversa.channel_sessions?.provider ?? null}
                motivo={motivoDaJanela}
              />
            )}
            <Composer
              conversationId={conversationId}
              active={visivel}
              blockedReason={blockedReason}
              janelaFechada={motivoDaJanela}
              disabled={fechada}
              contactName={conversa.contacts?.name ?? null}
              contactDisplayName={conversa.contacts?.display_name}
              respondendo={respondendo}
              onCancelarResposta={() => setRespondendo(null)}
              currentContactId={conversa.contact_id}
            />
          </div>
        </OpenConversationProvider>
      )}
    </div>
  );
}
