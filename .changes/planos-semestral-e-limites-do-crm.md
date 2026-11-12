---
impacto: capacidade_nova
secao: adicionado
titulo: Planos com período semestral, limites de pipelines, etapas, leads, automações, webhooks e API, e Plano e cobrança com contratação de verdade
---

Os planos de cobrança ganharam o período semestral e cinco limites novos, além de pessoas, números e IA: pipelines, etapas por pipeline, leads, automações do CRM e webhooks de entrada. Também ganharam a opção de incluir ou não a API REST. Quem recusa é o banco: criar além do limite devolve 409 com a frase que diz o teto e o caminho para trocar de plano, e o token de API de um plano sem API recebe 403 `plan_feature_unavailable`. Com a cobrança desligada, ou para empresa sem plano, nada é limitado. A tela Plano e cobrança volta a mostrar a assinatura e as ações de pagamento. Ela também ganha a escolha de plano com mensal, semestral e anual, mostrando em destaque a mensalidade equivalente do semestral e do anual. Enquanto a empresa não pagou, ela pode trocar de período livremente. A tela /admin/cobranca, que tinha virado uma vitrine fixa, volta com Visão geral, Conexão, Régua, Planos e Clientes, e o formulário de plano ganha os campos novos. A mudança de banco é a migration 0718, já incluída no baseline.
