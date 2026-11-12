"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { NOME_DO_INTERVALO, POR_INTERVALO } from "@/lib/cobranca/intervalo";
import { INTERVALOS, type Intervalo } from "@/lib/cobranca/vocabulario";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { novoPlanoSchema } from "@/lib/schemas/cobranca-plano";
import { CampoDeDinheiro } from "@/components/ui/campo-de-dinheiro";
import { parseReaisToCents, centavosParaCampo } from "@/lib/money";

/** Um plano de `cobranca_planos` como a tela o recebe (COLUNAS_DO_PLANO). */
export interface PlanoDaTela {
  id: string;
  nome: string;
  preco_cents: number;
  intervalo: Intervalo;
  trial_dias: number;
  max_assentos: number | null;
  max_canais: number | null;
  teto_ia_usd_cents: number | null;
  max_pipelines: number | null;
  max_etapas_por_pipeline: number | null;
  max_leads: number | null;
  max_automacoes: number | null;
  max_webhooks: number | null;
  libera_api: boolean;
  padrao_no_cadastro: boolean;
  /** false = só o dono atribui (plano negociado): a empresa não o vê nem o escolhe. */
  oferecido_ao_cliente: boolean;
  arquivado_em: string | null;
}

interface Campos {
  nome: string;
  preco: string;
  intervalo: Intervalo;
  trial_dias: string;
  max_assentos: string;
  max_canais: string;
  teto_ia: string;
  max_pipelines: string;
  max_etapas_por_pipeline: string;
  max_leads: string;
  max_automacoes: string;
  max_webhooks: string;
  libera_api: boolean;
}

const VAZIO: Campos = {
  nome: "", preco: "", intervalo: "mes", trial_dias: "14", max_assentos: "", max_canais: "", teto_ia: "",
  max_pipelines: "", max_etapas_por_pipeline: "", max_leads: "", max_automacoes: "", max_webhooks: "", libera_api: true,
};
const texto = (n: number | null) => (n === null ? "" : String(n));
const AVISO_DE_CAMPOS =
  "Confira os campos do plano: preço a partir de R$ 5,00, teste grátis de 0 a 90 dias, limites a partir de 1 e etapas a partir de 2.";

// Mesma leitura de todo campo de dinheiro: "1.500" é mil e quinhentos, não 1,50.
const centavos = (v: string) => parseReaisToCents(v) ?? 0;
const inteiroOuNulo = (v: string) => (v.trim() === "" ? null : Number(v));
const decimal = (cents: number) => centavosParaCampo(cents);

/** O corpo que as rotas de plano recebem. Campo de limite vazio = sem limite (null). */
function corpoDoPlano(c: Campos) {
  return {
    nome: c.nome.trim(),
    preco_cents: centavos(c.preco),
    intervalo: c.intervalo,
    trial_dias: Number(c.trial_dias),
    max_assentos: inteiroOuNulo(c.max_assentos),
    max_canais: inteiroOuNulo(c.max_canais),
    teto_ia_usd_cents: c.teto_ia.trim() === "" ? null : centavos(c.teto_ia),
    max_pipelines: inteiroOuNulo(c.max_pipelines),
    max_etapas_por_pipeline: inteiroOuNulo(c.max_etapas_por_pipeline),
    max_leads: inteiroOuNulo(c.max_leads),
    max_automacoes: inteiroOuNulo(c.max_automacoes),
    max_webhooks: inteiroOuNulo(c.max_webhooks),
    libera_api: c.libera_api,
  };
}

function camposDe(p: PlanoDaTela): Campos {
  return {
    nome: p.nome,
    preco: decimal(p.preco_cents),
    intervalo: p.intervalo,
    trial_dias: String(p.trial_dias),
    max_assentos: p.max_assentos === null ? "" : String(p.max_assentos),
    max_canais: p.max_canais === null ? "" : String(p.max_canais),
    teto_ia: p.teto_ia_usd_cents === null ? "" : decimal(p.teto_ia_usd_cents),
    max_pipelines: texto(p.max_pipelines),
    max_etapas_por_pipeline: texto(p.max_etapas_por_pipeline),
    max_leads: texto(p.max_leads),
    max_automacoes: texto(p.max_automacoes),
    max_webhooks: texto(p.max_webhooks),
    libera_api: p.libera_api,
  };
}

/**
 * Planos da instalação (spec da cobrança §9, aba Planos): criar, editar,
 * arquivar e marcar o plano do cadastro. Quem recusa de verdade é a rota (e o
 * CHECK); o formulário só evita a ida e volta no erro óbvio.
 */
export function PlanosDaInstalacao({ planos }: { planos: readonly PlanoDaTela[] }) {
  const t = useT();
  const idioma = useIdioma();
  const router = useRouter();
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const brl = new Intl.NumberFormat(idioma, { style: "currency", currency: "BRL" });
  const usd = new Intl.NumberFormat(idioma, { style: "currency", currency: "USD" });
  const campo = (k: Exclude<keyof Campos, "intervalo" | "libera_api">) => ({
    value: campos[k],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setCampos({ ...campos, [k]: e.target.value }),
  });
  const limite = (n: number | null) => (n === null ? t("sem limite") : String(n));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const corpo = corpoDoPlano(campos);
    if (!novoPlanoSchema.safeParse(corpo).success) {
      toast.error(t(AVISO_DE_CAMPOS));
      return;
    }
    setSalvando(true);
    try {
      if (editando) await apiClient.patch(`/api/v1/admin/cobranca/planos/${editando}`, corpo);
      else await apiClient.post("/api/v1/admin/cobranca/planos", corpo);
      toast.success(t("Plano salvo."));
      setCampos(VAZIO);
      setEditando(null);
      router.refresh();
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  async function mudar(id: string, corpo: Record<string, unknown>) {
    try {
      await apiClient.patch(`/api/v1/admin/cobranca/planos/${id}`, corpo);
      router.refresh();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form onSubmit={salvar} className="space-y-3 rounded-lg border p-4" aria-label={editando ? t("Editar plano") : t("Novo plano")}>
        <h3 className="text-sm font-semibold">{editando ? t("Editar plano") : t("Novo plano")}</h3>
        <div className="space-y-1">
          <Label htmlFor="plano-nome">{t("Nome do plano")}</Label>
          <Input id="plano-nome" maxLength={60} {...campo("nome")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="plano-preco">{t("Preço (R$)")}</Label>
            <CampoDeDinheiro id="plano-preco" moeda="BRL" {...campo("preco")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plano-intervalo">{t("Intervalo de cobrança")}</Label>
            <select
              id="plano-intervalo"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={campos.intervalo}
              onChange={(e) => setCampos({ ...campos, intervalo: e.target.value as Intervalo })}
            >
              {INTERVALOS.map((i) => (
                <option key={i} value={i}>
                  {t(NOME_DO_INTERVALO[i])}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plano-trial">{t("Dias de teste grátis")}</Label>
          <Input id="plano-trial" inputMode="numeric" {...campo("trial_dias")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="plano-assentos">{t("Máximo de pessoas")}</Label>
            <Input id="plano-assentos" inputMode="numeric" {...campo("max_assentos")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plano-canais">{t("Máximo de números conectados")}</Label>
            <Input id="plano-canais" inputMode="numeric" {...campo("max_canais")} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plano-ia">{t("Teto de uso de IA por mês (US$)")}</Label>
          <CampoDeDinheiro id="plano-ia" moeda="USD" {...campo("teto_ia")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["max_pipelines", t("Máximo de pipelines")],
              ["max_etapas_por_pipeline", t("Máximo de etapas por pipeline")],
              ["max_leads", t("Máximo de leads")],
              ["max_automacoes", t("Máximo de automações")],
              ["max_webhooks", t("Máximo de webhooks")],
            ] as const
          ).map(([k, rotulo]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`plano-${k}`}>{rotulo}</Label>
              <Input id={`plano-${k}`} inputMode="numeric" {...campo(k)} />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={campos.libera_api} onChange={(e) => setCampos({ ...campos, libera_api: e.target.checked })} />
          {t("Inclui API REST (tokens de integração)")}
        </label>
        <p className="text-xs text-muted-foreground">{t("Deixe um limite vazio para não limitar.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvando}>
            {editando ? t("Salvar alterações") : t("Salvar plano")}
          </Button>
          {editando && (
            <Button type="button" variant="ghost" onClick={() => { setEditando(null); setCampos(VAZIO); }}>
              {t("Cancelar edição")}
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("O preço e o intervalo de um plano travam quando alguém o assina: para mudar, arquive e crie outro.")}
        </p>
        {planos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Nenhum plano ainda. Crie o primeiro no formulário acima: nome, preço, dias de teste grátis e, se quiser, os limites. Depois atribua-o a cada empresa no painel dela, em Tenants.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {planos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    {p.nome}
                    {p.padrao_no_cadastro && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs">{t("Plano do cadastro")}</span>}
                    {p.arquivado_em && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs">{t("Arquivado")}</span>}
                    {!p.oferecido_ao_cliente && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs">{t("Só você atribui")}</span>}
                  </p>
                  <p className="text-muted-foreground">
                    {brl.format(p.preco_cents / 100)} {t(POR_INTERVALO[p.intervalo])} · {p.trial_dias} {t("dias de teste")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("Pessoas")}: {limite(p.max_assentos)} · {t("Números conectados")}: {limite(p.max_canais)} · {t("IA")}:{" "}
                    {p.teto_ia_usd_cents === null ? t("sem limite") : usd.format(p.teto_ia_usd_cents / 100)}
                  </p>
                  <p className="text-muted-foreground">
                    {t("Pipelines")}: {limite(p.max_pipelines)} · {t("Etapas por pipeline")}: {limite(p.max_etapas_por_pipeline)} · {t("Leads")}: {limite(p.max_leads)} ·{" "}
                    {t("Automações")}: {limite(p.max_automacoes)} · {t("Webhooks")}: {limite(p.max_webhooks)} · {t("API REST")}: {p.libera_api ? t("sim") : t("não")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditando(p.id); setCampos(camposDe(p)); }}>
                    {t("Editar")}
                  </Button>
                  {!p.arquivado_em && (
                    <Button size="sm" variant="outline" onClick={() => mudar(p.id, { padrao_no_cadastro: !p.padrao_no_cadastro })}>
                      {p.padrao_no_cadastro ? t("Tirar do cadastro") : t("Usar no cadastro")}
                    </Button>
                  )}
                  {!p.arquivado_em && (
                    <Button size="sm" variant="outline" onClick={() => mudar(p.id, { oferecido_ao_cliente: !p.oferecido_ao_cliente })}>
                      {p.oferecido_ao_cliente ? t("Esconder das empresas") : t("Mostrar às empresas")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => mudar(p.id, { arquivado: !p.arquivado_em })}>
                    {p.arquivado_em ? t("Desarquivar") : t("Arquivar")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
