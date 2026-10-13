# Estallo CRM: implantação e operação

Fork privado de [DeskcommCRM](https://github.com/melgarafael/DeskcommCRM), sob MIT.
O copyright e a licença originais são preservados em `LICENSE`. O histórico upstream
é mantido pelo remoto `upstream`; `origin` é `estallosolucoes/estallo-crm`.

## Topologia

Uma stack Swarm `estallo-crm` em `178.156.231.35`, domínio `crm.estallo.com.br`,
Supabase exclusivo `cbeqboyfmwyjsybszaxy`. Traefik e `NetPratica` já existem.
A aplicação participa de `NetPratica` e da rede interna da stack; worker,
scheduler, WAHA, Redis efêmero e seu adaptador HTTP usam apenas a rede interna.
Sem Caddy, portas públicas adicionais, serviços de voz ou build na VPS.

As três imagens próprias têm o mesmo SHA completo e são publicadas pelo CI.
O deploy verifica que todas existem antes de trocar qualquer serviço.
Nenhuma tag móvel é usada na instalação.

## Instalação

1. Apontar o registro A de `crm.estallo.com.br` para `178.156.231.35`.
2. Clonar o repositório por deploy key read-only em `/opt/stacks/estallo-crm/repo`.
3. Guardar as credenciais em `/opt/stacks/estallo-crm/credentials.env`, com modo 600:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `OWNER_EMAIL`, `OWNER_PASSWORD`.
   A conexão Postgres deve ser o Session pooler com senha e usuário do projeto.
4. Na raiz do clone, executar:

```bash
python3 scripts/estallo-vps.py configure --credentials /opt/stacks/estallo-crm/credentials.env
python3 scripts/estallo-vps.py bootstrap --sha COMMIT_COMPLETO
python3 scripts/estallo-vps.py deploy --sha COMMIT_COMPLETO
```

O configure gera as chaves internas e grava `runtime.env` fora do clone.
Bootstrap recusa bancos alheios, retoma somente um baseline confirmado neste host,
habilita extensões, aplica
o baseline e cria o administrador. Nenhuma credencial entra nas imagens.

No Supabase, configurar Site URL `https://crm.estallo.com.br` e Redirect URL
`https://crm.estallo.com.br/auth/confirm`. Configurar os modelos de e-mail com
Estallo CRM. O token de gerenciamento do Supabase, se disponibilizado, permite
automatizar essa configuração; as chaves da API sozinhas não concedem essa permissão.
Envio operacional completo requer SMTP ou Resend com remetente verificado.

## Atualização, rollback e backup

O agente do host consulta somente `origin/main` e oferece atualização quando
as três imagens daquele commit estão publicadas. O clique na tela existente
é lido pelo agente; progresso e resultado voltam a `/api/v1/system/agent`.
Atualizações aplicam somente migrations novas; edição de migration antiga é recusada.

```bash
python3 scripts/estallo-vps.py agent
python3 scripts/estallo-vps.py backup
python3 scripts/estallo-vps.py rollback
python3 scripts/estallo-vps.py verify
```

Agendar no host, após o primeiro deploy validado:

```cron
*/5 * * * * cd /opt/stacks/estallo-crm/repo && python3 scripts/estallo-vps.py agent >> /opt/stacks/estallo-crm/agent.log 2>&1
0 6 * * * cd /opt/stacks/estallo-crm/repo && python3 scripts/estallo-vps.py backup >> /opt/stacks/estallo-crm/backup.log 2>&1
```

O horário do cron é o do host; 06:00 UTC equivale a 03:00 na Bahia.
Backups contêm banco, configuração, objetos do Supabase Storage e volumes de sessões/mídia do WAHA. O dump
é validado por `pg_restore --list`. Para cópia externa, configurar
`BACKUP_SSH_TARGET=usuario@servidor:/diretorio` no arquivo protegido, com SSH por chave.
Sem destino externo, o script declara a pendência; backup na mesma VPS não é cópia externa.

Restauração exige parar somente a stack Estallo e usar banco vazio compatível:
restaurar o dump por `pg_restore --no-owner --no-privileges`, recuperar `runtime.env`
e os volumes pelos arquivos `.tgz`, e implantar o SHA registrado em `deployment.json`.
Recuperar os objetos de `storage/` usando o bucket, nome e tipo registrados em
`storage/manifest.json`, pela API de upload do Supabase com `x-upsert: true`.
O dump guarda metadados, e os arquivos dessa pasta guardam os bytes dos anexos.
Validar essa recuperação em ambiente separado antes de confiar nela.
Rollback volta as três imagens juntas; não desfaz schema nem apaga volumes.

## Aceite e continuidade

Verificar login, recuperação, onboarding, nomes e ícone E pela tela. Parear um
WhatsApp e comprovar mensagem recebida/enviada. Sem chave de IA, cadastrar em
IA → Credenciais antes de testar agente e handoff. Telemetria fica desligada.

O piloto exige pelo menos 1 GB disponível antes do deploy e mantém margem de
512 MB durante a conferência. Falha no primeiro deploy escala somente seus seis
serviços para zero, preservando volumes; em atualização, tenta voltar o conjunto anterior.
O resultado não é sucesso se HTTPS, `/app`, saúde ou memória falharem.

Living System Checklist: o commit e a configuração alimentam a stack; ela
alimenta aplicação, worker e scheduler. Os recibos de atualização existentes
aparecem na tela de atualização; falhas ficam no log do host e no run da tela.
O cron do agente é o próximo passo para pedido pendente. Marca continua
configurável em `/admin/marca`. A continuidade IA/humano existente permanece
no worker e no inbox; esta mudança é infraestrutura. Falha de rollout impede
o commit novo de virar estado instalado e aciona recuperação do conjunto anterior.
