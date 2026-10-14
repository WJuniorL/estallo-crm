import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { PlanosDemonstrativos } from "@/components/plans/PlanosDemonstrativos";

export const metadata = { title: "Plano e cobrança" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) redirect("/403");
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header>
        <p className="mb-2 text-xs font-semibold tracking-wider text-accent uppercase">
          Seu próximo passo
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Plano e cobrança</h1>
        <p className="mt-2 text-sm text-text-muted">Uma opção para cada etapa da sua operação.</p>
      </header>
      <PlanosDemonstrativos />
    </div>
  );
}
