-- manifest: índice (organization_id, pointer_id, next_eval_at, id) em followup_enrollments — a página da aba Execuções de um fluxo deixa de varrer e ordenar todas as execuções da organização
--
-- Medido na Fase 8 (`tests/invariants/automacoes-escala-de-execucoes.test.ts`, evidência em
-- `evidence/automacoes-fase8/escala-10k-execucoes.json`): com 10 mil execuções num fluxo e 5 mil em outro, a primeira
-- página (`order by next_eval_at nulls last, id limit 51`, a ordem de `app/api/v1/ai/followups/queue`) era Seq Scan +
-- Sort sobre a organização inteira — custo que cresce com o TOTAL, não com a página. O índice entrega a página já na
-- ordem e para em 51 linhas.
--
-- Custo: mais uma entrada de índice por escrita de `next_eval_at` (o motor regrava a linha a cada passo). Um índice só,
-- de propósito: a fila sem filtro de fluxo não foi medida como gargalo.
--
-- Idempotente; `create index` comum (o runner envolve a migration em transação, onde `concurrently` não é permitido).
create index if not exists idx_followup_enrollments_lista_do_fluxo
  on public.followup_enrollments (organization_id, pointer_id, next_eval_at, id);
