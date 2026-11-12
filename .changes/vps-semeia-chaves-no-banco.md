---
impacto: nada_mudou
secao: corrigido
titulo: A instalação da VPS da Estallo põe no banco as chaves de cifra de segredos e de CPF
---

O `scripts/estallo-vps.py bootstrap` não gravava em `private.app_secrets` as chaves `nuvemshop_oauth_key` e `cpf_key`, que o kit grava. Sem elas, guardar a senha do servidor de e-mail, os segredos de webhook e as chaves do Google e da Meta respondia "cifra indisponível", e o contato com CPF era salvo sem o CPF. Agora o bootstrap grava as duas, e o comando novo `seed-secrets` conserta uma instalação existente. Chave que já existe no banco nunca é trocada.
