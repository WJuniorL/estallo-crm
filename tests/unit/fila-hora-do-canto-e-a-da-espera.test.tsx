import { render, screen } from "@testing-library/react";
import { format, subDays } from "date-fns";
import { describe, expect, it, vi } from "vitest";

import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * A ESPERA DA FILA SAI DA MESMA RÉGUA QUE ORDENA A LISTA (#990, #464).
 *
 * Desde o redesenho do Inbox (16/10/2026, modelo do dono) o canto da linha
 * mostra SEMPRE a hora da última mensagem, e a espera foi para a linha de
 * operação, por extenso: "3º na fila · Espera de 9d". O que esta suíte prende
 * não mudou: a espera é contada de `awaiting_since` (a mensagem mais antiga sem
 * resposta) — nunca da última do cliente, da atividade ou da criação — com o
 * mesmo fallback da régua (`esperaDaConversa`).
 */

vi.mock("@/components/inbox/AcoesDaConversa", () => ({ AcoesDaConversa: () => null }));

const agora = new Date();
const espera = subDays(agora, 9).toISOString();
const ultimaDoCliente = subDays(agora, 1).toISOString();
const atividade = subDays(agora, 12).toISOString();
const criacao = subDays(agora, 300).toISOString();

const horaDaAtividade = format(new Date(atividade), "dd/MM");

const base = {
  id: "c1",
  organization_id: "org",
  contact_id: "ct1",
  channel_session_id: "s1",
  channel: "whatsapp",
  status: "open",
  last_message_at: atividade,
  last_inbound_at: ultimaDoCliente,
  awaiting_since: espera,
  last_message_preview: "olá",
  unread_count_for_assignee: 0,
  created_at: criacao,
  contacts: { id: "ct1", display_name: "Cliente", name: null, phone_number: "+595999", tags: [], is_blocked: false, is_anonymized: false },
} as unknown as ConversationWithContact;

const pintar = (conv: ConversationWithContact, queuePosition?: number) =>
  render(
    <ConversationListItem
      conversation={conv}
      isSelected={false}
      onSelect={() => {}}
      queuePosition={queuePosition}
      mostrarCanal={false}
    />,
  );

describe("na Fila, a espera é a da ordem", () => {
  it("⭐ a linha diz a posição e a ESPERA — a mensagem mais antiga sem resposta (9 dias)", () => {
    pintar(base, 3);
    expect(screen.getByText(/3º na fila/)).toBeInTheDocument();
    expect(screen.getByText(/Espera de 9d/)).toBeInTheDocument();
  });

  it("⭐ não é a ÚLTIMA mensagem do cliente (1 dia), nem a criação (300 dias)", () => {
    pintar(base, 3);
    expect(screen.queryByText(/Espera de 1d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Espera de 300d/)).not.toBeInTheDocument();
  });

  it("⭐ sem mensagem do cliente, cai no MESMO fallback da régua (a criação)", () => {
    pintar(
      { ...base, awaiting_since: null, last_inbound_at: null } as unknown as ConversationWithContact,
      1,
    );
    expect(screen.getByText(/Espera de 300d/)).toBeInTheDocument();
  });

  it("o canto mostra a hora da última mensagem, como no modelo", () => {
    pintar(base, 3);
    expect(screen.getByText(horaDaAtividade)).toBeInTheDocument();
  });
});

describe("fora da Fila", () => {
  it("CONTROLE: sem posição na fila, não há linha de espera", () => {
    pintar(base);
    expect(screen.getByText(horaDaAtividade)).toBeInTheDocument();
    expect(screen.queryByText(/Espera de/)).not.toBeInTheDocument();
  });
});
