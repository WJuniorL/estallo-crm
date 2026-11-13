import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRefetchDeSeguranca } from "./useRefetchDeSeguranca";

/**
 * Aba escondida não relê: cada aba esquecida aberta relia a lista a cada 45 s o dia todo, e isso somou no egress
 * que estourou o plano gratuito do Supabase (13/11/2026). Ao voltar para a aba, relê na hora.
 */
describe("refetch de segurança em aba escondida", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("não relê enquanto a aba está escondida e relê ao voltar", () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    const releitura = vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);
    const visibilidade = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    renderHook(
      () => useRefetchDeSeguranca({ queryKey: ["x"], assinatura: () => "", ultimaEntrega: { current: null }, intervaloMs: 1000 }),
      { wrapper },
    );

    act(() => vi.advanceTimersByTime(5000));
    expect(releitura).not.toHaveBeenCalled();

    visibilidade.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(releitura).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(releitura).toHaveBeenCalledTimes(2);
  });
});
