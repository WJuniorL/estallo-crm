"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import {
  ehProvisorio,
  useCatalogoDeProdutos,
  useProdutosDoNegocio,
} from "@/hooks/leads/useProdutosDoNegocio";
import { formatCents, parseReaisToCents } from "@/lib/money";
import { totalDoItem, type ProdutoDoNegocio } from "@/lib/schemas/produtos-do-negocio";
import { X } from "@/lib/ui/icons";

function centsParaTexto(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Os produtos do negócio (0660): escolher do catálogo, quantidade e desconto
 * por item. O valor do negócio é a soma — quem calcula é a trigger do banco, e
 * o `LeadFieldsForm` mostra o total daqui no lugar do campo de valor.
 */
export function ProdutosDoNegocio({
  leadId,
  pipelineId,
  moeda,
  podeEditar,
}: {
  leadId: string;
  pipelineId: string;
  moeda: string;
  podeEditar: boolean;
}) {
  const t = useT();
  const itens = useProdutosDoNegocio(leadId, pipelineId);
  const catalogo = useCatalogoDeProdutos(podeEditar);
  const ativos = (catalogo.data ?? []).filter((p) => p.ativo);

  return (
    <div className="space-y-2" data-testid="produtos-do-negocio">
      <Label>{t("Produtos")}</Label>
      {(itens.data ?? []).length > 0 && (
        <ul className="space-y-2">
          {(itens.data ?? []).map((item) => (
            <LinhaDoProduto
              key={item.id}
              item={item}
              moeda={moeda}
              // A linha provisória (otimista) só se edita quando o id real chega.
              podeEditar={podeEditar && !ehProvisorio(item.id)}
              onAlterar={(v) => itens.alterar.mutate({ itemId: item.id, ...v })}
              onRemover={() => itens.remover.mutate(item.id)}
            />
          ))}
        </ul>
      )}
      {podeEditar && (
        <Select
          value=""
          onValueChange={(id) => itens.adicionar.mutate(id)}
          disabled={ativos.length === 0}
        >
          <SelectTrigger aria-label={t("Adicionar produto")} data-testid="adicionar-produto">
            <SelectValue
              placeholder={
                ativos.length === 0 ? t("Nenhum produto no catálogo") : t("Adicionar produto")
              }
            />
          </SelectTrigger>
          <SelectContent>
            {ativos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome} — {formatCents(p.preco_cents, moeda)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function LinhaDoProduto({
  item,
  moeda,
  podeEditar,
  onAlterar,
  onRemover,
}: {
  item: ProdutoDoNegocio;
  moeda: string;
  podeEditar: boolean;
  onAlterar: (v: { quantidade?: number; desconto_cents?: number }) => void;
  onRemover: () => void;
}) {
  const t = useT();
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [desconto, setDesconto] = useState(
    item.desconto_cents ? centsParaTexto(item.desconto_cents) : "",
  );

  function salvarQuantidade() {
    const q = Number.parseInt(quantidade, 10);
    if (!Number.isInteger(q) || q < 1) {
      setQuantidade(String(item.quantidade));
      return;
    }
    if (q !== item.quantidade) onAlterar({ quantidade: q });
  }

  function salvarDesconto() {
    const texto = desconto.trim();
    const cents = texto === "" ? 0 : parseReaisToCents(texto);
    if (cents === null || cents < 0) {
      toast.error(t("Desconto inválido"));
      setDesconto(item.desconto_cents ? centsParaTexto(item.desconto_cents) : "");
      return;
    }
    if (cents !== item.desconto_cents) onAlterar({ desconto_cents: cents });
  }

  return (
    <li
      className="space-y-2 rounded-md border border-border p-3 text-sm"
      data-produto={item.product_id ?? ""}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.nome}</p>
          <p className="text-xs text-muted-foreground">
            {formatCents(item.preco_unitario_cents, moeda)} {t("cada")}
          </p>
        </div>
        {podeEditar && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            aria-label={`${t("Remover produto")}: ${item.nome}`}
            onClick={onRemover}
          >
            <X size={14} aria-hidden />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`qtd-${item.id}`} className="text-xs">
            {t("Quantidade")}
          </Label>
          <Input
            id={`qtd-${item.id}`}
            type="number"
            min={1}
            inputMode="numeric"
            className="h-8"
            value={quantidade}
            disabled={!podeEditar}
            onChange={(e) => setQuantidade(e.target.value)}
            onBlur={salvarQuantidade}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`desc-${item.id}`} className="text-xs">
            {t("Desconto")}
          </Label>
          <Input
            id={`desc-${item.id}`}
            inputMode="decimal"
            placeholder="0,00"
            className="h-8"
            value={desconto}
            disabled={!podeEditar}
            onChange={(e) => setDesconto(e.target.value)}
            onBlur={salvarDesconto}
          />
        </div>
        <div className="space-y-1 text-right">
          <p className="text-xs text-muted-foreground">{t("Total")}</p>
          <p className="h-8 leading-8 font-medium">{formatCents(totalDoItem(item), moeda)}</p>
        </div>
      </div>
    </li>
  );
}
