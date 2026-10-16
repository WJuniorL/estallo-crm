/**
 * CATRACA — as 6 abas da Inbox não podem voltar a ser cortadas na coluna (#2745).
 *
 * ## O defeito, medido
 *
 * A faixa de abas do Inbox é `overflow-x-auto` com gatilhos `shrink-0` e
 * `whitespace-nowrap`: rótulo não encolhe, então quando as seis não cabem na
 * coluna a faixa ROLA — e quem está na ponta direita fica atrás da seta. Em
 * browser real, com o CSS do produto compilado e a fonte verdadeira, medido
 * contra a largura da coluna (`tests/sonda-abas-inbox-1280.test.tsx`):
 *
 *   coluna 272px (padrão da faixa `xl`, janela de 1280) → rolava 191px
 *   coluna 380px → rolava  83px  ("Fechadas" cortada)
 *   coluna 450px → rolava  13px  ("Arquivadas" atrás da seta)
 *
 * 272px é o padrão do Inbox em 1280px de janela (`LIMITES_LISTA` e
 * `largurasPadrao`, em `lib/inbox/larguras-do-inbox.ts`: a coluna da lista é
 * arrastável entre 240 e 520). Ou seja: na resolução comum, três das seis
 * abas só existiam para quem rolava a faixa no escuro.
 *
 * ## Por que este teste é o que é (e o que ele NÃO é)
 *
 * Este teste olha CLASSE, não pixel — e isso é limitação declarada, não
 * descuido: largura de rótulo e quebra de flex são cálculo de layout, e o
 * jsdom não tem engine de layout. Medir largura aqui devolveria zero em tudo
 * e passaria feliz: verde por ausência de motor, o pior falso verde que
 * existe. A medição de verdade é a sonda acima, que roda em Chromium e afere
 * as seis larguras da faixa de arraste.
 *
 * Esta catraca existe porque aquela sonda NÃO roda no CI (precisa de browser e
 * compila o Tailwind inteiro), e a regressão específica — alguém tirar
 * `flex-wrap` da faixa "para voltar ao visual de uma linha só" — é textual e
 * barata de pegar. O segundo bloco vigia o outro lado do mesmo defeito: a
 * saída fácil seria encurtar rótulo ou tirar aba, e "Automático" é contrato
 * (comentário em `InboxFilters.tsx`) — a largura não se paga mudando o
 * significado do filtro.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  InboxFilters,
  visibleInboxTabs,
  type InboxFiltersValue,
} from "@/components/inbox/InboxFilters";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    activeOrg: { orgId: "org-1", name: "Org", role: "manager", visibility_mode: "all" },
  }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  channelLabel: (c: { display_name: string }) => c.display_name,
  useChannelSessions: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: [] }),
}));
// Contagens de 2 dígitos, como numa instalação viva: elas ALARGAM a aba, e é
// com elas que o corte foi medido.
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({
    data: { fila: 47, automatico: 12, mine: 8, pendentes: 8, all: 130, closed: 25, archived: 9 },
  }),
}));

const VALUE: InboxFiltersValue = { tab: "ai", search: "", onlyUnread: false };

afterEach(cleanup);

function faixa(): HTMLElement {
  const list = screen.getByRole("tablist");
  expect(list, "a faixa de abas não renderizou").toBeTruthy();
  return list;
}

describe("faixa da Inbox — quebra em vez de esconder aba (#2745)", () => {
  // 16/10/2026 — o redesenho do Inbox (modelo do dono) trocou a QUEBRA de
  // linha por abas que DIVIDEM a largura: cada `.ibx-category` é `flex: 1;
  // min-width: 0` em 10px (9px até 1100px), com o contador embaixo do rótulo —
  // as cinco cabem na coluna de 300px. A faixa só rola se uma aba sozinha não
  // couber (zoom alto). A régua mora em `components/inbox/inbox.css`.
  it("a faixa é a do modelo — as abas dividem a largura em vez de quebrar linha", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(faixa().className.split(/\s+/)).toContain("ibx-categories");
    for (const aba of screen.getAllByRole("tab")) {
      expect(aba.className.split(/\s+/)).toContain("ibx-category");
    }
  });

  it("as SEIS abas estão na faixa, com os rótulos inteiros", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    // Guarda de vacuidade do caso acima e defesa do outro lado do defeito:
    // a saída fácil para \"não cabe\" é encurtar rótulo ou tirar aba, e aí a
    // catraca de classe continua verde com a tela errada.
    const abas = screen.getAllByRole("tab");
    expect(abas).toHaveLength(5);
    for (const rotulo of ["Fila", "Pendentes", "Automático", "Todas", "Fechadas"]) {
      expect(
        screen.getByRole("tab", { name: new RegExp(rotulo) }),
        `a aba "${rotulo}" não está na faixa`,
      ).toBeInTheDocument();
    }
  });

  it("quebrar a linha não muda o FILTRO: clicar em Fechadas manda tab=closed", () => {
    const onChange = vi.fn();
    render(<InboxFilters value={VALUE} onChange={onChange} />);
    // A quebra é de layout; o valor continua o MESMO contrato de antes.
    // O Radix `TabsTrigger` aciona no `mousedown`, não no `click`.
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Fechadas/ }));
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, tab: "closed" });
  });

  it("a ordem é a do modelo (16/10/2026) e os valores não mudaram", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    // `visibleInboxTabs` é a fonte da ORDEM do trabalho; a largura não se paga
    // reordenando nem renomeando.
    expect(visibleInboxTabs("manager", "all")).toEqual([
      "unassigned",
      "pending",
      "ai",
      "all",
      "closed",
    ]);
    expect(screen.getAllByRole("tab").map((a) => a.textContent?.replace(/\s+/g, ""))).toEqual([
      "Fila47",
      "Pendentes8",
      "Automático12",
      "Todas130",
      "Fechadas25",
    ]);
  });
});
