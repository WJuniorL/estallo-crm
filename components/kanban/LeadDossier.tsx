"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLeadTimeline } from "@/hooks/leads/useLeadTimeline";
import type { Lead } from "@/lib/types/leads";
import { ContatoDoNegocio } from "./ContatoDoNegocio";
import { ConversaNoDossie } from "./ConversaNoDossie";
import { LeadFieldsForm } from "./LeadFieldsForm";
import { ScoreSlot } from "./ScoreSlot";
import { LeadTimeline } from "./LeadTimeline";
import { PropostasDoNegocio } from "./PropostasDoNegocio";
import { TarefasDoNegocio } from "./TarefasDoNegocio";
import { OwnerBadge } from "./OwnerBadge";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import type { Stage } from "@/lib/kanban/types";
import { Button } from "@/components/ui/button";
import { Check, Funnel, X } from "@/lib/ui/icons";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { TrilhoDeEtapas } from "./TrilhoDeEtapas";
import { LoseLeadDialog } from "./LoseLeadDialog";
import { MoveToOtherPipelineDialog } from "./MoveToOtherPipelineDialog";
import { formatValorDoNegocio, MOEDA_PADRAO } from "@/lib/money";
import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
  fieldDefs?: CustomFieldDef[];
  stageName: string;
  ownerNames?: Map<string, string | null>;
  /** As etapas do funil — alimentam o trilho do topo. Sem elas, não há trilho. */
  stages?: Stage[];
}

function formatValor(cents: number | null, currency: string | null): string {
  // Mesma régua e mesmo locale do card e do total da coluna (`formatValorDoNegocio`).
  if (cents === null) return "—";
  return formatValorDoNegocio(cents, currency ?? MOEDA_PADRAO, { semCentavos: true });
}

/**
 * O dossiê do negócio: cabeçalho vivo → timeline → campos.
 *
 * A ORDEM É a mudança em relação ao diálogo de edição: quem abre um lead quer
 * primeiro saber O QUE ACONTECEU, e só depois mexer. O formulário íntegro fica
 * por último, e o cabeçalho tem um atalho para ele — ordem preservada, custo de
 * rolagem resolvido.
 *
 * SALVAR NÃO FECHA. Quem edita precisa ver a atividade que acabou de gerar
 * entrar na timeline; fechar esconderia o registro justamente de quem o
 * produziu, e a funcionalidade que prova "sua ação fica registrada" provaria
 * isso para todo mundo menos para o autor.
 */
export function LeadDossier({
  open,
  onOpenChange,
  lead,
  pipelineId,
  fieldDefs = [],
  stageName,
  ownerNames,
  stages,
}: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const campos = useRef<HTMLDivElement | null>(null);
  const timeline = useLeadTimeline(open ? lead.id : null, lead.contact_id);
  const owner = resolveLeadOwner(lead, ownerNames);
  const score = lead.score ?? null;
  // N1 — o atalho "Nova proposta" é manager+ (mesmo gate do envio, mesma
  // régua do BulkActionBar). O dossiê não tinha nenhuma checagem de papel;
  // esta é a primeira, no padrão já estabelecido do kanban.
  const user = useUser();
  const activeOrg = useActiveOrg();
  const podeCriarProposta =
    user.is_platform_admin || (activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager) || false;
  // Tarefas são `agent`+, a mesma régua da tela de Tarefas e da rota — e o
  // suporte temporário só lê, como lá (`requireSupportWrite`).
  const podeEditarTarefas =
    (user.is_platform_admin && !user.support) ||
    (activeOrg ? ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent : false);
  // Mover, ganhar, perder e trocar de funil: a mesma régua (agent+, sem
  // suporte só-leitura) das rotas de mover, ganhar, perder e trocar de funil.
  const podeMover = podeEditarTarefas;
  const aberto = lead.status === "open";
  const ganhar = useWinLead(pipelineId);
  const [perderAberto, setPerderAberto] = useState(false);
  const [moverAberto, setMoverAberto] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md"
        // Observável pelo mesmo motivo do board: "a assinatura morreu" e "nada
        // aconteceu" têm a mesma aparência, que é silêncio.
        data-realtime-status={timeline.realtimeStatus.toLowerCase()}
        // Observável como no board: "a entrega morreu" e "nada aconteceu"
        // têm a mesma aparência, e no dossiê a segunda é ainda mais crível —
        // negócio sem novidade é um estado normal.
        data-refetch-divergencias={timeline.seguranca.divergencias}
      >
        <SheetHeader className="pb-3 pr-8">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-base leading-6">{lead.title}</SheetTitle>
            {podeMover && aberto && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => setMoverAberto(true)}
                data-testid="dossie-mover-de-funil"
              >
                <Funnel size={12} className="mr-1" aria-hidden />
                {t("Mover de funil")}
              </Button>
            )}
          </div>
        </SheetHeader>

        {stages && stages.length > 0 && (
          <div className="flex items-center gap-2 pb-3">
            <div className="min-w-0 flex-1">
              <TrilhoDeEtapas
                lead={lead}
                stages={stages}
                pipelineId={pipelineId}
                podeMover={podeMover && aberto}
              />
            </div>
            {podeMover && aberto && (
              <div className="flex shrink-0 gap-1 pb-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                  aria-label={t("Marcar como perdido")}
                  title={t("Marcar como perdido")}
                  onClick={() => setPerderAberto(true)}
                  data-testid="dossie-perder"
                >
                  <X size={16} weight="bold" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-success/40 text-success hover:bg-success/10"
                  aria-label={t("Marcar como ganho")}
                  title={t("Marcar como ganho")}
                  disabled={ganhar.isPending}
                  onClick={() => ganhar.mutate({ leadId: lead.id })}
                  data-testid="dossie-ganhar"
                >
                  <Check size={16} weight="bold" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ① cabeçalho vivo */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-3 text-xs">
          <span className="font-medium tabular-nums text-text">
            {formatValor(lead.value_cents, lead.currency)}
          </span>
          <span className="text-text-muted">{stageName}</span>
          <OwnerBadge
            ownerKind={owner.kind}
            ownerName={owner.name}
            agentVersion={owner.agentVersion}
          />
          {score && (
            // O MESMO componente do card, não uma cópia do medidor.
            // "Superfície nova herda as decisões da antiga" só vale como
            // mecanismo: herdar por cópia é como as duas listas do evidence —
            // funciona hoje e diverge no mês em que alguém mudar um dos dois.
            // De brinde, o rótulo honesto da âncora ("registro que sustenta",
            // nunca "momento da conversa") vem junto, sem eu reescrever nada.
            <ScoreSlot
              probability={score.probability}
              band={score.band}
              reason={score.reason}
              factors={score.factors.slice(0, 3)}
            />
          )}

          <button
            type="button"
            onClick={() => campos.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="ml-auto text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            {t("Editar campos")}
          </button>
        </div>

        {/* O score NÃO aparece na timeline: recálculo é telemetria e não emite
            atividade (silêncio para telemetria, pulso para mudança de estado).
            Sem esta linha, quem visse o número mudando no cabeçalho e nunca na
            timeline concluiria que a timeline está incompleta. */}
        {score?.at && (
          <p className="pt-2 text-[11px] text-text-muted">
            {t("Probabilidade recalculada automaticamente")} ·{" "}
            {new Date(score.at).toLocaleString(tagDoIdioma)}
          </p>
        )}

        <ConversaNoDossie
          conversa={lead.conversa}
          contactId={lead.contact_id}
          phone={lead.contact_phone}
        />

        {/* Os dados do CLIENTE: telefone e e-mail numa aba, links (Instagram,
            site, Google Meu Negócio…) na outra. Vêm do contato, não do lead. */}
        <section className="border-b border-border py-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("Contato")}
          </h3>
          <ContatoDoNegocio
            contactId={lead.contact_id}
            pipelineId={pipelineId}
            leadId={lead.id}
            lead={{ pipeline_id: lead.pipeline_id, stage_id: lead.stage_id }}
          />
        </section>

        {/* As tarefas ANTES da linha do tempo: a timeline conta o que já
            aconteceu, a tarefa é o que ainda falta fazer — e quem abre o card
            para agir procura o próximo passo primeiro. */}
        <TarefasDoNegocio
          leadId={lead.id}
          contactId={lead.contact_id}
          podeEditar={podeEditarTarefas}
          aberto={open}
        />

        {/* ② timeline */}
        <section className="flex-1 py-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("Linha do tempo")}
          </h3>
          <LeadTimeline
            itens={timeline.itens}
            chegouAoVivo={timeline.chegouAoVivo}
            isLoading={timeline.isLoading}
            isError={timeline.isError}
          />
        </section>

        {/* ③ campos, por último */}
        <div ref={campos} className="border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("Dados do negócio")}
          </h3>
          <LeadFieldsForm lead={lead} pipelineId={pipelineId} fieldDefs={fieldDefs} />
        </div>

        {/* N1 — seção "Propostas", depois de "Dados do negócio". Some sozinha
            (null) quando a capacidade está desligada — ver PropostasDoNegocio. */}
        <PropostasDoNegocio
          leadId={lead.id}
          pipelineId={pipelineId}
          podeCriar={podeCriarProposta}
        />
        <LoseLeadDialog
          open={perderAberto}
          onOpenChange={setPerderAberto}
          leadId={lead.id}
          pipelineId={pipelineId}
        />
        <MoveToOtherPipelineDialog
          open={moverAberto}
          onOpenChange={setMoverAberto}
          leadId={lead.id}
          pipelineId={pipelineId}
          expectedUpdatedAt={lead.updated_at}
        />
      </SheetContent>
    </Sheet>
  );
}
