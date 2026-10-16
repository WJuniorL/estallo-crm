"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoDeDinheiro } from "@/components/ui/campo-de-dinheiro";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { useCatalogoDeProdutos } from "@/hooks/leads/useProdutosDoNegocio";
import { centavosParaCampo, formatCents, parseReaisToCents } from "@/lib/money";
import type { ItemDoRascunho } from "@/lib/leads/rascunho-de-produtos";
import { totalDoItem } from "@/lib/schemas/produtos-do-negocio";
import { X } from "@/lib/ui/icons";

function centsParaTexto(cents: number): string {
  return centavosParaCampo(cents);
}

/**
 * Os produtos do negócio (0660): escolher do catálogo, quantidade e desconto
 * por item. O valor do negócio é a soma — quem calcula é a trigger do banco, e
 * o `LeadFieldsForm` mostra o total daqui no lugar do campo de valor.
 *
 * É um editor de RASCUNHO: cada mudança fica na tela e só vai ao servidor
 * quando a pessoa clica em "Salvar" na ficha (`LeadFieldsForm`). Antes cada
 * clique gravava na hora, e o botão Salvar parecia não mandar em nada.
 */
export function ProdutosDoNegocio({
  itens,
  onChange,
  moeda,
  podeEditar,
}: {
  itens: ItemDoRascunho[];
  onChange: (proximos: ItemDoRascunho[]) => void;
  moeda: string;
  podeEditar: boolean;
}) {
  const t = useT();
  const catalogo = useCatalogoDeProdutos(podeEditar);
  const ativos = (catalogo.data ?? []).filter((p) => p.ativo);
  // Id da linha que ainda não existe no banco — único dentro do rascunho.
  const proximoId = useRef(0);

  function adicionar(productId: string) {
    const p = ativos.find((c) => c.id === productId);
    if (!p) return;
    onChange([
      ...itens,
      {
        id: `novo-${productId}-${(proximoId.current += 1)}`,
        product_id: p.id,
        nome: p.nome,
        quantidade: 1,
        preco_unitario_cents: p.preco_cents,
        desconto_cents: 0,
      },
    ]);
  }

  return (
    <div className="space-y-2" data-testid="produtos-do-negocio">
      <Label>{t("Produtos")}</Label>
      {itens.length > 0 && (
        <ul className="space-y-2">
          {itens.map((item) => (
            <LinhaDoProduto
              key={item.id}
              item={item}
              moeda={moeda}
              podeEditar={podeEditar}
              onAlterar={(v) => onChange(itens.map((i) => (i.id === item.id ? { ...i, ...v } : i)))}
              onRemover={() => onChange(itens.filter((i) => i.id !== item.id))}
            />
          ))}
        </ul>
      )}
      {podeEditar && (
        <Select value="" onValueChange={adicionar} disabled={ativos.length === 0}>
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
  item: ItemDoRascunho;
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

  function conferirQuantidade() {
    const q = Number.parseInt(quantidade, 10);
    if (!Number.isInteger(q) || q < 1) {
      setQuantidade(String(item.quantidade));
      return;
    }
    if (q !== item.quantidade) onAlterar({ quantidade: q });
  }

  function conferirDesconto() {
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
            onChange={(e) => {
              setQuantidade(e.target.value);
              const q = Number.parseInt(e.target.value, 10);
              if (Number.isInteger(q) && q >= 1 && q !== item.quantidade)
                onAlterar({ quantidade: q });
            }}
            onBlur={conferirQuantidade}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`desc-${item.id}`} className="text-xs">
            {t("Desconto")}
          </Label>
          <CampoDeDinheiro
            id={`desc-${item.id}`}
            moeda={moeda}
            className="h-8"
            value={desconto}
            disabled={!podeEditar}
            onChange={(e) => {
              setDesconto(e.target.value);
              const cents = e.target.value.trim() === "" ? 0 : parseReaisToCents(e.target.value);
              if (cents !== null && cents !== item.desconto_cents)
                onAlterar({ desconto_cents: cents });
            }}
            onBlur={conferirDesconto}
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
