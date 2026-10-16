"use client";

import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useEffect, useState } from "react";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoDeDinheiro } from "@/components/ui/campo-de-dinheiro";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import type { Lead } from "@/lib/types/leads";
import { updateLeadSchema, type UpdateLeadInput } from "@/lib/schemas/leads";
import { centavosParaCampo, formatCents, MOEDA_PADRAO, parseReaisToCents, simboloDaMoeda } from "@/lib/money";
import { ROLE_RANK } from "@/lib/auth/types";
import { useProdutosDoNegocio } from "@/hooks/leads/useProdutosDoNegocio";
import { totalDoItem, type ProdutoDoNegocio } from "@/lib/schemas/produtos-do-negocio";
import { rascunhoMudou, type ItemDoRascunho } from "@/lib/leads/rascunho-de-produtos";
import { soChavesAlteradas } from "@/lib/leads/custom-fields-so-diff";
import { CustomFieldsEditor, type CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import { SeletorDeTags } from "@/components/tags/SeletorDeTags";
import { ProdutosDoNegocio } from "./ProdutosDoNegocio";

interface FormShape {
  title: string;
  description: string;
  valueReais: string;
  expected_close_date: string;
}

interface Props {
  lead: Lead;
  pipelineId: string;
  fieldDefs?: CustomFieldDef[];
  /** Quando o salvamento dá certo. O dossiê NÃO fecha aqui — ver abaixo. */
  onSaved?: () => void;
  /** O dossiê não tem "cancelar"; o diálogo tem. */
  onCancel?: () => void;
  /** O `id` do `<form>` — o botão FIXO do dossiê o submete de fora. */
  formId?: string;
  /** Sem a linha de botões: o dossiê desenha o "Salvar" fixo no rodapé. */
  semBotoes?: boolean;
  /** Há alteração não salva? Está salvando? (o rodapé e a pergunta ao sair). */
  onEstado?: (e: { pendente: boolean; salvando: boolean }) => void;
  onErroAoSalvar?: () => void;
}

const mesmasTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Os campos do lead — extraídos do `EditLeadDialog` para o dossiê usar os
 * MESMOS, em vez de uma cópia que diverge no mês.
 *
 * `onSaved` existe para o dossiê NÃO FECHAR ao salvar: quem edita precisa ver a
 * atividade que acabou de gerar entrar na timeline. Fechar esconderia o
 * registro justamente de quem o produziu — a funcionalidade que prova "sua ação
 * fica registrada" provaria isso para todo mundo menos para o autor.
 */
export function LeadFieldsForm({
  lead,
  pipelineId,
  fieldDefs: todosOsCampos = [],
  onSaved,
  onCancel,
  formId,
  semBotoes = false,
  onEstado,
  onErroAoSalvar,
}: Props) {
  // Campo restrito a etapas (cadastro central, 0657) só aparece na etapa do lead.
  const fieldDefs = todosOsCampos.filter(
    (f) => !f.etapas_visiveis || f.etapas_visiveis.includes(lead.stage_id),
  );
  const t = useT();
  const org = useActiveOrg();
  // A moeda do negócio JÁ GRAVADO vence: trocar a moeda da empresa não
  // reescreve o que nasceu antes, e o cartão e o dossiê mostram a persistida.
  const moedaDoValor = lead.currency ?? org?.currency ?? MOEDA_PADRAO;
  const edit = useEditLead(pipelineId);
  const user = useUser();
  // Produtos são `agent`+, a régua da rota (e o suporte temporário só lê).
  const podeEditarProdutos =
    (user.is_platform_admin && !user.support) ||
    (org ? ROLE_RANK[org.role] >= ROLE_RANK.agent : false);
  // Com produtos, o valor do negócio é a SOMA deles (trigger da 0660): o campo
  // vira leitura e o salvar não manda `value_cents`, senão sobrescreveria a conta.
  const produtos = useProdutosDoNegocio(lead.id, pipelineId);
  // NADA da ficha grava antes do "Salvar" — produtos inclusive. O rascunho
  // nasce do que está gravado e só vai ao servidor no `onSubmit`. Enquanto não
  // há alteração, ele acompanha o servidor (outra aba, outra pessoa).
  const [rascunho, setRascunho] = useState<ItemDoRascunho[]>([]);
  const [gravado, setGravado] = useState<ProdutoDoNegocio[] | undefined>(undefined);
  if (produtos.data !== gravado) {
    if (!gravado || !rascunhoMudou(gravado, rascunho)) setRascunho(produtos.data ?? []);
    setGravado(produtos.data);
  }
  const valorPelosProdutos =
    rascunho.length > 0 ? rascunho.reduce((s, i) => s + totalDoItem(i), 0) : null;
  const [salvando, setSalvando] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(lead.custom_fields ?? {});
  // A RÉGUA do diff (issue #2132): o valor carregado ao abrir. Só o que a
  // pessoa mudar daqui vai viajar — devolver o objeto inteiro sobrescrevia o
  // que outra pessoa (ou o MCP `crm_update_lead`) mudou com a ficha aberta.
  const [camposCarregados, setCamposCarregados] = useState<Record<string, unknown>>(
    lead.custom_fields ?? {},
  );

  // Etiquetas de OPORTUNIDADE: as cadastradas (tela Tags) ou criadas na hora.
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [tagsCarregadas, setTagsCarregadas] = useState<string[]>(lead.tags ?? []);

  const form = useForm<FormShape>({
    defaultValues: {
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centavosParaCampo(lead.value_cents),
      expected_close_date: lead.expected_close_date ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centavosParaCampo(lead.value_cents),
      expected_close_date: lead.expected_close_date ?? "",
    });
    setCustomFields(lead.custom_fields ?? {});
    setCamposCarregados(lead.custom_fields ?? {});
    setTags(lead.tags ?? []);
    setTagsCarregadas(lead.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  // ALTERAÇÃO PENDENTE: qualquer coisa diferente do que está gravado.
  const produtosMudaram = gravado !== undefined && rascunhoMudou(gravado, rascunho);
  const pendente =
    form.formState.isDirty ||
    !mesmasTags(tags, tagsCarregadas) ||
    Object.keys(soChavesAlteradas(camposCarregados, customFields)).length > 0 ||
    produtosMudaram;
  useEffect(() => {
    onEstado?.({ pendente, salvando });
  }, [onEstado, pendente, salvando]);

  async function onSubmit(values: FormShape) {
    const reais = values.valueReais.trim();
    let valueCents: number | null = null;
    if (reais.length > 0) {
      valueCents = parseReaisToCents(reais);
      if (valueCents === null) {
        form.setError("valueReais", { message: t("Valor inválido") });
        return;
      }
    }

    const patch: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      ...(valorPelosProdutos === null ? { value_cents: valueCents } : {}),
      tags,
      expected_close_date: values.expected_close_date || null,
      // Só o que a pessoa alterou (issue #2132) — o merge continua do servidor.
      ...(fieldDefs.length > 0
        ? { custom_fields: soChavesAlteradas(camposCarregados, customFields) }
        : {}),
    };

    const parsed = updateLeadSchema.safeParse(patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? t("Dados inválidos"));
      return;
    }

    setSalvando(true);
    try {
      // Produtos ANTES do lead: a trigger recalcula o valor pela soma.
      if (produtosMudaram) {
        try {
          await produtos.gravar(rascunho);
        } catch (erro) {
          showApiError(erro);
          throw erro;
        }
      }
      await edit.mutateAsync({
        leadId: lead.id,
        patch: parsed.data as UpdateLeadInput,
      });
      // O que acabou de gravar vira a nova régua: o segundo salvamento não
      // reenvia o primeiro, e uma limpeza alheia no intervalo não é atropelada.
      setCamposCarregados({ ...customFields });
      setTagsCarregadas(tags);
      form.reset(values);
      toast.success(t("Lead atualizado"));
      onSaved?.();
    } catch {
      // o toast do erro já foi mostrado (aqui ou no `useEditLead`)
      onErroAoSalvar?.();
    } finally {
      setSalvando(false);
    }
  }


  return (
    <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">{t("Título")}</Label>
          <Input
            id="title"
            {...form.register("title", { required: true, minLength: 2 })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t("Descrição")}</Label>
          <Textarea id="description" rows={3} {...form.register("description")} />
        </div>

        <ProdutosDoNegocio
          itens={rascunho}
          onChange={setRascunho}
          moeda={moedaDoValor}
          podeEditar={podeEditarProdutos}
        />

        <div className="grid grid-cols-2 gap-3">
          {valorPelosProdutos !== null ? (
            <div className="space-y-2">
              <Label htmlFor="valorPelosProdutos">{t("Valor")} ({simboloDaMoeda(moedaDoValor)})</Label>
              <Input
                id="valorPelosProdutos"
                readOnly
                value={formatCents(valorPelosProdutos, moedaDoValor)}
                data-testid="valor-pelos-produtos"
              />
              <p className="text-xs text-muted-foreground">{t("Calculado pelos produtos, já com os descontos.")}</p>
            </div>
          ) : (
          <div className="space-y-2">
            {/* O rótulo segue a moeda do NEGÓCIO (a organização é a reserva):
                  `R$` em duro mentia para quem opera em euro. */}
            <Label htmlFor="valueReais">{t("Valor")} ({simboloDaMoeda(moedaDoValor)})</Label>
            {/* A máscara É o eco: o que aparece no campo é o que será gravado. */}
            <CampoDeDinheiro id="valueReais" moeda={moedaDoValor} {...form.register("valueReais")} />
            {form.formState.errors.valueReais && (
              <p className="text-xs text-error-fg">
                {t(form.formState.errors.valueReais.message ?? "")}
              </p>
            )}
          </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="expected_close_date">{t("Fechamento previsto")}</Label>
            <Input
              id="expected_close_date"
              type="date"
              {...form.register("expected_close_date")}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("Tags")}</Label>
          <SeletorDeTags entidade="lead" valor={tags} onChange={setTags} rotulo={t("Tags da oportunidade")} />
        </div>

        {fieldDefs.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">{t("Campos personalizados")}</p>
            <CustomFieldsEditor
              fields={fieldDefs}
              value={customFields}
              onChange={setCustomFields}
              mode="lead"
            />
          </div>
        )}

      {!semBotoes && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={salvando}>
              {t("Cancelar")}
            </Button>
          )}
          <Button type="submit" disabled={salvando}>
            {salvando ? t("Salvando…") : t("Salvar")}
          </Button>
        </div>
      )}
    </form>
  );
}
