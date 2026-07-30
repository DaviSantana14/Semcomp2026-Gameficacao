# Redesign do fluxo do participante: login, ranking e lojinha

## Contexto

O dashboard do participante já usa a identidade aprovada da SEMCOMP 2026, mas `/login`, `/ranking` e `/lojinha` ainda preservam a estética provisória do sistema: `arcade-grid`, `scanline`, cartões genéricos, vocabulário sem acentuação e navegação isolada por botões “Voltar” e “Sair”.

Este redesign aplica às três telas a direção definida em `docs/identidade-visual-semcomp-game.md` e já materializada no dashboard: palco quase preto, roxo localizado, verde-limão reservado a ação e avanço, Thunder nos títulos, JetBrains Mono nos dados e checkpoints/órbitas como assinatura gráfica.

As decisões foram aprovadas por comparação visual no companion:

- ranking e lojinha usam o shell compartilhado do participante;
- login usa a composição editorial imersiva;
- ranking usa Top 3 hierárquico, lista silenciosa e posição pessoal persistente;
- lojinha destaca saldo, estados de disponibilidade e confirmação própria de resgate.

## Objetivo

Fazer login, dashboard, ranking e lojinha parecerem etapas do mesmo produto, sem alterar contratos de API, permissões, regras de autenticação, cálculo de XP, saldo de PTS, ordenação do ranking ou regras de resgate.

## Arquitetura compartilhada

### Shell do participante

O layout atualmente embutido em `participant-dashboard.tsx` será extraído para um componente compartilhado em `apps/web/src/components/semcomp/participant-shell.tsx`.

O shell recebe:

- o usuário autenticado;
- a rota ativa entre `/home`, `/ranking` e `/lojinha`;
- o conteúdo da página como `children`.

Ele é responsável por:

- atmosfera global `semcomp-atmosphere`;
- logo oficial;
- selo “participante”;
- navegação e checkpoint da rota ativa;
- identificação por iniciais, nome e e-mail;
- logout;
- composição lateral no desktop e navegação compacta no mobile.

`ParticipantDashboard`, `RankingClient` e `ParticipantShop` permanecem responsáveis somente pelo conteúdo e pelas regras de suas páginas.

### Limites de acesso

- Participantes autenticados veem ranking e lojinha dentro do shell compartilhado.
- A lojinha continua redirecionando administradores para `/admin/lojinha`.
- O modo observador do administrador em `/ranking` permanece funcional, mas não usa o shell de participante; recebe cabeçalho operacional com retorno para `/admin`.
- Erros `401` continuam redirecionando para `/login`.

## Login

### Composição desktop

O login usa duas zonas em uma superfície editorial única:

1. lado esquerdo com logo, contexto, título Thunder, frase curta e uma órbita/checkpoint ambiental;
2. lado direito com formulário escuro, silencioso e legível.

Não existem fotografias, cartões explicativos de XP/PTS/CODE, “Live Score”, grade de arcade ou scanlines.

### Conteúdo

- Marcador: `checkpoint de entrada`.
- Título: `Sua jornada começa aqui.`
- Descrição: `Entre para acompanhar conquistas, posição e recompensas.`
- Título do formulário: `Entrar`.
- Ajuda: `Use o CPF e o e-mail cadastrados no evento.`
- CTA: `Entrar na jornada`.
- Link secundário: `Criar cadastro`.

Erros e mensagens existentes passam a usar português com acentuação correta. A validação por CPF com 11 dígitos, normalização do e-mail, chamada de login e redirecionamento por papel permanecem inalterados.

### Responsividade

- No desktop, editorial e formulário coexistem em duas colunas.
- No mobile, a composição vira uma coluna; logo, contexto curto e formulário ficam visíveis antes da arte ambiental.
- A órbita é reduzida ou parcialmente recortada, nunca interfere na leitura ou interação.
- A tela funciona desde `320px` sem overflow.

## Ranking

### Cabeçalho

- Marcador: `ranking // SEMCOMP 2026`.
- Título: `Sua posição na jornada.`
- Explicação reforça que XP define o ranking e PTS permanece reservado à lojinha.
- Filtros `Geral` e `Hoje` continuam claros, com `aria-pressed` e transição de estado discreta.

### Hierarquia do placar

O conteúdo usa duas áreas no desktop:

1. placar principal com Top 3 e posições seguintes;
2. painel lateral com posição do participante e liderança atual.

O Top 3 usa escala, ordem e borda para criar hierarquia:

- primeiro lugar ocupa a posição central e recebe o maior peso visual;
- segundo e terceiro lugares têm peso equivalente entre si;
- a ordem semântica no DOM permanece `#01`, `#02`, `#03`; somente o posicionamento visual coloca `#01` no centro em desktop;
- não há pódio metálico, dourado estrutural ou ícones de troféu repetidos;
- XP usa JetBrains Mono.

As posições seguintes usam linhas e divisores dentro de um painel único, não um cartão por participante. O painel “Minha posição” continua visível mesmo quando o participante não aparece no Top 10.

Quando houver menos de três participantes, somente as posições existentes são renderizadas e o layout se recompõe sem espaços artificiais.

### Mobile

- O primeiro lugar ocupa uma linha inteira.
- Segundo e terceiro lugares dividem a linha seguinte quando ambos existirem.
- As posições restantes viram blocos compactos com posição, nome e XP.
- “Minha posição” aparece antes da liderança atual.
- Não existe rolagem horizontal global.

## Lojinha

### Cabeçalho e saldo

- Marcador: `recompensas // SEMCOMP 2026`.
- Título: `Transforme pontos em conquistas.`
- Descrição explica que resgatar usa PTS sem alterar XP ou ranking.
- O saldo atual aparece junto ao título em um painel compacto: `620 PTS`.

### Cartões de recompensa

Cada cartão apresenta, nessa ordem:

1. imagem real do próprio item, quando disponível, ou placeholder gráfico da SEMCOMP;
2. custo em PTS;
3. estoque ou disponibilidade em texto;
4. nome e descrição;
5. ação correspondente ao estado.

Estados:

- disponível: CTA verde-limão `Resgatar`;
- saldo insuficiente: controle desabilitado com texto `Saldo insuficiente` e tratamento roxo discreto;
- esgotado: controle desabilitado `Esgotado` em superfície neutra;
- resgatando: CTA desabilitado `Resgatando...`.

Cor nunca é o único indicador. Imagens de itens são permitidas; fotografia editorial do evento continua fora de escopo.

### Confirmação de resgate

`window.confirm` será removido. Um diálogo acessível apresenta:

- nome da recompensa;
- custo do resgate;
- saldo atual;
- saldo estimado após o resgate;
- ação secundária `Cancelar`;
- ação principal `Resgatar por {custo} PTS`.

O diálogo usa o componente compartilhado de diálogo, prende foco, fecha com `Esc` quando a mutação não está pendente e devolve foco ao botão de origem. Durante a mutação, a confirmação fica desabilitada.

Após sucesso:

- o diálogo fecha;
- as queries `me` e `rewards` são invalidadas;
- o toast informa `Resgate de {item} criado. Retire no evento.`

Em falha, o diálogo permanece aberto e apresenta uma mensagem inline com `role="alert"`; o toast pode repetir o erro, mas não é a única fonte de feedback. O usuário pode tentar novamente sem reabrir a confirmação.

### Responsividade

- Uma coluna em mobile, duas em tablet e três em desktop largo.
- Saldo ocupa a largura disponível abaixo do título em telas estreitas.
- O diálogo usa quase toda a largura em mobile, preservando margem de `16px`.
- Nenhum conteúdo essencial fica abaixo de `12px`.

## Estados de página

### Carregamento

- Login preserva o formulário enquanto a submissão está pendente e troca o CTA para `Entrando...`.
- Ranking e lojinha usam skeletons com a geometria aproximada do cabeçalho, painéis e listas finais.
- Não há glow pulsante ou salto estrutural grande.

### Erro recuperável

- Erros não relacionados a autorização aparecem dentro da composição final da página.
- A mensagem explica o problema e oferece `Tentar novamente`, acionando `refetch` da consulta correspondente.
- A navegação do shell permanece disponível.

### Vazio

- Ranking vazio: `Ninguém pontuou neste período ainda.` e orientação para resgatar uma atividade.
- Participante sem posição: `Participe de uma atividade para entrar no placar.`
- Lojinha vazia: `Nenhuma recompensa está disponível agora.` sem criar uma ação inexistente.

### Autorização

- `401` redireciona para `/login`.
- Administrador em `/lojinha` redireciona para `/admin/lojinha`.
- Nenhum conteúdo protegido é exibido antes da confirmação do papel do usuário.

## Movimento

- Login tem uma única órbita ambiental lenta.
- Ranking anima somente a troca de período e pequenas mudanças de seleção.
- Lojinha usa transições de estado de botão e diálogo.
- Todos os movimentos respeitam `prefers-reduced-motion`.
- Nenhum cartão recebe animação de entrada individual.

## Acessibilidade

- Logo mantém texto alternativo `SEMCOMP 2026`.
- Navegação possui rótulo e `aria-current="page"` na rota ativa.
- Campos preservam rótulos visíveis, autocomplete, `aria-invalid` e mensagens associadas.
- Erros de formulário usam `role="alert"`.
- Filtros do ranking mantêm nome e estado pressionado.
- Imagens decorativas ou placeholders usam alternativa vazia; imagens informativas usam o nome do item.
- Diálogo de resgate possui título e descrição acessíveis.
- Alvos interativos têm ao menos `44 × 44px`.
- Foco permanece visível em fundo escuro.

## Componentes e arquivos previstos

- `components/semcomp/participant-shell.tsx`: layout e navegação compartilhados.
- `app/home/participant-dashboard.tsx`: passa a renderizar somente o conteúdo do dashboard dentro do shell.
- `app/login/auth-shell.tsx`: composição editorial imersiva.
- `app/login/login-form.tsx`: conteúdo, acentuação e estados do formulário.
- `app/ranking/ranking-client.tsx`: consultas, períodos e composição da página.
- `app/ranking/ranking-podium.tsx`: Top 3 responsivo.
- `app/ranking/ranking-row.tsx`: linha reutilizável das posições seguintes e posição pessoal.
- `app/lojinha/shop-client.tsx`: consulta, mutação e composição do catálogo.
- `app/lojinha/reward-card.tsx`: apresentação e estado de cada recompensa.
- `app/lojinha/reward-redemption-dialog.tsx`: confirmação e feedback persistente.

Esses limites evitam aumentar ainda mais os clientes atuais e mantêm consulta, apresentação e confirmação testáveis de forma isolada.

## Fora de escopo

- Redesenhar cadastro, dashboard ou telas administrativas além da extração necessária do shell.
- Alterar API, banco, regras de autenticação, XP, PTS, ranking, estoque ou resgate.
- Criar histórico de resgates do participante.
- Adicionar fotografias editoriais.
- Alterar o catálogo ou cadastrar recompensas.
- Remover o modo observador do administrador no ranking.

## Estratégia de testes

### Shell

- renderiza logo, usuário e navegação;
- marca corretamente Início, Ranking ou Lojinha;
- preserva navegação mobile e logout.

### Login

- valida CPF e e-mail;
- preserva normalização e payload;
- exibe erro acessível;
- redireciona participante para `/home` e administrador para `/admin`.

### Ranking

- alterna Geral/Hoje e usa o período correto na consulta;
- posiciona visualmente o Top 3 sem alterar a ordem semântica `#01`, `#02`, `#03`;
- renderiza posições seguintes e posição pessoal;
- cobre menos de três participantes, vazio, erro, retry, `401` e modo observador.

### Lojinha

- cobre disponível, saldo insuficiente, esgotado e resgatando;
- abre e cancela o diálogo sem mutação;
- confirma com o ID correto;
- mantém o diálogo em erro;
- fecha e invalida `me`/`rewards` em sucesso;
- cobre loading, vazio, erro, retry e redirecionamentos.

### Verificação final

- suíte completa do web app;
- lint e build de produção;
- inspeção em `320px`, `390px`, `768px`, `1024px` e `1440px`;
- navegação por teclado e foco do diálogo;
- ausência de overflow global;
- `prefers-reduced-motion`.

## Critérios de aceite

1. Login, ranking e lojinha não usam `arcade-grid` ou `scanline`.
2. Login corresponde à composição editorial imersiva aprovada.
3. Ranking e lojinha usam o mesmo shell do dashboard para participantes.
4. A rota ativa é identificada por superfície roxa e checkpoint verde-limão.
5. Ranking apresenta Top 3 hierárquico, linhas seguintes e posição pessoal persistente.
6. Lojinha mantém saldo próximo ao título e diferencia todos os estados por texto.
7. Resgate usa diálogo acessível e não usa `window.confirm`.
8. Loading, vazio, erro recuperável e autorização estão cobertos.
9. Português e acentuação estão corretos nas áreas modificadas.
10. As telas funcionam desde `320px`, sem overflow global.
11. Movimento reduzido, foco e alvos de toque são preservados.
12. Contratos e regras de negócio existentes não mudam.
13. Testes, lint e build passam.
