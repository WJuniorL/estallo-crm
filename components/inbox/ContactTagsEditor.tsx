"use client";
import { useT } from "@/hooks/i18n/useT";
import { SeletorDeTags } from "@/components/tags/SeletorDeTags";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { normalizarTag } from "@/lib/contacts/tag-normalizada";

interface Props {
  contactId: string;
  /** Mantido por compatibilidade de quem monta; o cadastro vem do provider. */
  orgId?: string;
  tags: string[];
}

/**
 * Edita as tags do CONTATO — aberto pelo botão "Tags do contato" do painel do
 * Inbox. Oferece as etiquetas cadastradas de contato (tela Tags, /app/crm/tags)
 * e permite criar na hora. Grava a cada mudança.
 *
 * A forma gravada é a normalizada (`normalizarTag`), a mesma do servidor: sem
 * isso "VIP" e "vip" virariam duas etiquetas no mesmo contato.
 */
export function ContactTagsEditor({ contactId, tags }: Props) {
  const t = useT();
  const mutation = useUpdateContact(contactId);

  return (
    <div className="mt-2 rounded-md border border-border p-2">
      <SeletorDeTags
        entidade="contact"
        valor={tags}
        onChange={(proximas) => mutation.mutate({ tags: proximas })}
        normalizar={normalizarTag}
        disabled={mutation.isPending}
        rotulo={t("Adicionar tag ao contato")}
      />
      {tags.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">{t("Sem tags no contato.")}</p>
      )}
    </div>
  );
}
