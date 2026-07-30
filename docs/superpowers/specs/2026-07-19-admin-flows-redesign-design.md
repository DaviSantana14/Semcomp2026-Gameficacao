# Redesign dos fluxos administrativos — design

**Status:** aprovado como continuação da identidade SEMCOMP Game

**Fonte de verdade:** `docs/identidade-visual-semcomp-game.md`

## Objetivo

Aplicar a identidade já aprovada às rotas administrativas de participantes, detalhe do participante, atividades, códigos, lojinha e auditoria sem alterar contratos de API, permissões ou regras de negócio.

## Direção escolhida

A área administrativa seguirá uma composição **editorial operacional**. Thunder identifica a área e a tarefa principal; Outfit sustenta controles; IBM Plex Sans fica com explicações; JetBrains Mono identifica códigos, datas, IDs, XP e PTS. O shell continua compartilhado e a atmosfera roxa permanece mais discreta que no fluxo do participante.

Uma trilha curta com checkpoint aparece no cabeçalho como assinatura dominante. Formulários usam superfícies elevadas; filtros formam barras compactas; resultados aparecem em listas ou tabelas contínuas com divisores. Cartões isolados ficam reservados para métricas, catálogo com imagem e estados que precisam de destaque.

Foram descartadas duas alternativas:

- apenas recolorir os cartões atuais, porque manteria a aparência de protótipo;
- transformar todas as áreas no mesmo template de tabela, porque catálogo, conciliação e auditoria têm densidades e ações diferentes.

## Estrutura compartilhada

Cada rota usa:

1. contexto operacional curto;
2. título de página em Thunder;
3. descrição direta da tarefa;
4. ação ou painel dominante;
5. filtros;
6. resultados e paginação.

Os cabeçalhos e painéis administrativos serão componentes compartilhados com classes Tailwind estáticas. Controles preservam foco visível, altura mínima de 44 px e `motion-reduce`.

## Participantes

A busca fica em uma barra de filtros compacta. A listagem deixa de parecer um conjunto de cartões e passa a ser uma superfície contínua, com nome e status primeiro, contato e cadastro depois, dados operacionais alinhados e ações consistentes no fim da linha. No mobile, cada linha vira um bloco rotulado sem overflow global.

## Detalhe do participante

O cabeçalho concentra identidade, status e saldo. Cadastro, último login e contagens ficam em uma faixa de apoio. Reconciliação é a primeira área operacional; extrato, auditoria e pedidos mantêm ordem clara, painéis sóbrios e listas contínuas. A linha do tempo usa checkpoints discretos.

## Atividades

Criação e edição compartilham um painel elevado. A listagem separa status da atividade e status do código reutilizável, preserva a explicação da diferença e alinha edição e alteração de status. O verde-limão fica na ação de salvar/criar.

## Códigos

A geração do lote é o momento principal da tela. O lote recém-gerado recebe tratamento curto de conquista, enquanto históricos de uso único e reutilizável usam navegação local e listas densas. Códigos aparecem sempre em JetBrains Mono, acompanhados por texto explícito de estado.

## Lojinha administrativa

Criação/edição, catálogo e retiradas formam três regiões reconhecíveis. O catálogo preserva imagem do item e reduz decoração. A fila de retiradas destaca pendentes por prioridade e mantém entrega como ação primária; cancelamento é separado e destrutivo.

## Auditoria

É a tela mais densa. Filtros ocupam um painel compacto; nomes humanos precedem IDs; a tabela desktop e os blocos mobile preservam a mesma ordem de informação. A linha selecionada recebe roxo discreto, sem glow, e o detalhe usa três colunas para antes, depois e metadados.

## Estados e acessibilidade

Carregamento usa skeleton com geometria final. Vazios indicam a próxima ação. Erros recuperáveis mantêm botão de nova tentativa. Diálogos e mutações atuais são preservados. Cores nunca substituem rótulos de status, tabelas mantêm cabeçalhos semânticos, filtros têm labels e todas as ações continuam navegáveis por teclado.

## Critérios de aceite

- todas as rotas administrativas usam a mesma hierarquia e tokens do dashboard aprovado;
- nenhuma regra de negócio ou contrato de serviço muda;
- listas densas não usam um cartão independente por registro;
- formulários, filtros, estados e paginação funcionam a partir de 320 px;
- XP, PTS, códigos, datas e IDs usam hierarquia monoespaçada;
- existe no máximo um momento visual dominante por tela;
- testes de comportamento existentes permanecem verdes;
- lint, TypeScript e build passam;
- revisão visual cobre desktop e mobile das seis rotas, incluindo o detalhe.

