"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { MESES_DO_INTERVALO, mensalidadeEquivalente, NOME_DO_INTERVALO, POR_INTERVALO } from "@/lib/cobranca/intervalo";
import { INTERVALOS, type Intervalo } from "@/lib/cobranca/vocabulario";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { DESCONTO_DO_INTERVALO, NIVEIS_DA_ESTALLO, type PlanoDaVitrine } from "@/lib/planos/catalogo";
import { itensDoPlano } from "@/lib/planos/recursos";
import { cn } from "@/lib/utils";

export interface PropsDaEscolha {
  planos: readonly PlanoDaVitrine[];
  /** O plano da assinatura da empresa; `null` = vitrine ou empresa isenta. */
  atualId: string | null;
  /** A empresa pode trocar de plano agora (teste grátis ou em dia, sem cancelamento marcado). */
  podeEscolher: boolean;
  /** Assinatura viva no provedor: só o mesmo intervalo do plano atual é escolhível. */
  intervaloTravado: boolean;
}

/**
 * A vitrine de planos de Plano e cobrança: mensal, semestral e anual, três
 * níveis. No semestral e no anual o número grande é a MENSALIDADE equivalente
 * (decisão do dono, 12/11/2026); o valor cobrado no período fica pequeno embaixo.
 * Escolher troca o plano da assinatura (POST /plano); quem cobra é o Assinar.
 */
export function EscolhaDePlano({ planos, atualId, podeEscolher, intervaloTravado }: PropsDaEscolha) {
  const t = useT();
  const idioma = useIdioma();
  const router = useRouter();
  const atual = planos.find((p) => p.id === atualId) ?? null;
  const intervalos = INTERVALOS.filter((i) => planos.some((p) => p.intervalo === i));
  const [intervalo, setIntervalo] = useState<Intervalo>(atual?.intervalo ?? intervalos[0] ?? "mes");
  const [escolhendo, setEscolhendo] = useState<string | null>(null);

  const brl = (cents: number) =>
    new Intl.NumberFormat(idioma, { style: "currency", currency: "BRL", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  const usd = new Intl.NumberFormat(idioma, { style: "currency", currency: "USD", minimumFractionDigits: 0 });
  const compacto = new Intl.NumberFormat(idioma, { notation: "compact" });

  const doIntervalo = useMemo(() => planos.filter((p) => p.intervalo === intervalo), [planos, intervalo]);

  async function escolher(id: string) {
    setEscolhendo(id);
    try {
      await apiClient.post("/api/v1/cobranca/assinatura/plano", { plano_id: id });
      router.refresh();
    } catch (err) {
      showApiError(err);
    } finally {
      setEscolhendo(null);
    }
  }

  if (planos.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="escolha-de-plano">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="escolha-de-plano" className="text-lg font-semibold">
          {t("Escolha seu plano")}
        </h2>
        {intervalos.length > 1 && (
          <div role="radiogroup" aria-label={t("Período de cobrança")} className="inline-flex rounded-lg border border-border bg-surface p-1">
            {intervalos.map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={intervalo === i}
                onClick={() => setIntervalo(i)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  intervalo === i ? "bg-accent text-accent-foreground" : "text-text-muted hover:text-text",
                )}
              >
                {t(NOME_DO_INTERVALO[i])}
                {DESCONTO_DO_INTERVALO[i] > 0 && (
                  <span className={cn("ml-1.5 text-xs", intervalo === i ? "opacity-90" : "text-success-fg")}>
                    −{DESCONTO_DO_INTERVALO[i]}%
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {doIntervalo.map((p) => {
          const nivel = NIVEIS_DA_ESTALLO.find((n) => n.nome === p.nome);
          const ehAtual = p.id !== null && p.id === atualId;
          const bloqueadoPeloIntervalo = intervaloTravado && atual !== null && p.intervalo !== atual.intervalo;
          const meses = MESES_DO_INTERVALO[p.intervalo];
          return (
            <Card
              key={p.id ?? `${p.nome}-${p.intervalo}`}
              data-plano={p.nome}
              className={cn("flex flex-col gap-5 p-6", (ehAtual || nivel?.destaque) && "border-accent shadow-md")}
            >
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wider text-accent uppercase">
                  {ehAtual ? t("Seu plano") : nivel?.destaque ? t("Mais escolhido") : t("Plano")}
                </p>
                <h3 className="text-xl font-semibold">{p.nome}</h3>
                {nivel && <p className="mt-2 min-h-10 text-sm text-text-muted">{t(nivel.descricao)}</p>}
              </div>
              <div>
                <p>
                  <span className="text-3xl font-bold tracking-tight" data-mensalidade>
                    {brl(mensalidadeEquivalente(p.preco_cents, p.intervalo))}
                  </span>
                  <span className="ml-1 text-sm text-text-muted">{t("/mês")}</span>
                </p>
                <p className="mt-1 text-xs text-text-muted" data-periodo>
                  {meses === 1
                    ? t("Cobrança mensal recorrente")
                    : `${brl(p.preco_cents)} ${t(POR_INTERVALO[p.intervalo])} · ${t("cobrado de uma vez")}`}
                </p>
              </div>
              <ul className="space-y-2.5 text-sm text-text-muted">
                {itensDoPlano(p).map((item) => {
                  const n = item.n === undefined ? "" : item.usd ? usd.format(item.n / 100) : compacto.format(item.n);
                  return (
                    <li key={item.frase} className="flex gap-2">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-fg" />
                      <span>{t(item.frase).replace("{n}", n).replace("{e}", String(item.e ?? ""))}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-auto space-y-1">
                {p.id === null ? (
                  <Button disabled className="w-full" variant="secondary" title={t("A contratação abre quando a cobrança estiver ligada.")}>
                    {t("Contratação em breve")}
                  </Button>
                ) : ehAtual ? (
                  <Button disabled className="w-full" variant="secondary">
                    {t("Plano atual")}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={nivel?.destaque ? "primary" : "secondary"}
                    disabled={!podeEscolher || bloqueadoPeloIntervalo || escolhendo !== null}
                    onClick={() => void escolher(p.id!)}
                  >
                    {escolhendo === p.id ? t("Trocando…") : t("Escolher este plano")}
                  </Button>
                )}
                {bloqueadoPeloIntervalo && (
                  <p className="text-xs text-text-muted">{t("Para mudar o período da assinatura, cancele e assine de novo no período desejado.")}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

