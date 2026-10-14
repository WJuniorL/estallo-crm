"use client";
import { useMemo } from "react";
import { useBoard } from "@/hooks/kanban/useBoard";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { LeadDossier } from "./LeadDossier";

/**
 * O MESMO dossiê do quadro, aberto fora dele (ex.: Leads recentes do inbox).
 *
 * Lê o quadro do funil do lead (`useBoard`, a mesma cache do kanban) em vez de
 * uma rota nova: o dossiê precisa do `Lead` completo, das etapas e dos campos,
 * e o quadro já entrega os três. Enquanto carrega, não desenha nada.
 */
export function LeadDossierDoFunil({
  pipelineId,
  leadId,
  onClose,
}: {
  pipelineId: string;
  leadId: string;
  onClose: () => void;
}) {
  const { data } = useBoard(pipelineId);
  const { data: members } = useAssignableMembers(true);
  const ownerNames = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m.full_name])),
    [members],
  );
  const lead = data?.leads.find((l) => l.id === leadId);
  if (!data || !lead) return null;

  return (
    <LeadDossier
      open
      onOpenChange={(v) => !v && onClose()}
      lead={lead}
      pipelineId={pipelineId}
      fieldDefs={camposDoFunil(data.pipeline.settings ?? null)}
      stageName={data.stages.find((s) => s.id === lead.stage_id)?.name ?? "—"}
      ownerNames={ownerNames}
    />
  );
}
