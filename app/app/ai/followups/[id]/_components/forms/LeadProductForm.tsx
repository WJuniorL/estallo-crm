"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorDeProduto } from "@/components/catalogo/SeletorDeProduto";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

/**
 * Produto do negócio (Fase 5): o produto vem do CATÁLOGO da organização (nunca digitado); acrescentar copia nome e
 * preço de lá, e o banco recalcula o valor do negócio. Tirar remove os itens desse produto.
 */
export function LeadProductForm({
  config,
  onChange,
}: {
  config: ConfigOf<"lead_product">;
  onChange: (c: ConfigOf<"lead_product">) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label htmlFor="lead-product-acao">{t("O que fazer")}</Label>
      <Select value={config.acao} onValueChange={(v) => onChange({ ...config, acao: v === "remove" ? "remove" : "add" })}>
        <SelectTrigger id="lead-product-acao">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="add">{t("Acrescentar produto")}</SelectItem>
          <SelectItem value="remove">{t("Tirar produto")}</SelectItem>
        </SelectContent>
      </Select>
      <Label htmlFor="lead-product-id">{t("Produto do catálogo")}</Label>
      <SeletorDeProduto
        id="lead-product-id"
        valor={config.product_id || null}
        onEscolher={(p) => onChange({ ...config, product_id: p.id })}
        // Tirar vale para produto desativado também: o negócio pode tê-lo.
        aceita={() => true}
        placeholder={t("Escolha um produto")}
        invalido={!config.product_id}
      />
      {config.acao === "add" && (
        <>
          <Label htmlFor="lead-product-qtd">{t("Quantidade")}</Label>
          <Input
            id="lead-product-qtd"
            type="number"
            min={1}
            max={10000}
            value={config.quantidade}
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value));
              if (Number.isFinite(n) && n >= 1 && n <= 10_000) onChange({ ...config, quantidade: n });
            }}
          />
        </>
      )}
      <p className="text-xs text-text-muted">{t("O nome e o preço vêm do catálogo; o valor do lead é recalculado.")}</p>
    </div>
  );
}
