/**
 * Grava os nove planos da Estallo em `cobranca_planos` (3 níveis × mensal,
 * semestral, anual), a partir de `lib/planos/catalogo.ts`. Idempotente: plano
 * ativo com o mesmo nome e intervalo é ATUALIZADO (preço e limites), nunca
 * duplicado; o que já foi assinado continua com a linha que tem.
 *
 * Também marca o plano do cadastro (Profissional mensal): quem se cadastra
 * começa o teste grátis nele. Os produtos e preços na Stripe nascem sozinhos no
 * primeiro Checkout de cada plano (`garantirProduto`), não aqui.
 *
 * Uso (na VPS, com o .env da instalação):
 *   npx tsx --env-file=.env scripts/cobranca-planos-estallo.ts            # mostra o que faria
 *   npx tsx --env-file=.env scripts/cobranca-planos-estallo.ts --gravar   # grava
 */
import { createClient } from "@supabase/supabase-js";

import { INTERVALOS } from "@/lib/cobranca/vocabulario";
import { NIVEIS_DA_ESTALLO, NIVEL_DO_CADASTRO, TRIAL_DIAS } from "@/lib/planos/catalogo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error("✗ falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no ambiente");
  process.exit(2);
}
const gravar = process.argv.includes("--gravar");
const db = createClient(url, chave, { auth: { persistSession: false } });

async function main() {
  const { data: existentes, error } = await db
    .from("cobranca_planos")
    .select("id, nome, intervalo, padrao_no_cadastro")
    .is("arquivado_em", null);
  if (error) throw new Error(`leitura dos planos: ${error.message}`);
  const achar = (nome: string, intervalo: string) => (existentes ?? []).find((p) => p.nome === nome && p.intervalo === intervalo);

  const linhas = NIVEIS_DA_ESTALLO.flatMap((n) =>
    INTERVALOS.map((intervalo) => ({
      nome: n.nome,
      preco_cents: n.precos[intervalo],
      intervalo,
      trial_dias: TRIAL_DIAS,
      oferecido_ao_cliente: true,
      ...n.limites,
    })),
  );

  for (const linha of linhas) {
    const ja = achar(linha.nome, linha.intervalo);
    console.info(`${ja ? "atualiza" : "cria    "}  ${linha.nome.padEnd(13)} ${linha.intervalo.padEnd(9)} R$ ${(linha.preco_cents / 100).toFixed(2)}`);
    if (!gravar) continue;
    const { error: e } = ja
      ? await db.from("cobranca_planos").update(linha).eq("id", ja.id)
      : await db.from("cobranca_planos").insert(linha);
    // Plano já assinado trava preço e intervalo (a rota do admin recusa a edição): o aviso fica e o resto segue.
    if (e) console.error(`  ✗ ${linha.nome} ${linha.intervalo}: ${e.message}`);
  }

  if (!gravar) {
    console.info("\nNada gravado. Rode de novo com --gravar.");
    return;
  }

  // O plano do cadastro: um só (índice único parcial). Desmarca o anterior antes.
  const { data: doCadastro, error: eLeitura } = await db
    .from("cobranca_planos")
    .select("id")
    .eq("nome", NIVEL_DO_CADASTRO)
    .eq("intervalo", "mes")
    .is("arquivado_em", null)
    .maybeSingle();
  if (eLeitura || !doCadastro) throw new Error(`plano do cadastro não encontrado: ${eLeitura?.message ?? "ausente"}`);
  await db.from("cobranca_planos").update({ padrao_no_cadastro: false }).eq("padrao_no_cadastro", true).neq("id", doCadastro.id);
  const { error: eMarca } = await db.from("cobranca_planos").update({ padrao_no_cadastro: true }).eq("id", doCadastro.id);
  if (eMarca) throw new Error(`marcar o plano do cadastro: ${eMarca.message}`);
  console.info(`\n✓ ${linhas.length} planos gravados; plano do cadastro: ${NIVEL_DO_CADASTRO} mensal.`);
}

main().catch((e: unknown) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
