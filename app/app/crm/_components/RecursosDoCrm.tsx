"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * Recursos que a empresa liga ou desliga para si, no hub do CRM (só admin).
 * Hoje: a Agenda — desligada, somem a tela, o item de menu e as ferramentas de
 * agendamento do agente. `router.refresh()` relê o layout, que recalcula o menu.
 */
export function RecursosDoCrm({ agendaLigada }: { agendaLigada: boolean }) {
  const t = useT();
  const router = useRouter();
  const [ligada, setLigada] = useState(agendaLigada);
  const [salvando, setSalvando] = useState(false);

  async function alternar(valor: boolean) {
    setSalvando(true);
    try {
      await apiClient.patch("/api/v1/settings/agenda-habilitada", { habilitada: valor });
      setLigada(valor);
      toast.success(valor ? t("Agenda ligada.") : t("Agenda desligada."));
      router.refresh();
    } catch (erro) {
      showApiError(erro);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section aria-labelledby="hub-crm-recursos" className="space-y-3">
      <h2
        id="hub-crm-recursos"
        className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
      >
        {t("Recursos")}
      </h2>
      <Card className="flex items-start justify-between gap-4 p-4">
        <div>
          <Label htmlFor="recurso-agenda" className="text-sm font-semibold">
            {t("Agenda")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Compromissos, horários livres e agendamento pelo agente de IA. Desligada, some do menu e o agente não marca horários.",
            )}
          </p>
        </div>
        <Switch
          id="recurso-agenda"
          checked={ligada}
          disabled={salvando}
          onCheckedChange={(v) => void alternar(v)}
          data-testid="recurso-agenda"
        />
      </Card>
    </section>
  );
}
