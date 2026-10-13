# Conferência do Estallo CRM — 13/10/2026

## Medido

- Código e histórico importados de `upstream/main` (`0c05ca348`); a pasta original
  não tinha alterações de código, somente o documento da VPS acrescentado.
- Repositório privado e PR: https://github.com/estallosolucoes/estallo-crm/pull/1.
- Supabase exclusivo: baseline aplicado; consulta ao banco retornou 187 tabelas
  públicas e 187 com RLS habilitada. Isso verifica a ativação, não substitui os
  testes de isolamento entre organizações.
- Login local em 1440×1000 e 390×844: título `Entrar · Estallo CRM`, nome próprio
  visível e um único botão com o rótulo exato `Entrar`. Capturas nesta pasta.
- Typecheck passou com Node 22 e heap de 6 GB. Lint: zero erros; avisos herdados.
- Gates de canal e papel passaram; 54 casos de marca e 85 casos das correções de
  distribuição/CI passaram. Os 15 casos do operador são testes com dublês:
  **não são um ensaio de rollback na VPS**.
- O job `Estallo VPS` verificou a receita pelo `docker stack config` no Linux.
- DNS de `crm.estallo.com.br` resolve via Cloudflare. O registro foi criado pelo
  usuário; nenhuma configuração Cloudflare foi alterada pelo agente.

## Ainda não medido/concluído

- Conjunto final de CI, build das imagens Estallo e publicação no GHCR.
- Aplicação e serviços Swarm em produção, autenticação real do administrador,
  recuperação de senha, onboarding, pareamento e mensagem real de WhatsApp.
- Rollback real, restauração de backup e cópia externa diária.
- Atendimento por IA: nenhuma credencial de provedor foi fornecida.

A chave entregue com o rótulo administrativo continha a role `anon`; a API
administrativa retornou HTTP 403. O operador recusa esse tipo de chave antes
de persistir configuração ou criar o administrador. Credenciais e senha inicial
permanecem fora do Git. A senha foi salva no caminho solicitado pelo usuário.

Os testes shell no Windows encontraram limitações de permissões POSIX e do
executável `python3`; a validação completa do kit deve ser lida no CI Linux.
As correções do fork incluem as expectativas de nomes de imagens e diretórios
dos dublês, permissões de leitura do PR privado e memória de compilação.
