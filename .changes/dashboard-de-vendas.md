---
impacto: capacidade_nova
secao: adicionado
titulo: Dashboard de vendas por funil, com comparação ao período anterior
---

Nova tela em Análise › Dashboard (`/app/dashboard`). Para o funil escolhido, ela mostra num lugar só: a carteira em aberto agora e os ganhos e perdidos do período; conversão, ticket médio, ciclo de venda (mediana) e receita ganha, cada um comparado com o período anterior de mesma duração; o fluxo do funil, com quantos negócios criados no período chegaram a cada etapa e qual etapa é o gargalo (só com amostra de pelo menos 10 negócios); o ranking dos ganhos por pessoa e por agente de IA; os produtos dos negócios ganhos; os motivos de perda; a evolução de 12 meses no fuso da organização; e os negócios abertos parados há mais tempo na mesma etapa, com link para cada um. Os filtros são funil, período, responsável (a partir de gestor) e origem. Valores em moedas diferentes não são somados: quando há mais de uma, aparece um seletor de moeda. Transferência entre funis não conta como perda. O atendente vê só os negócios que já pode ver no CRM. A conta mora na função `fn_dashboard_vendas` (migration 0719), que entra pelo `baseline.sql` na atualização, sem passo manual.
