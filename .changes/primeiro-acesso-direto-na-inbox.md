---
impacto: capacidade_nova
secao: alterado
titulo: Empresa nova entra direto na Inbox, e-mail de acesso com logo, e Inbox sem canal leva à Central de Conexões
---

Depois do cadastro, a empresa nova vai direto para a Inbox, sem o assistente de boas-vindas. O aceite dos Termos de Uso e da Política de Privacidade passa a ser o aviso da tela de cadastro, e fica gravado na empresa. O assistente continua no código e volta com `ONBOARDING_GUIADO=ligado`. A Inbox vazia de quem ainda não tem canal diz "Nenhum canal conectado" e leva para a Central de Conexões. Os e-mails de confirmar conta e redefinir senha ganham o logo e um cartão. O `marca-emails.sh` sobe o modelo que o app serve e não quebra mais os acentos quando roda no Git Bash do Windows.
