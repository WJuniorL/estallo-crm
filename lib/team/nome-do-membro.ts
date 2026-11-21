/**
 * O nome de exibição de um membro mora no login (`auth.users.user_metadata.full_name`),
 * não na organização: é um só para todas as empresas em que a pessoa entra.
 *
 * Até aqui só a própria pessoa o trocava (Configurações › Perfil). Quem
 * administra — o admin da organização e o admin da plataforma, inclusive em
 * modo suporte — não tinha como corrigir o nome de outro membro, e a equipe
 * ficava vendo o e-mail no lugar do nome de quem se cadastrou sem preencher.
 */
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

export const nomeDoMembroSchema = z.object({
  full_name: z.string().trim().min(1, "Informe o nome").max(120),
});

export type ResultadoDoNome =
  | { ok: true; anterior: string | null }
  | { ok: false; motivo: "nao_encontrado" | "falhou"; erro?: string };

/** Grava o nome preservando o resto dos metadados do login. Sem guarda de acesso: quem chama decide. */
export async function gravarNomeDoMembro(userId: string, nome: string): Promise<ResultadoDoNome> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return { ok: false, motivo: "nao_encontrado" };

  const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const anterior = typeof metadata.full_name === "string" ? metadata.full_name : null;

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...metadata, full_name: nome },
  });
  if (updErr) return { ok: false, motivo: "falhou", erro: updErr.message };
  return { ok: true, anterior };
}
