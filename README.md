# Estallo CRM

CRM SaaS da Estallo para empresas que atendem e vendem por WhatsApp. Atendimento, clientes, funil, agenda e automação com IA em uma plataforma administrada pela Estallo.

[Visão do produto](VISION.md) · [Direção e pendências](docs/estallo-produto.md) · [Documentação técnica](docs/index.md) · [Operação da VPS](docs/estallo-vps.md)

## Modelo do produto

- SaaS hospedado pela Estallo, com contas por organização e isolamento multi-tenant.
- Marca Estallo CRM fixa. Nome e dados da empresa identificam a conta e os documentos comerciais.
- Planos e limites fazem parte da oferta futura. A apresentação atual é demonstrativa: não cobra nem aplica limites.
- Stripe será a integração comercial, usando a implementação do Nutrigg como referência. Credenciais, produtos e preços finais estão pendentes.

## Identidade

Logo oficial, Sora nos títulos, Manrope na interface e JetBrains Mono nos dados técnicos. Azul para ação, verde para resultado e Ink para navegação. Fontes e geometria são versionadas para não depender de serviços externos durante o build ou uso.

## Desenvolvimento

Node 22 e pnpm 9.15.9. Segredos ficam fora do Git; `.env.example` documenta o contrato de configuração.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
```

Os gates complementares de banco, shell e E2E estão descritos em [AGENTS.md](AGENTS.md). Não execute E2E destrutivo contra produção. Os workflows deste fork estão ligados desde 31/10/2026, e voltaram a executar jobs com a cobrança regularizada (05/11/2026); até a primeira publicação no GHCR ser provada, o deploy usa imagens locais (ver [docs/estallo-vps.md](docs/estallo-vps.md)).

## Operação atual

O piloto usa Supabase e Docker Swarm na VPS da Estallo. Deploy, backups, recuperação e limitações são descritos em [docs/estallo-vps.md](docs/estallo-vps.md). A primeira etapa do redesign está em [docs/estallo-produto.md](docs/estallo-produto.md). O [Design System Estallo](docs/design-system/README.md) é a única referência visual vigente para todos os módulos.

## Origem e licença

Fork de [DeskcommCRM](https://github.com/melgarafael/DeskcommCRM). Código e histórico de origem, copyright e [licença MIT](LICENSE) preservados. O modelo comercial e a identidade do Estallo CRM são definidos pela Estallo; posicionamento histórico do upstream não descreve esta oferta.
