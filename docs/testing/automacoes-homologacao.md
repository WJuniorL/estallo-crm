# Roteiro de homologação — Automações (Fases 3 a 7)

Para o proprietário, pela tela, numa instalação de teste. Cada jornada diz **o que fazer**, **o que deve aparecer** e
**o que já foi provado por teste automático** — e o que não foi. Marque «homologado» só depois de ver na tela.

**Antes de começar**

- Banco com as migrations até a **0717** aplicadas (instalação nova: o `baseline.sql` já traz; banco existente: aplicar
  0715, 0716 e 0717 antes de subir a versão).
- `AI_CRED_AES_KEY` configurada (sem ela não dá para cadastrar credencial de conexão HTTP).
- Para os casos com **IA real**: chave de IA da organização em Configurações › IA. Para **canal real**: um número de
  teste conectado. Sem eles, o caso fica **pendente**, não homologado.
- Entre como **admin** (cadastrar conexão exige admin) e tenha um **manager** e um **viewer** para os testes de papel.

---

## 1. Execuções do fluxo ao vivo (Fase 3)

1. Abra um fluxo publicado com execuções › aba **Execuções**.
2. Filtre por versão, modo e período; abra uma execução.

**Esperado:** a lista atualiza sozinha enquanto a execução anda (selo «ao vivo»); no dossiê, cada passagem por bloco
aparece com entrada, saída e erro; diário cortado avisa que foi cortado.
**Provado:** invariante `automacoes-execucoes-no-realtime`; escala com 10 mil execuções — página em 0,13 ms
(`evidence/automacoes-fase8/escala-10k-execucoes.json`). **Não provado:** a tela no navegador.

## 2. Dados e variáveis (Fase 4)

1. Num rascunho, adicione **Mapear dados** com um campo `total` (número) a partir de um bloco anterior.
2. Num bloco seguinte (nota, tarefa), use **Inserir variável** › o campo.
3. Tente excluir o Mapear dados.

**Esperado:** a prévia mostra o valor de exemplo (ou de uma execução real escolhida); excluir avisa quem depende dele.

## 3. Requisição HTTP com conexão protegida (Fase 5)

1. Adicione **Requisição HTTP** › **Gerenciar conexões** › cadastre nome, endereço base (`https://…`), autenticação e
   credencial › **Cadastrar conexão**.
2. Feche, escolha a conexão, método `POST`, caminho `/algo/{{variável}}`, corpo JSON com variáveis.
3. Publique e faça uma execução passar pelo bloco (contra um endereço de teste que você controle).
4. Repita com um endereço que demore mais de 10 s ou que responda 500.

**Esperado:** a credencial nunca reaparece (só `••••` e os 4 últimos); o caminho não consegue apontar para outro
domínio; resposta 2xx segue e o status/corpo viram variáveis; 500 falha (segue pela saída de erro, se houver);
demora/queda para a execução **para revisão na Central** e nada é reenviado sozinho.
**Provado:** e2e `automacoes-blocos-de-integracao` (cadastro e tela), invariante `automacoes-requisicao-http` (2xx,
incerto, queda depois da intenção não reenvia, não-saiu tenta de novo, 500, conexão inexistente, ninguém lê a
credencial pela sessão). **Não provado:** chamada a um sistema externo real.

## 4. Buscar ou criar contato e negócio + «Aplicar em» (Fase 5)

1. Adicione **Buscar ou criar contato** (telefone vindo de uma variável, «criar se não achar» ligado).
2. Ligue a ele **Buscar ou criar negócio** (Contato = «Contato de …», funil e etapa de entrada).
3. Ligue um **bloco de tag** e, em **Aplicar em**, escolha «Negócio de …».
4. Publique e faça uma execução passar.

**Esperado:** o contato é achado (sem duplicar) ou criado; o negócio novo nasce na etapa escolhida, com «Entrou no
funil» na linha do tempo; a tag vai para o negócio NOVO; o negócio da execução não muda.
**Provado:** invariante `automacoes-buscar-ou-criar`; publicação recusa «Aplicar em» que não seja de bloco anterior.

## 5. Extrair dados por IA (Fase 5)

1. Adicione **Extrair dados por IA** com «Texto a ler» vazio (= última mensagem do cliente) e campos `cidade` (texto)
   e `pessoas` (número).
2. Use `{{… cidade}}` numa nota seguinte. Publique; o cliente manda «moro em Recife, somos 3».

**Esperado:** a nota sai com «Recife»; o consumo de IA da organização conta uma chamada; o que a IA não achar fica
vazio (nunca inventado).
**Provado:** invariante `automacoes-extrair-dados` (modelo simulado) e validação por tipo. **Pendente:** IA real.

## 6. Recuperar e simular (Fase 6)

1. Numa execução **morta**, **Recuperar da falha**. 2. No rascunho, **Simular caminho**.

**Esperado:** a recuperação começa no bloco que falhou e mostra os passos herdados; a simulação percorre o rascunho
com dados de exemplo e não envia nem grava nada.

## 7. Exportar e importar (Fase 7)

1. Exporte um fluxo que usa etapa, responsável e conexão HTTP. 2. Importe em outra organização: escolha o
equivalente de cada item.

**Esperado:** o arquivo não leva credencial; a importação pede o equivalente de cada item (a conexão HTTP inclusive)
e recusa item de outro tipo.

## 8. Papéis, temas e celular

- **Viewer** não vê nem altera conexão; **manager** monta fluxo mas não cadastra conexão.
- Repita uma jornada no celular e no tema escuro; navegue o painel do bloco só pelo teclado.

---

**Fora deste roteiro (não entregue):** bloco «próxima ação» com aprovação; enviar mensagem para o contato criado por
«Buscar ou criar» (o envio segue preso à conversa da execução); arrastar variável para o campo.
