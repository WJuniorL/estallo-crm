"use client";
import { useT } from "@/hooks/i18n/useT";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";

import { FormatacaoWhatsApp } from "@/lib/mensagens/formatacao-whatsapp";

/**
 * Estado do slash-menu a partir do texto do composer. Puro (testável).
 *
 * O ESPAÇO NÃO FECHA O MENU. A versão anterior fechava em qualquer espaço, e
 * nome composto ("Boas vindas") ficava impossível de buscar: ao digitar o
 * espaço a lista sumia. Só a quebra de linha encerra a busca — a partir dela o
 * texto é mensagem, não termo.
 */
export function resolveSlash(text: string): { open: boolean; query: string } {
  if (!text.startsWith("/")) return { open: false, query: "" };
  const rest = text.slice(1);
  if (/[\r\n]/.test(rest)) return { open: false, query: "" };
  return { open: true, query: rest };
}

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();

/**
 * Casa quando TODAS as palavras do termo estão no nome (ou no atalho), sem
 * diferenciar maiúsculas nem acentos e sem se importar com espaços sobrando.
 */
export function filtrarTemplates(templates: MessageTemplate[], query: string): MessageTemplate[] {
  const palavras = normalizar(query).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return templates;
  return templates.filter((tpl) => {
    const alvo = `${normalizar(tpl.title)} ${normalizar(tpl.shortcut ?? "")}`;
    return palavras.every((p) => alvo.includes(p));
  });
}

interface Props {
  open: boolean;
  query: string;
  templates: MessageTemplate[];
  onPick: (t: MessageTemplate) => void;
  onClose: () => void;
}

export function TemplateMenu({ open, query, templates, onPick, onClose: _onClose }: Props) {
  const t = useT();
  if (!open) return null;
  const filtered = filtrarTemplates(templates, query);
  return (
    <div
      className="absolute bottom-14 left-3 z-20 max-h-64 w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label={t("Templates de script")}
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">{t("Nenhum template. Crie em Configurações.")}</div>
      ) : (
        filtered.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-muted"
            onClick={() => onPick(tpl)}
          >
            <span className="text-sm font-medium">{tpl.title}</span>
            <span className="line-clamp-1 text-xs text-muted-foreground">
              <FormatacaoWhatsApp texto={tpl.body} modo="linha" />
            </span>
          </button>
        ))
      )}
    </div>
  );
}
