"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { useQueryClient } from "@tanstack/react-query";
import { chaveDoQuadro } from "@/hooks/kanban/useBoard";
import { useMoveCard, type RecusaDeCampos, type RetomadaPendente } from "@/hooks/kanban/useMoveCard";
import { midpoint } from "@/lib/kanban/fractional-indexing";
import type { BoardData, Stage } from "@/lib/kanban/types";
import { CamposObrigatoriosDialog } from "./CamposObrigatoriosDialog";
import { RetomarComoNovoNegocioDialog } from "./RetomarComoNovoNegocioDialog";
import type { Lead } from "@/lib/types/leads";
import { cn } from "@/lib/utils";

const DIA_MS = 86_400_000;

/** Chevron: ponta à direita, entalhe à esquerda (menos na primeira etapa). */
const SETA = "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)";
const SETA_INICIAL = "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)";

/**
 * As etapas ABERTAS do funil, em fila, no topo do dossiê. Um clique move o
 * negócio pelo MESMO caminho do arrasto (`useMoveCard` → `/leads/{id}/move`,
 * com `expected_updated_at`): a recusa de campos obrigatórios abre o mesmo
 * diálogo do quadro e reenvia o mesmo move, em vez de virar toast de erro.
 * Ganho e perda ficam fora: têm botões próprios, porque perda pede motivo.
 *
 * Funil comprido rola na horizontal, e a etapa atual entra centralizada.
 */
export function TrilhoDeEtapas({
  lead,
  stages,
  pipelineId,
  podeMover,
}: {
  lead: Lead;
  stages: Stage[];
  pipelineId: string;
  podeMover: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [recusa, setRecusa] = useState<RecusaDeCampos | null>(null);
  const [retomada, setRetomada] = useState<RetomadaPendente | null>(null);
  const mover = useMoveCard(pipelineId, { onCamposFaltando: setRecusa, onRetomada: setRetomada });
  const atualRef = useRef<HTMLButtonElement | null>(null);
  // Lido uma vez por abertura: contar dias não precisa de relógio vivo.
  const [agora] = useState(() => Date.now());
  const abertas = stages.filter((s) => !s.is_won && !s.is_lost && !s.is_archived);
  const indiceAtual = abertas.findIndex((s) => s.id === lead.stage_id);
  const dias = lead.stage_changed_at
    ? Math.max(0, Math.floor((agora - new Date(lead.stage_changed_at).getTime()) / DIA_MS))
    : null;

  useEffect(() => {
    atualRef.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [lead.stage_id]);

  if (abertas.length === 0) return null;

  function escolher(stageId: string) {
    if (stageId === lead.stage_id || !podeMover || mover.isPending) return;
    // O negócio entra no TOPO da etapa: antes do primeiro card dela.
    const primeiro = qc
      .getQueryData<BoardData>(chaveDoQuadro(pipelineId))
      ?.leads.filter((l) => l.stage_id === stageId && l.id !== lead.id)
      .reduce<number | null>((min, l) => (min === null || l.position_in_stage < min ? l.position_in_stage : min), null);
    mover.mutate(
      {
        leadId: lead.id,
        stageId,
        positionInStage: midpoint(null, primeiro ?? null),
        expectedUpdatedAt: lead.updated_at,
      },
      { onSuccess: () => toast.success(t("Etapa atualizada.")) },
    );
  }

  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2" data-testid="trilho-de-etapas">
      <ol className="flex min-w-max">
        {abertas.map((s, i) => {
          const atual = s.id === lead.stage_id;
          const futura = indiceAtual >= 0 && i > indiceAtual;
          return (
            <li key={s.id} className={cn(i > 0 && "-ml-1.5")}>
              <button
                ref={atual ? atualRef : undefined}
                type="button"
                disabled={!podeMover || mover.isPending}
                aria-current={atual ? "step" : undefined}
                onClick={() => escolher(s.id)}
                title={s.name}
                data-testid={`trilho-etapa-${s.id}`}
                className={cn(
                  "flex h-11 w-32 flex-col items-center justify-center pl-4 pr-3 text-[11px] font-medium text-white transition-opacity",
                  futura && "opacity-45 hover:opacity-80",
                  atual && "font-semibold",
                  podeMover && !atual && "cursor-pointer",
                )}
                style={{
                  backgroundColor: s.color ?? "#94a3b8",
                  clipPath: i === 0 ? SETA_INICIAL : SETA,
                }}
              >
                <span className="w-full truncate text-center">{s.name}</span>
                {atual && dias !== null && (
                  <span className="mt-0.5 rounded-full bg-black/15 px-1.5 text-[10px]">
                    {dias === 1 ? t("1 dia") : `${dias} ${t("dias")}`}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <CamposObrigatoriosDialog
        open={recusa !== null}
        onOpenChange={(aberto) => !aberto && setRecusa(null)}
        recusa={recusa}
        isPending={mover.isPending}
        onConfirmar={({ customFields, wonReason }) => {
          if (!recusa) return;
          const { args } = recusa;
          setRecusa(null);
          mover.mutate({ ...args, customFields, ...(wonReason !== undefined ? { wonReason } : {}) });
        }}
      />
      {retomada && (
        <RetomarComoNovoNegocioDialog
          open
          onOpenChange={(v: boolean) => !v && setRetomada(null)}
          leadId={retomada.leadId}
          stageId={retomada.stageId}
          pipelineId={pipelineId}
        />
      )}
    </div>
  );
}
