## 1.27.4
- Adicionada reprovação em lote segura no Workflow para `PENDING_QA_REVIEW`.
- Justificativa obrigatória e retorno para `DRAFTING`.
- Aprovação ainda não implementada.

# Changelog

## 1.27.3
- Corrige `Failed to fetch` causado por chamadas da API de STG quando a extensão estava aberta em AUT/PROD.
- Ações que alteram workflow ficam protegidas e disponíveis somente em `stg.automation.dootax.com.br`.
- Consultas de IDs/workflow de STG deixam de ser executadas fora do STG.
- Oculta o ruído `Extension context invalidated` da paginação após recarregar manualmente a extensão; basta atualizar a aba.
- Corrige a faixa branca da última coluna colorida do Workflow restaurando a célula de ações para `table-cell`.

## 1.27.2
- Corrige clique em **Desatribuir QA** e **Atribuir a mim** na tela Workflow.
- Evita recriar a barra de seleção e o resumo a cada re-renderização do React.
- Ações de QA agora usam listener delegado em modo capture para sobreviver a re-renderizações do dashboard.

## 1.27.1
- Workflow: atribuição em lote para o QA logado via `bind-template-qa/{id}`.
- Workflow: desatribuição em lote via `unbind-template-qa/{id}`.
- IDs e dados do Workflow agora são obtidos do endpoint `/workflows/filter`, sem depender do clipboard.
- Confirmação e progresso sequencial antes de qualquer movimentação.

# Changelog

## 1.26.0
- Reestruturação de pastas.
- Correção do reconhecimento da tabela de rascunhos.
- Correção das ações em lote e cores de status.
- Correção estrutural do posicionamento do filtro.
- Sanitização XSRF/CSRF no Network Recorder.

## 1.26.1
- Atualização imediata das seleções/cores.
- Ordenação persistente.
- Restauração de paginação mais robusta.
- Refresh da lista após ações em lote sem F5 quando possível.

## 1.26.2
- Estabilização dos botões de ações em lote em páginas com MutationObserver/auto-refresh intenso.
- Correção específica do botão Reprovar.
