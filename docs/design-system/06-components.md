# 06 — Componentes Estallo no CRM

Referência visual: [Design System Estallo](README.md). Implementação compartilhada: `components/ui/`, `components/` e tokens de `app/globals.css`. O showcase herdado não define variants nem estilos do produto.

## Composição e estados

Reutilizar os componentes existentes. Antes de criar uma variante, conferir o contrato do componente e seus consumidores. Não assumir que um inventário antigo descreve a API atual.

| Superfície          | Regra                                                           |
| ------------------- | --------------------------------------------------------------- |
| Botão principal     | Azul de ação com contraste; uma ação prioritária por contexto   |
| Botão secundário    | Superfície neutra e hierarquia inferior à principal             |
| Ação destrutiva     | Cor de erro, consequência clara e confirmação quando necessária |
| Input e formulário  | Label persistente, ajuda próxima e erro relacionado ao campo    |
| Card e tabela       | Hierarquia, comparação e responsável/próximo passo visíveis     |
| Badge               | Estado em texto; não só cor                                     |
| Modal, sheet e menu | Foco gerenciado, teclado, escape e retorno ao acionador         |
| Toast e aviso       | Resultado compreensível e orientação para continuar             |
| Skeleton e loading  | Preservar contexto e estrutura; redução de movimento            |

Todo componente interativo prevê default, hover, active, focus-visible, disabled, loading, sucesso e falha quando aplicável. Não inventar um estado visual sem retorno operacional.

## Atendimento e vendas

Inbox, conversa, composer, card de lead e painel do contato adotam a mesma identidade Estallo. As relações entre os dados, o fluxo de envio e o handoff permanecem governados pelas specs técnicas. O redesign precisa preservar status de envio, rascunho, erro recuperável, acesso por papel e histórico.

## Validação

Provar teclado, desktop/mobile, claro/escuro, conteúdo longo, estados vazios e falhas. Utilizar tokens semânticos; não copiar `.ds-*` do laboratório sem conferir a implementação real. A revisão interna dos módulos continua progressiva.
