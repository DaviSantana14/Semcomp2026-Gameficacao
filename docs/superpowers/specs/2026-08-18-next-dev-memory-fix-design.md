# Correção do consumo descontrolado de memória no desenvolvimento web

## Contexto

O comando raiz `npm run dev` executa os workspaces web e API via Turbo. O
workspace web usa `next dev`, que no Next.js 16.2.4 seleciona o Turbopack. Em
Windows, as tentativas recentes deixaram de concluir a inicialização e pararam
durante a primeira compilação. O cache persistente do Turbopack existente ocupa
484,6 MB e antecede as mudanças recentes do projeto.

A investigação descartou alteração no script raiz, loop de redirecionamento,
lockfile ancestral, junction recursiva e vazamento relevante no heap JavaScript
da API. Os traces apontam o crescimento para a memória nativa do Turbopack.

## Alternativas consideradas

1. **Webpack apenas no desenvolvimento (escolhida).** Remove o Turbopack do
   caminho que apresenta o problema e não altera o build standalone usado no
   deploy.
2. **Limpar o cache e continuar no Turbopack.** É uma mudança menor, mas pode
   permitir a recorrência do mesmo problema e expor novamente a máquina a
   esgotamento de memória.
3. **Atualizar Next.js e manter Turbopack.** Não há evidência suficiente de que
   uma versão disponível tenha corrigido todos os relatos equivalentes; também
   ampliaria o escopo da mudança.

## Mudança proposta

- Alterar somente o script `dev` do workspace web de `next dev` para
  `next dev --webpack`.
- Adicionar um teste de contrato que impeça a remoção acidental do parâmetro
  `--webpack` enquanto esta mitigação for necessária.
- Preservar a saída gerada atual renomeando `apps/web/.next` para um diretório
  de diagnóstico datado. Nenhum código-fonte será removido.
- Não alterar `next build`, `output: "standalone"` nem os scripts de deploy.

## Verificação

A correção será verificada sem iniciar servidores:

1. O teste de contrato deve falhar antes da mudança e passar depois dela.
2. A suíte do workspace web deve continuar passando.
3. O build do workspace web deve concluir normalmente.
4. O diff deve conter apenas o teste, o script de desenvolvimento e este
   documento; a pasta de cache renomeada continuará ignorada pelo Git.

O teste comportamental de memória será feito posteriormente pelo usuário em uma
execução controlada, porque foi solicitado explicitamente que o agente não rode
`npm run dev`.
