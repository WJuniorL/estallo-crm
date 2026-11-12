# Estallo CRM — visão e direção do produto

Decisões do proprietário em 13/10/2026. Este documento substitui o posicionamento comercial herdado do upstream.

## Produto e público

O Estallo CRM é um SaaS da Estallo para empresas que atendem e vendem por WhatsApp. Reúne atendimento, clientes, funil, agenda e automação com IA. A Estallo hospeda, administra e comercializa a plataforma; cada organização usa uma conta isolada por RLS e pelas permissões existentes.

A identidade do aplicativo é sempre Estallo CRM. O cliente mantém seu nome, cadastro, dados legais e identidade nos documentos comerciais. Esses dados não substituem o logo, as cores, os títulos ou a navegação do produto. As estruturas de white-label herdadas permanecem como compatibilidade técnica, sem participação na identidade do SaaS.

## Referência visual única

O [Design System Estallo](design-system/README.md), baseado no Estallo Brand System v1.0 fornecido pelo proprietário, é o único padrão visual deste produto. Substitui a identidade herdada em documentação, specs e decisões futuras. Tokens operacionais vivem em `app/globals.css`; adaptações do CRM devem manter a identidade e a acessibilidade. O laboratório antigo não é referência normativa.

A implantação do padrão é progressiva: a primeira etapa abaixo está entregue; o redesenho interno dos módulos continua pendente, sob essa mesma referência.

## Identidade e navegação — primeira etapa

- Símbolo e logotipo oficiais da Estallo, com descritor CRM; fontes Sora, Manrope e JetBrains Mono servidas pelo aplicativo.
- Azul para ação, verde para resultado, Ink para navegação e texto. Variações mais escuras nos controles garantem leitura; cores originais preservadas na assinatura da marca.
- Navegação por objetivos: Atendimento, CRM, Agente de IA, Canais e Análise. Configurações permanece no rodapé; permissões, hubs, busca e navegação mobile continuam usando o catálogo canônico.
- A empresa ativa aparece como contexto da conta, sem alterar a marca do produto. Claro e escuro têm tokens próprios.
- A primeira etapa muda identidade, estrutura visual da navegação, acesso e apresentação dos planos. O redesenho interno de Inbox, kanban, dashboard e demais módulos será expandido depois.

## Comercial — planos e cobrança

Decisão do proprietário em 12/11/2026: a cobrança usa o módulo herdado (`lib/cobranca/`, provedor Stripe), que já tinha Checkout e Portal hospedados, webhook relido na Stripe, régua de inadimplência e limites no banco. A adaptação do Nutrigg deixou de ser necessária. A assinatura é paga só por cartão (Pix e boleto ficam fora do Checkout de assinatura); trial de 14 dias com cartão cadastrado.

| Plano        | Mensal | Semestral (−17%)      | Anual (−28%)          |
| ------------ | -----: | --------------------- | --------------------- |
| Essencial    | R$ 247 | R$ 1.230 (≈ R$ 205/mês) | R$ 2.134 (≈ R$ 177,83/mês) |
| Profissional | R$ 447 | R$ 2.226 (≈ R$ 371/mês) | R$ 3.862 (≈ R$ 321,83/mês) |
| Escala       | R$ 947 | R$ 4.716 (≈ R$ 786/mês) | R$ 8.182 (≈ R$ 681,83/mês) |

Desconto sobre seis ou doze mensalidades, arredondado para baixo em reais inteiros. Na tela, o número grande do semestral e do anual é a mensalidade equivalente; o valor do período fica pequeno embaixo.

| Limite                    | Essencial | Profissional | Escala       |
| ------------------------- | --------: | -----------: | -----------: |
| Pessoas na equipe         |         4 |           15 |           40 |
| Conexões                  |         3 |           10 |           50 |
| Pipelines / etapas        |     5 / 8 |      20 / 15 | ilimitado / 25 |
| Leads                     |     5 mil |      100 mil |      500 mil |
| Automações do CRM         |         8 |           20 |           80 |
| Webhooks de entrada       |         3 |           15 |           80 |
| API REST (token `dsk_`)  |       não |          sim |          sim |
| Teto de IA por mês        |   US$ 10  |      US$ 25  |      US$ 60  |

Sem MCP como recurso comercial. Todos os limites são aplicados no banco (gatilhos `trg_trava_*_do_plano`, migration 0718) e a API por `fn_plano_libera_api`. Fonte dos valores: `lib/planos/catalogo.ts`; quem grava as nove linhas em `cobranca_planos` é `scripts/cobranca-planos-estallo.ts`. Depois disso vale o banco, editável em /admin/cobranca › Planos.

Para ativar: ligar o módulo em /admin/sistema, conectar a chave restrita da Stripe em /admin/cobranca › Conexão, rodar o script dos planos. Empresas que já existem ficam isentas (sem plano, sem limite) até o dono atribuir um plano a cada uma. Quem se cadastra começa o teste grátis no Profissional mensal.

Fora de escopo ainda: nota fiscal (NFS-e), limites de requisições por minuto por plano, troca de período (mensal ↔ anual) com assinatura já paga — hoje é cancelar e assinar de novo.

## Operação e aceite

A implantação atual é um piloto; não constitui dimensionamento de uma plataforma comercial. Escalabilidade, WhatsApps simultâneos, capacidade e disponibilidade precisam de validação antes da abertura a clientes.

GitHub Actions permanece desativado por decisão do proprietário após esgotamento da cota. Esta etapa é validada localmente, sem disparar workflows. A VPS de produção não faz build: as imagens são construídas fora dela e transferidas por SSH (ver `docs/estallo-vps.md`).

Aceite desta etapa: marca consistente em acesso, navegação e ícones; operação desktop/mobile e claro/escuro; catálogo de navegação preservando RBAC; documentação coerente; ausência de alterações na licença MIT.

## Living System Checklist

1. Entrada: Design System oficial, catálogo de navegação, organização ativa e papéis autenticados.
2. Saída: componentes de marca, shell, acesso e tela Plano e cobrança.
3. Registro: navegação é leitura; não cria cobrança, assinatura ou alteração de configuração.
4. Superfície: menu lateral/mobile, barra superior, login e Configurações.
5. Porta: catálogo existente leva a Plano e cobrança e Identidade do produto.
6. Anti-morte: estados demonstrativos dizem por que não há contratação; dados da empresa têm link para o cadastro.
7. Configuração: identidade pertence ao produto; dados da empresa continuam em Configurações. Stripe é pendência operacional explícita.
8. Continuidade: atendimento e handoff não mudam nesta etapa.
9. Retorno: falhas visuais são verificadas em desktop/mobile, temas e navegação; ausência de Stripe não inicia uma operação financeira.
10. Mapa: `architecture/estallo-identidade.architecture.json` registra as relações desta etapa.

## Origem

O produto deriva do DeskcommCRM. Histórico, copyright e licença MIT da base permanecem preservados. Documentos históricos do upstream não definem a oferta comercial da Estallo.
