---
impacto: capacidade_nova
secao: adicionado
titulo: Categorias de produto cadastradas, selo de mensagem encaminhada, ícones legíveis no escuro e financeiro só com o módulo
---

Produtos ganha um cadastro de categorias (botão "Categorias" na tela, para criar, renomear e apagar). No formulário do produto, a categoria passa a ser escolhida numa lista pesquisável, que também cria a categoria que falta. Renomear leva o nome novo aos produtos, e apagar só vale para categoria sem produto. As categorias que já estavam nos produtos entram no cadastro na atualização (migration 0721). No Inbox, mensagem encaminhada no WhatsApp mostra o selo "Encaminhada" ("Encaminhada com frequência" a partir de 5 encaminhamentos), como no app; vale para as mensagens que chegarem depois da atualização. No tema escuro, ícone e texto azul ficam claros no hover em todo o sistema. Antes, o azul de fundo era usado como cor de texto e sumia. O contador vermelho de não lidos tem desenho único, sem serrilhado e num vermelho mais sóbrio. Faturamento segue a mesma regra das Comandas: sem o módulo `financeiro` instalado, a tela e a porta do menu somem. Configurações › Financeiro continua sempre disponível, porque as contas do caixa também recebem os pagamentos de Honorários.
