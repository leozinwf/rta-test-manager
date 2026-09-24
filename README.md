# RTA Test Manager 1.23.0

Extensão Chrome (Manifest V3) para melhorar o modal **Executar** do editor de fluxo Dootax/RTA.

## O que ela faz

- salva quantos cenários de request JSON você quiser;
- permite título, descrição, edição, duplicação, exclusão e busca;
- carrega um cenário no Ace ao clicar no card;
- gera várias requests mudando somente um campo, como `cnpj` ou `im`;
- seleciona vários cenários e aciona o botão nativo **Executar** em sequência;
- importa e exporta todos os cenários em JSON;
- mantém os dados localmente no perfil do Chrome (`chrome.storage.local`).
- exibe os cenários em lista ao lado do editor e permite aumentar sua altura arrastando a borda inferior.
- organiza os cenários em pastas, com criação, renomeação, exclusão e filtro por grupo.
- amplia os seletores de paginação com **50**, **100** e **Todos** nas telas do Dootax.
- permite redimensionar as colunas das tabelas arrastando o cabeçalho, como no Excel;
- mantém o scroll horizontal dentro da tabela sem bloquear a rolagem vertical da página.
- permite copiar, recortar, colar e mover cenários entre pastas.
- mantém a lista de cenários em uma área com scroll próprio;
- deixa a primeira coluna de seleção compacta por padrão;
- reutiliza a modal Executar quando possível durante os lotes e só a reabre quando necessário.
- preserva as larguras originais de cada tabela até que uma coluna seja arrastada;
- mantém as divisórias de redimensionamento sempre visíveis;
- aplica altura fixa somente em listagens grandes, sem ampliar tabelas pequenas de formulário.
- amplia o painel lateral de cenários para 430 px;
- move os controles do lote para o rodapé nativo, ao lado de Repetir e Executar;
- exibe os botões **Importar** e **Exportar** por texto.
- reúne busca, importação, exportação, novo cenário e lote no rodapé da modal;
- adiciona pré-visualização do cenário pelo botão de olho, com hover e fixação por clique;
- detecta bloqueio de novas abas e orienta como liberar pop-ups;
- recupera o conteúdo completo de valores truncados pela interface quando a coluna possui espaço.
- também recupera valores pelo tooltip da página quando eles não estão disponíveis nos props do React;
- adiciona botão `X` para recolher o quadro de detalhes do cenário.
- adiciona filtros persistentes à lista de robôs por nome, descrição, status,
  card relacionado, componente e rótulos;
- permite abrir a edição de um robô em outra aba com `Ctrl+clique` ou com o
  botão do meio sobre o nome do robô.
- adiciona pesquisa persistente à tabela de **Workflow**, incluindo busca geral,
  ID, rascunho, status, autor, tester, card, plugins, componentes e rótulos.
- oferece pesquisa geral também nas listas de **Meus Rascunhos** e
  **Execuções**, com critérios específicos para as colunas de cada tela.

## Novidades da versão 1.23.0

- O status **Rascunho** fica sempre disponível no filtro de **Meus Rascunhos**
  e as opções são reunidas também de tabelas atualizadas pela navegação interna.
- Painéis ligados a tabelas antigas ou ocultas deixam de substituir o painel da
  listagem atualmente visível.
- No Workflow, o botão da extensão passa a se chamar **Criado por / Pesquisa**,
  diferenciando claramente a pesquisa local do filtro nativo da aplicação.
- A restauração de **Todos** agora espera a requisição de paginação ser
  identificada e confirma que ela foi reescrita com o total real antes de mudar
  o seletor visual.
- Quando essa confirmação falha, o seletor volta ao tamanho nativo verdadeiro,
  evitando exibir **Todos** sem que todos os registros tenham sido carregados.

## Novidades da versão 1.22.0

- O botão **Filtros** de **Meus Robôs** agora reutiliza as mesmas classes visuais
  do botão nativo da tela de Workflow.
- A lista de status passa a ser reconstruída quando o conteúdo renderizado não
  corresponde aos dados da tabela e também reage a atualizações de texto.
- O campo **Criado por** do Workflow oferece sugestões com os autores presentes
  nos itens carregados e continua aceitando pesquisa parcial.
- Os cabeçalhos do Workflow agora ordenam localmente ao clique, alternando entre
  ordem crescente e decrescente e indicando visualmente a direção aplicada.

## Novidades da versão 1.21.0

- Reorganiza o painel de pesquisa com cabeçalho, busca geral destacada, filtros
  por coluna, seção de status e botão de fechamento.
- Aumenta a área útil, o espaçamento e o tamanho dos campos e adapta o painel
  para telas menores.
- Atualiza as opções de status sempre que o painel é aberto, fazendo estados
  carregados posteriormente — como **Rascunho** e **Pronto para QA** — aparecerem
  corretamente no filtro.

## Novidades da versão 1.20.0

- **Meus Rascunhos** ganhou pesquisa geral combinável com nome, descrição,
  status, card relacionado, componente e rótulos.
- **Execuções** ganhou pesquisa geral e campos para robô/rascunho, status,
  cliente, ambiente, origem e datas de criação, início e fim do processamento.
- A pesquisa de Execuções fica ao lado do filtro nativo sem substituir os
  critérios já selecionados nele.
- Os filtros das três telas são salvos separadamente, evitando que uma pesquisa
  de Workflow seja aplicada em Rascunhos ou Execuções.

## Novidades da versão 1.19.0

- A tela **Workflow** ganhou o botão **Pesquisa**, ao lado do filtro nativo.
- A pesquisa geral procura o texto informado em todas as colunas úteis da linha.
- Também é possível combinar pesquisas específicas por ID, rascunho, criado por,
  tester, card relacionado, plugins, componentes e rótulos.
- O status permite selecionar uma ou mais opções encontradas na página.
- Os critérios ficam salvos separadamente para a tela de Workflow e são
  restaurados ao recarregar ou voltar para a listagem.

## Novidades da versão 1.18.4

- Restringe a extensão às páginas HTTPS oficiais em `dootax.com.br`.
- Aprende o endpoint usado pelo seletor nativo antes de alterar a paginação,
  evitando modificar campos `size`, `limit` ou `take` de outras requisições.
- Intercepta a navegação do histórico apenas durante a leitura de uma URL de
  inspeção e restaura as funções originais imediatamente depois.

## Novidades da versão 1.18.3

- Corrige a abertura do menu **Filtros** dentro de barras que recortam conteúdo,
  mantendo o painel visível e ancorado ao botão.
- Na tela **Meus Rascunhos**, isola o botão da camada nativa que interceptava o
  clique, preservando sua posição ao lado de **Exportar tudo**.
- O botão **Filtros** agora fica imediatamente depois de **Exportar tudo** na
  mesma barra de ações.
- A cópia de URLs intercepta também a navegação interna da tela de inspeção,
  lê os dados em segundo plano e mantém a lista de execuções aberta.
- A escolha **Todos** é salva assim que aplicada e restaurada mesmo quando a
  página recria o controle de paginação.

## Novidades da versão 1.17

- O botão **Filtros** passa a reconhecer corretamente o ícone do botão nativo e
  é posicionado imediatamente ao lado de **Exportar tudo**.
- A cópia de URLs tenta primeiro ler os dados já carregados pelo RTA e, quando
  precisa abrir a inspeção, faz isso em segundo plano sem deixar uma nova tela
  aberta para o usuário.
- O botão **Copiar URL** também funciona quando **Inspecionar requisição** abre
  como página, além do formato de modal.
- A escolha **Todos** da paginação agora é salva por tela e restaurada ao voltar
  ou recarregar a página.

## Novidades da versão 1.16

- O filtro da lista de robôs agora fica recolhido em um botão no mesmo padrão
  visual das ações nativas da tela.
- O filtro de status mostra somente os status existentes nos itens carregados e
  permite selecionar dois ou mais ao mesmo tempo.
- A tela de execuções ganhou o botão **Copiar URLs**, habilitado ao selecionar
  uma ou mais linhas; as URLs são copiadas em lote, uma por linha.
- A modal **Inspecionar requisição** também ganhou o botão **Copiar URL** para a
  execução aberta.

## Novidades da versão 1.15

- Os filtros da lista de robôs ficam salvos e são restaurados ao voltar de uma
  edição ou recarregar a tela.
- Todos os seis cabeçalhos filtráveis agora têm um atalho de filtro, inclusive
  **Card Relacionado**, **Componente** e **Rótulos**.
- O nome de cada robô funciona como link de edição: clique normal edita na aba
  atual; `Ctrl+clique` ou botão do meio abre a edição em outra aba e mantém a
  lista original aberta com os filtros aplicados.

## Novidades da versão 1.11

- A tabela **Entradas de Mapeamento** ganhou uma ação para copiar o valor completo.
- URLs dessa tabela podem ser abertas em uma nova aba pelo botão ao lado do lápis e da lixeira.
- As duas ações recuperam o conteúdo original antes de copiar ou abrir, mesmo quando a tela mostra `...`.

## Novidades da versão 1.12

- Remove a altura máxima e a rolagem interna que a extensão aplicava à modal **Executar**.
- A modal volta a seguir o comportamento de rolagem original da página, mantendo o scroll próprio apenas na lista de cenários.

## Novidades da versão 1.13

- Restaura o scroll interno da modal **Executar**.
- Remove o scroll vertical interno que a extensão aplicava às tabelas, como **Meus Rascunhos**.
- Mantém apenas o scroll horizontal das tabelas quando as colunas ultrapassam a largura disponível.

## Novidades da versão 1.14

- Permite rolar a página com a roda do mouse mesmo quando o ponteiro está sobre uma tabela, como **Meus Rascunhos**.
- Mantém a rolagem horizontal dentro da tabela e o scroll interno da modal **Executar**.

## Copiar e mover cenários entre pastas

1. Marque um ou mais cenários. Se nenhum estiver marcado, será usado o cenário aberto.
2. No menu **Ações**, escolha **Copiar**, **Recortar** ou **Mover para…**.
3. Para colar, abra a pasta de destino e escolha **Colar aqui**.

Ao copiar, são criados novos cenários com o sufixo `(cópia)`. Ao recortar, os
cenários originais apenas mudam de pasta depois de colados. A área de
transferência fica salva no armazenamento da extensão mesmo se o painel fechar.

## Tabelas ajustáveis

- Arraste a divisória à direita de um título para aumentar ou diminuir a coluna.
- Dê dois cliques na divisória para voltar ao tamanho automático daquela coluna.
- As larguras são salvas no Chrome separadamente para cada página.
- Quando as colunas ultrapassam o espaço disponível, o scroll horizontal fica
  dentro da tabela. A roda do mouse continua rolando a página verticalmente.

## Paginação ampliada

Ao lado da tabela, o seletor de itens por página passa a oferecer `5`, `10`,
`15`, `25`, `50`, `100` e `Todos`. A extensão reconhece o controle pelo texto
`/ página`, portanto também funciona em outras páginas que reutilizem esse
componente.

Para `50`, `100` e `Todos`, a extensão mantém o componente original da tela e
ajusta os parâmetros de paginação da própria requisição. Em `Todos`, usa o total
informado pelo contador da tabela; se o total não estiver visível, solicita um
limite alto de segurança.

## Instalação

1. Extraia o arquivo ZIP.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `rta-test-manager`.
6. Recarregue a página do editor e abra o painel **Executar**.

## Uso rápido

1. Preencha a request no editor como já faz hoje.
2. Clique em **Salvar request atual** e informe título/descrição.
3. Clique no botão `+` ao lado do lápis para carregar a request.
4. Marque vários cards e use **Executar selecionados** para um lote.

### Variações de CNPJ ou IM

Selecione um cenário base e clique em **Variações**. Informe o campo (`cnpj`, `im` etc.) e cole um valor por linha. Também é aceito o formato:

```text
Cliente A | 42446277002306
Cliente B | 23048790000180
```

A extensão cria uma cópia da request base para cada valor e já deixa todas selecionadas.

## Como o lote funciona

Para cada cenário selecionado, a extensão carrega o JSON no Ace e clica no botão **Executar** original da página. Se o modal fechar, tenta reabri-lo pelo botão **Testar** antes do próximo cenário. O campo **Intervalo** controla a pausa entre os envios.

> O intervalo separa os disparos, mas não espera o robô terminar. Use um valor maior caso o painel bloqueie novos testes por alguns segundos.

## Compatibilidade e segurança

- O gerenciador de cenários só atua em `/dootax/editor`; a paginação ampliada
  atua nas páginas abaixo de `/dootax/` que tenham um seletor `N / página`.
- Não envia requests diretamente e não acessa servidores externos.
- Os testes ficam somente no armazenamento local do navegador. Não salve dados
  pessoais reais, credenciais ou tokens nos cenários.
- A integração evita classes CSS geradas e usa o título do modal, `#UNIQUE_ID_OF_DIV` e o botão nativo Executar.

Se o endereço do editor mudar de caminho, ajuste `matches` no `manifest.json`.
