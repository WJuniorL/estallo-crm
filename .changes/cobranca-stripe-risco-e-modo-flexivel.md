---
impacto: capacidade_nova
secao: adicionado
titulo: A cobrança pela Stripe avisa reembolso, contestação e alerta de fraude, e assina no modo de cobrança recomendado
---

A Visão geral de /admin/cobranca ganhou uma linha para dinheiro em risco: reembolsos, contestações e alertas de fraude da Stripe nos últimos 30 dias, com o caminho para responder no painel da Stripe. Antes esses avisos nem eram assinados, e contestação tem prazo. Contestação e alerta de fraude não trazem o cliente, então deixam de aparecer como "aviso sem empresa correspondente". O reembolso traz o cliente e dispara a releitura da assinatura como os outros avisos. O Checkout de assinatura nova passa a usar o modo de cobrança `flexible`, recomendado pela Stripe, e leva um rótulo fixo para filtrar no painel. A assinatura é paga só por cartão (e pelas carteiras de cartão que o painel liga): Pix e boleto ficam de fora do Checkout de assinatura mesmo quando estão ligados na conta para outras vendas. Instalação que já conectou a Stripe só passa a receber os três avisos novos depois de conectar a chave de novo na aba Conexão, porque é nesse passo que o endpoint é criado. Nenhuma mudança de banco.
