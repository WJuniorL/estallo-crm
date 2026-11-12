import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { AcoesDaAssinatura } from "@/components/cobranca/AcoesDaAssinatura";
import { EscolhaDePlano } from "@/components/cobranca/EscolhaDePlano";
import { PainelDaAssinatura } from "@/components/cobranca/PainelDaAssinatura";
import { ehIntervalo } from "@/lib/cobranca/intervalo";
import { lerPainelDaAssinatura } from "@/lib/cobranca/painel";
import { traduzir } from "@/lib/i18n/dicionario";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { vitrineDoCatalogo, type PlanoDaVitrine } from "@/lib/planos/catalogo";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Plano e cobrança" };
export const dynamic = "force-dynamic";

/**
 * Plano e cobrança (spec da cobrança §9). Com a cobrança ligada: o painel da
 * assinatura, as ações (Assinar, Gerenciar pagamento, Cancelar) e a vitrine de
 * planos, onde a empresa escolhe nível e período. Desligada: a mesma vitrine,
 * com o catálogo da Estallo e sem contratação.
 *
 * A troca de plano mora na vitrine; por isso as ações recebem `planosParaTroca`
 * vazio — duas portas para a mesma troca confundem.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ voltou?: string }> }) {
  // spec 13 §4: billing é admin-only (viewer/agent/manager = none).
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);
  const admin = createAdminClient();
  const painel = (await moduloLigado(admin, "cobranca")) ? await lerPainelDaAssinatura(admin, activeOrg.orgId) : null;

  const a = painel?.assinatura ?? null;
  const vitrine: PlanoDaVitrine[] = painel
    ? painel.catalogo.flatMap((p) => (ehIntervalo(p.intervalo) ? [{ ...p, intervalo: p.intervalo }] : []))
    : vitrineDoCatalogo();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header>
        <p className="mb-2 text-xs font-semibold tracking-wider text-accent uppercase">{t("Seu próximo passo")}</p>
        {/* Mesmo nome do item de menu (catalogo.ts), ligada ou não. */}
        <h1 className="text-2xl font-semibold tracking-tight">{t("Plano e cobrança")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("Uma opção para cada etapa da sua operação.")}</p>
      </header>
      {painel ? (
        <>
          <PainelDaAssinatura dados={painel} idioma={idioma} />
          {a && (
            <AcoesDaAssinatura
              estado={a.estado}
              temProvedor={a.provedor !== null}
              assinaturasVivas={a.assinaturas_vivas}
              linkDePagamento={a.link_de_pagamento}
              cancelaNoFim={a.cancela_no_fim}
              planosParaTroca={[]}
              provedor={painel.checkout.provedor}
              documentoDoCadastro={painel.checkout.documentoDoCadastro}
              voltouDoCheckout={(await searchParams).voltou === "1"}
              noHub={false}
              fuso={painel.fuso}
            />
          )}
          {a && (
            <EscolhaDePlano
              planos={vitrine}
              atualId={painel.plano?.id ?? null}
              podeEscolher={(a.estado === "trial" || a.estado === "ativa") && !a.cancela_no_fim}
              intervaloTravado={painel.intervaloTravado}
            />
          )}
        </>
      ) : (
        <>
          <div role="note" className="rounded-lg border border-border bg-accent-soft p-4 text-sm text-text">
            <p className="font-semibold">{t("Contratação em breve")}</p>
            <p className="mt-1">{t("Estes são os planos da Estallo. A contratação pelo sistema abre em breve; até lá, nenhuma cobrança é feita.")}</p>
          </div>
          <EscolhaDePlano planos={vitrine} atualId={null} podeEscolher={false} intervaloTravado={false} />
        </>
      )}
    </div>
  );
}
