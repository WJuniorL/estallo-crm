import { describe, expect, it } from "vitest";

import { encaminhamentoDoPayload, type WahaPayload } from "./ingest";

const comContexto = (contextInfo: Record<string, unknown> | undefined) =>
  ({ id: "x", _data: { message: { extendedTextMessage: { text: "oi", contextInfo } } } }) as unknown as WahaPayload;

describe("mensagem encaminhada (contextInfo do WhatsApp)", () => {
  it("marca a encaminhada e a encaminhada com frequência (5+)", () => {
    expect(encaminhamentoDoPayload(comContexto({ isForwarded: true, forwardingScore: 1 }))).toEqual({
      forwarded: true,
      forwarded_many: false,
    });
    expect(encaminhamentoDoPayload(comContexto({ isForwarded: true, forwardingScore: 5 }))).toEqual({
      forwarded: true,
      forwarded_many: true,
    });
  });

  it("mensagem comum e resposta citada não são encaminhadas", () => {
    expect(encaminhamentoDoPayload(comContexto(undefined))).toBeNull();
    expect(encaminhamentoDoPayload(comContexto({ stanzaId: "abc", quotedMessage: { conversation: "x" } }))).toBeNull();
    expect(encaminhamentoDoPayload({ id: "x" } as unknown as WahaPayload)).toBeNull();
  });
});
