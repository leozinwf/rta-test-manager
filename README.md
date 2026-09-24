# RTA Test Manager — v1.26.2

Reorganização geral da extensão.

## Estrutura
- `core/`: bridges que precisam executar no contexto principal da página.
- `features/`: funcionalidades da extensão.
- `styles/`: estilos de cada funcionalidade.
- `docs/`: documentação auxiliar.

## Correções desta versão
- Workflow em lote reconhece os cabeçalhos mesmo quando o RTA injeta ícones de ordenação no texto.
- Cores por status voltam a receber as classes corretas.
- Filtro da tela Meus Rascunhos reconhece o botão `Exportar` atual.
- O botão Filtros não usa mais coordenadas `position: fixed`; ele fica no layout real da toolbar.
- O popover de filtros continua flutuante somente quando aberto.
- Sanitização do capturador inclui XSRF/CSRF.
- Removidos arquivos temporários, patches antigos, READMEs duplicados e `.git` do pacote distribuível.

## Instalação
1. Extraia o ZIP.
2. Chrome > Extensões > Modo do desenvolvedor.
3. Remova/desative a cópia antiga para evitar duas versões executando juntas.
4. Clique em `Carregar sem compactação` e selecione a pasta extraída.
5. Abra/recarregue o RTA com `Ctrl+F5`.

As preferências continuam em `chrome.storage.local`.


## Ajustes 1.26.1
- Seleção, cores e barra de lote atualizam imediatamente ao marcar/desmarcar checkbox.
- Ordenação de `Meus Rascunhos` e Workflow fica salva no navegador e é reaplicada após F5.
- Paginação salva é reaplicada com atraso controlado e verificação da quantidade carregada.
- Após uma ação em lote, tenta atualizar apenas a lista pelo botão nativo de refresh; recarrega a página inteira apenas como fallback.


## Ajuste 1.26.2
- Corrigido clique dos botões da barra de ações em lote.
- A barra não é mais reconstruída a cada atualização automática do dashboard.
- Botões usam `type="button"` e impedem propagação/submissão acidental.
