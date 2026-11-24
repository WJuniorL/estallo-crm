import { describe, expect, it } from "vitest";
import { listaComRetidas, reterQuemSaiu } from "@/lib/inbox/lista-com-retidas";

/**
 * Responder em "Em espera" muda o status e a lista relida não traz mais a
 * conversa: ela fica no lugar em que estava até o atendente trocar de aba.
 */
describe("listaComRetidas", () => {
  const c = (id: string) => ({ id });

  it("sem retidas, a lista do servidor passa intacta (mesma referência)", () => {
    const itens = [c("a"), c("b")];
    expect(listaComRetidas(itens, [])).toBe(itens);
  });

  it("a retida que saiu da lista volta na posição em que estava", () => {
    const depois = [c("a"), c("c")];
    expect(listaComRetidas(depois, [{ conversa: c("b"), indice: 1 }]).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("a retida que continua na lista não duplica", () => {
    expect(
      listaComRetidas([c("a"), c("b")], [{ conversa: c("b"), indice: 0 }]).map((x) => x.id),
    ).toEqual(["a", "b"]);
  });

  it("posição além do fim vai para o fim; várias retidas mantêm a ordem", () => {
    const out = listaComRetidas(
      [c("x")],
      [
        { conversa: c("r2"), indice: 9 },
        { conversa: c("r1"), indice: 0 },
      ],
    );
    expect(out.map((x) => x.id)).toEqual(["r1", "x", "r2"]);
  });
});

describe("reterQuemSaiu — a lista é uma fotografia, seja quem for que mudou o status", () => {
  const c = (id: string) => ({ id });

  it("quem estava na tela e sumiu da resposta nova fica retido na posição de antes", () => {
    const retidas = reterQuemSaiu([c("a"), c("b"), c("c")], [c("a"), c("c")], []);
    expect(retidas).toEqual([{ conversa: c("b"), indice: 1 }]);
    expect(listaComRetidas([c("a"), c("c")], retidas).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("não duplica quem já estava retido e devolve a mesma referência quando nada saiu", () => {
    const ja = [{ conversa: c("b"), indice: 1 }];
    expect(reterQuemSaiu([c("a"), c("b")], [c("a")], ja)).toBe(ja);
    expect(reterQuemSaiu([c("a")], [c("a"), c("z")], ja)).toBe(ja);
  });

  it("conversa nova que entra na etapa aparece normalmente (só a saída é segurada)", () => {
    const retidas = reterQuemSaiu([c("a")], [c("n"), c("a")], []);
    expect(retidas).toEqual([]);
  });
});
