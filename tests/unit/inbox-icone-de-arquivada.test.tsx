import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * O ÍCONE DE ARQUIVO SAI DO STATUS REAL DA CONVERSA, não da aba.
 *
 * A conversa fechada que ficou retida em outra aba (ver
 * `lib/inbox/lista-com-retidas.ts`) mostra o ícone ao lado do nome; na aba
 * "Fechadas" a lista desliga o ícone (`mostrarArquivada=false`), porque o
 * próprio filtro já diz isso. Conversa aberta nunca mostra.
 */

vi.mock("@/components/inbox/AcoesDaConversa", () => ({ AcoesDaConversa: () => null }));

afterEach(cleanup);

const base = {
  id: "c1",
  organization_id: "org",
  contact_id: "ct1",
  channel_session_id: "s1",
  channel: "whatsapp",
  status: "open",
  last_message_at: new Date().toISOString(),
  last_message_preview: "olá",
  unread_count_for_assignee: 0,
  created_at: new Date().toISOString(),
  contacts: {
    id: "ct1",
    display_name: "Cliente",
    name: null,
    phone_number: "+595999",
    tags: [],
    is_blocked: false,
    is_anonymized: false,
  },
} as unknown as ConversationWithContact;

const pintar = (status: string, mostrarArquivada: boolean) =>
  render(
    <ConversationListItem
      conversation={{ ...base, status } as ConversationWithContact}
      isSelected={false}
      onSelect={() => {}}
      mostrarArquivada={mostrarArquivada}
    />,
  );

describe("ícone de conversa arquivada no preview", () => {
  it("fechada fora da aba Fechadas: mostra", () => {
    pintar("closed", true);
    expect(screen.getByLabelText("Conversa fechada")).toBeInTheDocument();
  });

  it("fechada na aba Fechadas: não mostra", () => {
    pintar("closed", false);
    expect(screen.queryByLabelText("Conversa fechada")).not.toBeInTheDocument();
  });

  it("aberta, em qualquer aba: não mostra", () => {
    pintar("open", true);
    expect(screen.queryByLabelText("Conversa fechada")).not.toBeInTheDocument();
  });
});
