"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { useBulkAction } from "@/hooks/kanban/useBulkAction";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";
import { cn } from "@/lib/utils";

const DIA_MS = 86_400_000;

/** Chevron: ponta à direita, entalhe à esquerda (menos na primeira etapa). */
const SETA = "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)";
const SETA_INICIAL = "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)";

/**
 * As etapas ABERTAS do funil, em fila, no topo do dossiê. Um clique move o
 * negócio (mesmo caminho do "Mover para…" do quadro, `/leads/bulk`, que aplica
 * campos obrigatórios, atividade e auditoria). Ganho e perda ficam fora: têm
 * botões próprios, porque perda pede motivo.
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
  const mover = useBulkAction(pipelineId);
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

  async function escolher(stageId: string) {
    if (stageId === lead.stage_id || !podeMover) return;
    try {
      await mover.mutateAsync({ action: "move", lead_ids: [lead.id], params: { stage_id: stageId } });
      toast.success(t("Etapa atualizada."));
    } catch {
      // o hook já mostrou o erro (ex.: campos obrigatórios da etapa)
    }
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
                onClick={() => void escolher(s.id)}
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
    </div>
  );
}
