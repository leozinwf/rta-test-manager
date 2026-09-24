# RTA Test Manager — Network Recorder v1.24.0

Arquivos desta atualização:

- `network-recorder-bridge.js` — intercepta `fetch` e `XMLHttpRequest` no contexto MAIN.
- `network-recorder.js` — interface, filtros, detalhes, cópia sanitizada e exportação.
- `network-recorder.css` — estilos.
- `manifest.json` — versão 1.24.0 já configurada para carregar os novos módulos.

## Instalação sobre o repositório atual

1. Antes de copiar estes arquivos, atualize sua pasta local:
   `git pull origin main`
2. Copie os quatro arquivos para a raiz do `rta-test-manager`.
3. O `manifest.json` deste pacote substitui o atual.
4. Abra `chrome://extensions`.
5. No RTA Test Manager, clique em **Recarregar**.
6. Recarregue a página do RTA com `Ctrl+F5`.

## Uso

Clique em **Rede** no canto inferior direito, informe opcionalmente um nome e clique em **Iniciar**.
Faça a ação no RTA e clique em **Parar**. É possível abrir cada chamada, filtrar, copiar uma versão sanitizada para análise ou exportar JSON.

A captura fica somente em memória na aba e é apagada ao recarregar a página ou clicar em Limpar.
Headers/campos sensíveis conhecidos são mascarados na cópia/exportação, mas revise o conteúdo antes de compartilhar.
