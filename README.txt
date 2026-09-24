RTA Test Manager v1.25.1 - correção das ações em lote

Substitua na raiz da extensão:
- workflow-batch.js
- workflow-batch.css
- manifest.json

Depois:
1. chrome://extensions
2. Recarregar RTA Test Manager
3. Ctrl+F5 no RTA

Correções:
- seleção agora é lida diretamente das checkboxes marcadas;
- não depende mais de um Set interno ficar sincronizado com React;
- barra de ações fica imediatamente acima da tabela;
- botões separados para Testes e Code Review;
- seleção mista gera ações separadas;
- reprovação continua aceitando todos os selecionados;
- cores ficaram um pouco mais fortes.
