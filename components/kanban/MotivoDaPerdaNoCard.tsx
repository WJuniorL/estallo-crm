"use client";
import { useT } from "@/hooks/i18n/useT";
import { ROTULO_DO_MOTIVO_CANONICO } from "@/lib/schemas/leads";

/**
 * Por que o negócio se perdeu — só na etapa de perda e só com motivo gravado.
 * Canônico vira o rótulo traduzido; motivo próprio do funil é dado e sai como está
 * (a mesma régua do filtro "Motivo" do `FilterBar`).
 */
export function MotivoDaPerdaNoCard({
  etapaDePerda,
  motivo,
}: {
  etapaDePerda: boolean;
  motivo: string | null;
}) {
  const t = useT();
  const limpo = motivo?.trim();
  if (!etapaDePerda || !limpo) return null;
  return (
    <p className="mt-1.5 truncate text-xs text-text-muted" data-testid="card-motivo-da-perda">
      {t("Motivo da perda")}:{" "}
      <span className="font-medium text-text">
        {Object.hasOwn(ROTULO_DO_MOTIVO_CANONICO, limpo)
          ? // Acesso por índice DENTRO do t(): o gate de i18n confere cada rótulo da tabela.
            t(ROTULO_DO_MOTIVO_CANONICO[limpo as keyof typeof ROTULO_DO_MOTIVO_CANONICO])
          : limpo}
      </span>
    </p>
  );
}
