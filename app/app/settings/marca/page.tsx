import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { marcaDaPlataforma } from "@/lib/branding/plataforma";
import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Identidade do produto" };
export default async function IdentidadeDoProdutoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) redirect("/403");
  const marca = marcaDaPlataforma();
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Identidade do produto</h1>
        <p className="mt-2 text-sm text-text-muted">
          Uma experiência consistente para todas as empresas.
        </p>
      </header>
      <Card className="max-w-2xl space-y-5 p-6">
        <LogotipoDoProduto nome={marca.name} className="h-12 w-auto" />
        <p className="text-sm text-text-muted">
          A marca, as cores e a tipografia pertencem à plataforma. Sua empresa mantém seu nome,
          dados cadastrais e identidade nos documentos comerciais.
        </p>
        <Link
          href="/app/settings/tenant"
          className="text-sm font-semibold text-accent underline underline-offset-4"
        >
          Editar dados da empresa
        </Link>
      </Card>
    </div>
  );
}
