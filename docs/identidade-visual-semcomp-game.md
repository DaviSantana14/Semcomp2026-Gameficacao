# Identidade visual e direção de redesign — SEMCOMP Game

**Status:** direção visual aprovada

**Data:** 18 de julho de 2026

**Escopo:** aplicação web de gamificação para participantes e equipe administrativa da SEMCOMP 2026

## 1. Objetivo

Este documento define como a identidade visual oficial da SEMCOMP 2026 deve ser aplicada ao sistema de gamificação existente. Ele deve orientar o redesign das telas sem alterar regras de negócio, rotas, permissões ou fluxos funcionais.

A experiência final deve parecer parte do mesmo evento apresentado no site oficial, e não um produto genérico de arcade ou um painel administrativo desconectado da marca.

O redesign abrange:

- autenticação e cadastro;
- início e perfil do participante;
- resgate de códigos;
- ranking;
- lojinha e resgates;
- shell e visão geral da administração;
- participantes e histórico individual;
- atividades;
- geração e histórico de códigos;
- administração da lojinha;
- auditoria;
- estados de carregamento, vazio, erro, sucesso e confirmação.

## 2. Fontes de verdade

A identidade foi extraída do projeto oficial localizado em:

`C:\Users\davis\Documents\.infojr\semcomp-26`

As principais referências são:

- `src/app/globals.css`: cores, gradientes, sombras, raios e tokens existentes;
- `src/app/layout.tsx`: famílias tipográficas oficiais;
- `public/fonts/Thunder-VF.ttf`: fonte display oficial;
- `public/assets/logo_semcomp.svg`: assinatura oficial;
- `src/components/ui/button.tsx`: botões primário e secundário;
- `src/components/Header.tsx`: uso do logo, vidro e navegação;
- `src/app/(home)/_components/Hero.tsx`: hierarquia de campanha;
- `src/app/(home)/_components/Timeline.tsx`: progressão, estados e movimento;
- `src/app/(home)/_components/SpeakerCard.tsx`: superfícies, gradientes e tipografia utilitária;
- `src/app/programacao/_components/ProgramacaoCard.tsx`: cartões, bordas e composição;
- `src/app/(home)/_components/BackgroundEllipses.tsx`: atmosfera luminosa roxa.

As regras deste documento adaptam esses elementos a um produto autenticado e orientado a tarefas. Não se deve importar arquivos do projeto oficial em tempo de execução; os assets aprovados devem ser copiados para o projeto atual e versionados nele.

## 3. Diagnóstico do sistema atual

O sistema atual usa uma linguagem criada apenas para prototipação:

- fundo azul-marinho e superfícies azuladas;
- ciano como cor principal e amarelo como destaque;
- Geist e Geist Mono;
- grade de arcade aplicada ao fundo;
- scanlines sobre cartões;
- vocabulário de “console”, “live score” e “OS” sem relação direta com a comunicação oficial;
- componentes visualmente semelhantes entre si, com excesso de cartões e bordas concorrentes.

Esses elementos comunicam “jogo tecnológico genérico”, mas não comunicam SEMCOMP 2026. Eles devem ser substituídos, e não apenas recoloridos.

### Elementos que devem desaparecer

- `#22d3ee` como cor primária;
- `#fbbf24` como destaque recorrente;
- Geist como tipografia do produto;
- fundos `.arcade-grid`;
- sobreposições `.scanline`;
- grades cartesianas decorativas;
- brilho aplicado em todos os cartões;
- jargão de terminal sem função real;
- títulos sem acentuação correta em português;
- aparência de template de dashboard SaaS ou painel cyberpunk.

## 4. Tese visual

### Conceito

**A jornada da SEMCOMP está em movimento.**

O sistema representa a progressão do participante pelo evento: atividades viram pontos de passagem, códigos validam conquistas e a experiência acumulada constrói uma trilha. A identidade deve combinar a energia pública da SEMCOMP com a clareza necessária para executar tarefas rapidamente.

### Personalidade

- energética, sem ser caótica;
- tecnológica, sem parecer ficção científica genérica;
- jovem, sem infantilizar;
- competitiva, sem hostilidade;
- comunitária, mesmo sem depender de fotografias;
- expressiva nas telas de participante;
- precisa e operacional nas telas administrativas.

### Elemento de assinatura

O elemento memorável do produto será uma **trilha de checkpoints** composta por órbitas, linhas de progresso e pequenos nós quadrados rotacionados. Ela deriva visualmente do símbolo de código presente na marca e transforma progressão em linguagem gráfica.

Essa assinatura pode aparecer em:

- nível atual;
- progresso de uma missão;
- progressão até uma recompensa;
- posição no ranking;
- etapas de geração ou validação de códigos;
- linha do tempo de auditoria.

Deve existir apenas um momento de assinatura dominante por tela. Não se deve preencher toda a interface com órbitas ou nós decorativos.

## 5. Decisão sobre fotografia

O produto gamificado será **100% gráfico por padrão**.

Não usar fotografias em:

- login e cadastro;
- início do participante;
- ranking;
- lojinha;
- perfil;
- telas administrativas;
- cartões de métricas, tabelas, diálogos ou estados de sistema.

A sensação de comunidade será construída por conteúdo, missões coletivas, nomes, iniciais, conquistas e sinais de atividade — não por banners fotográficos.

Fotografia poderá ser considerada futuramente apenas em contextos institucionais claramente separados, como retrospectiva, encerramento do evento ou uma mensagem editorial da organização. Nesses casos, devem ser usadas fotos documentais reais da SEMCOMP, nunca bancos de imagem ou imagens geradas por IA.

## 6. Sistema de cores

### 6.1 Paleta principal

| Token | Valor | Uso principal |
| --- | --- | --- |
| `semcomp.background` | `#050205` | fundo global |
| `semcomp.black` | `#0F0F0F` | superfícies sólidas e cartões |
| `semcomp.surface` | `#171019` | superfície elevada derivada para o sistema |
| `semcomp.purple.deep` | `#54025C` | fundos expressivos e gradientes |
| `semcomp.purple` | `#912CBC` | ação de marca, seleção e borda ativa |
| `semcomp.pink` | `#C42DB5` | progresso, energia e destaque secundário |
| `semcomp.lime` | `#8CFF00` | ação principal, conquista e estado ativo |
| `semcomp.blue` | `#6B77FF` | informação e contraste auxiliar |
| `semcomp.gray.dark` | `#3D3D3D` | divisores fortes e elementos desabilitados |
| `semcomp.gray.light` | `#D9D9D9` | texto secundário de alto contraste |
| `semcomp.white` | `#FFFFFF` | texto principal e ícones |

`#171019` é uma adaptação para o produto, criada para separar superfícies sem introduzir o azul-marinho atual.

### 6.2 Tokens semânticos

| Token semântico | Valor recomendado | Regra |
| --- | --- | --- |
| `background` | `#050205` | base de todas as telas |
| `foreground` | `#F8F4FA` | texto principal |
| `surface` | `#0F0F0F` | cartões e navegação |
| `surface-raised` | `#171019` | modais e áreas elevadas |
| `muted` | `#AFA5B2` | texto secundário; verificar contraste |
| `border` | `rgba(255,255,255,0.10)` | divisão neutra |
| `border-brand` | `rgba(205,86,255,0.32)` | foco de marca e superfícies expressivas |
| `action-primary` | `#8CFF00` | uma ação dominante por região |
| `action-primary-foreground` | `#091300` | texto sobre verde-limão |
| `action-brand` | `#912CBC` | ação padrão e seleção |
| `focus-ring` | `#8CFF00` | foco de teclado em fundo escuro |
| `info` | `#6B77FF` | informação funcional |
| `success` | `#8CFF00` | sucesso e confirmação |
| `warning` | `#FFD166` | atenção funcional; não decorativa |
| `danger` | `#FF6B81` | erro e ação destrutiva |

As cores `warning` e `danger` são extensões funcionais do produto, não cores de marca. Devem aparecer apenas quando houver significado semântico real.

### 6.3 Proporção de uso

- 70% a 80%: preto e superfícies escuras;
- 10% a 20%: branco, cinzas e divisores;
- até 10%: roxo, magenta e verde-limão.

O verde-limão perde força quando aparece em todo lugar. Reservá-lo para a ação principal, avanço, conquista, valor positivo e estado ativo.

### 6.4 Gradientes e brilho

Gradientes aprovados:

- roxo profundo para preto em heróis e superfícies de missão;
- magenta para roxo em progresso ou borda expressiva;
- verde-limão vertical apenas em botões de maior ênfase;
- elipse roxa desfocada nas bordas da composição.

Regras:

- apenas um brilho dominante por tela;
- cartões comuns não recebem glow;
- glow não substitui borda ou contraste;
- nenhuma informação pode depender do brilho para ser percebida;
- fundos administrativos usam atmosfera mais discreta que os de participante.

## 7. Tipografia

### 7.1 Famílias

| Papel | Família | Uso |
| --- | --- | --- |
| Display | **Thunder Variable** | títulos principais, níveis, chamadas e momentos de conquista |
| Interface | **Outfit** | navegação, botões, campos, títulos menores e texto geral |
| Leitura | **IBM Plex Sans** | descrições longas, ajuda, erros e conteúdo operacional |
| Dados | **JetBrains Mono** | XP, PTS, códigos, posição, datas curtas, status e valores tabulares |

O projeto oficial também carrega Lato, mas o sistema não deve introduzir uma quinta voz tipográfica. Lato não faz parte da hierarquia principal deste redesign.

### 7.2 Regras de uso

- Thunder é expressiva e deve ser usada com moderação.
- Thunder nunca deve ser usada em parágrafos, formulários, tabelas ou textos de erro.
- Outfit é a fonte padrão da interface.
- IBM Plex Sans é preferível quando a leitura contínua for mais importante que a personalidade.
- JetBrains Mono deve destacar dados ou códigos, não transformar toda a interface em terminal.
- Títulos display podem usar caixa alta; textos de interface usam sentence case.
- Evitar tracking excessivo. Espaçamento amplo é reservado a rótulos curtos e utilitários.
- Valores numéricos devem usar algarismos tabulares.

### 7.3 Escala recomendada

| Token | Desktop | Mobile | Uso |
| --- | --- | --- | --- |
| `display-xl` | 64 px / 0,88 | 44 px / 0,90 | entrada e grande conquista |
| `display-lg` | 52 px / 0,90 | 38 px / 0,92 | título principal de página |
| `display-md` | 40 px / 0,94 | 32 px / 0,96 | herói de missão e ranking |
| `heading-lg` | 28 px / 1,05 | 24 px / 1,10 | título de seção |
| `heading-md` | 22 px / 1,15 | 20 px / 1,15 | cartão importante e modal |
| `body-lg` | 18 px / 1,55 | 17 px / 1,50 | introdução |
| `body` | 16 px / 1,50 | 16 px / 1,50 | interface e conteúdo |
| `body-sm` | 14 px / 1,45 | 14 px / 1,45 | conteúdo secundário |
| `caption` | 12 px / 1,35 | 12 px / 1,35 | metadados e status |

Não usar texto essencial abaixo de 12 px.

## 8. Composição e layout

### 8.1 Estrutura

O layout deve equilibrar uma superfície escura silenciosa com um único momento visual forte. A tela não deve ser uma coleção uniforme de cartões.

Ordem visual recomendada:

1. contexto curto da tela;
2. título ou objetivo principal;
3. ação ou progresso dominante;
4. dados de suporte;
5. listas, tabelas e ações secundárias.

### 8.2 Grade e largura

- unidade base de espaçamento: 4 px;
- escala principal: 4, 8, 12, 16, 24, 32, 48 e 64 px;
- área de participante: largura máxima aproximada de 1.240 px;
- administração: conteúdo fluido após a navegação, com limite aproximado de 1.440 px para telas densas;
- margens mobile: 16 px;
- margens tablet: 24 px;
- margens desktop: 32 px;
- espaçamento entre grandes seções: 24 a 32 px;
- espaçamento interno de cartões: 16 a 24 px.

### 8.3 Raios

| Token | Valor | Uso |
| --- | --- | --- |
| `radius-xs` | 4 px | pequenos marcadores |
| `radius-sm` | 8 px | chips, ícones e controles compactos |
| `radius-md` | 11 px | botões e campos |
| `radius-lg` | 14 px | cartões comuns |
| `radius-xl` | 18 px | heróis e painéis expressivos |
| `radius-2xl` | 24 px | modais e grandes superfícies |
| `radius-full` | 999 px | status e filtros curtos |

Não aplicar o mesmo raio a todos os elementos. A hierarquia de raios ajuda a indicar escala e função.

### 8.4 Bordas

- borda neutra: 1 px branca com 8% a 12% de opacidade;
- borda de marca: 1 px roxa/magenta com 28% a 40% de opacidade;
- borda expressiva em gradiente: restrita ao herói, CTA de campanha ou estado selecionado importante;
- borda de foco: 2 px verde-limão com afastamento visível;
- evitar bordas coloridas diferentes para cartões equivalentes.

## 9. Linguagem gráfica

### 9.1 Checkpoints

Pequenos quadrados rotacionados em 45 graus representam pontos de passagem. Podem indicar:

- item atual da navegação;
- etapa concluída;
- posição em uma trilha;
- evento em uma linha do tempo;
- marcador de nível ou conquista.

### 9.2 Órbitas

Órbitas circulares podem envolver o nível, uma conquista ou o progresso principal. Usar traços finos e um ou dois nós; evitar ilustrações complexas.

### 9.3 Trilhas

Trilhas são linhas horizontais ou verticais que conectam checkpoints. Estados:

- não iniciado: branco com 12% de opacidade;
- em andamento: magenta;
- concluído: verde-limão;
- indisponível: cinza escuro.

### 9.4 Texturas

Não usar grade de arcade, scanlines, ruído intenso ou padrões de terminal. Quando a tela precisar de profundidade, usar:

- elipse roxa desfocada;
- gradiente radial discreto;
- linha de progresso;
- forma orbital;
- símbolo da marca em baixa opacidade.

## 10. Logo e assinatura

- usar sempre o SVG oficial;
- preservar proporções e cores;
- não redesenhar o logo com texto da interface;
- não aplicar sombra, contorno ou gradiente sobre o arquivo;
- manter espaço livre mínimo de 16 px ao redor em interfaces compactas;
- tamanho de referência: 160 px no cabeçalho mobile e 210 px no desktop, conforme o site oficial;
- em navegação administrativa estreita, usar o logo completo quando houver largura; uma versão reduzida só poderá ser usada se existir um asset oficial aprovado;
- não recortar o logo para fabricar um ícone.

## 11. Ícones

- usar um único conjunto de ícones de interface por tela;
- Lucide pode continuar como base funcional do sistema atual;
- Tabler pode ser usado apenas quando já houver um ícone oficial específico sem equivalente adequado;
- manter traço e tamanho consistentes;
- ícones não substituem rótulos em ações importantes;
- usar ícones customizados da SEMCOMP apenas em momentos de destaque;
- evitar joystick, pixel heart, alien, terminal e outros clichês de game quando não representarem uma função real.

## 12. Movimento

O movimento deve reforçar progressão, não decorar a tela inteira.

### Movimentos aprovados

- preenchimento de uma trilha após validação;
- avanço de XP;
- entrada coordenada do herói e dos dados principais;
- órbita lenta no nível atual;
- confirmação curta ao concluir missão ou resgate;
- transição de estado em ranking, aba ou filtro.

### Tempos

- microinteração: 120 a 180 ms;
- mudança de componente: 180 a 260 ms;
- conquista ou progressão: 400 a 700 ms;
- movimento ambiente: 10 a 16 s, linear e muito discreto.

### Restrições

- não animar todos os cartões na rolagem;
- não usar loops chamativos;
- não depender de animação para comunicar sucesso ou erro;
- respeitar `prefers-reduced-motion`;
- com movimento reduzido, exibir diretamente o estado final.

## 13. Componentes principais

### 13.1 Shell do participante

- logo oficial no topo;
- navegação lateral em desktop e horizontal compacta ou menu em mobile;
- item ativo com superfície roxa discreta e checkpoint verde-limão;
- identificação por iniciais, não fotografia;
- data ou estado do evento pode aparecer no rodapé da navegação;
- sair deve ser uma ação secundária e previsível.

### 13.2 Shell administrativo

- utiliza os mesmos tokens, logo, navegação e tipografia do participante;
- atmosfera reduzida para priorizar dados;
- conteúdo pode ser mais largo e denso;
- item ativo segue a mesma regra do checkpoint;
- status operacional usa verde-limão apenas quando houver estado real;
- evitar nomes como “Semcomp OS” ou “Console admin”; preferir “Administração SEMCOMP” e linguagem direta.

### 13.3 Botões

**Primário de alta ênfase**

- fundo verde-limão;
- texto quase preto;
- uma ação dominante por região;
- exemplos: “Resgatar código”, “Confirmar entrega”, “Salvar alterações”.

**Ação de marca**

- fundo roxo;
- texto branco;
- ação padrão quando o verde já estiver reservado ao avanço principal.

**Secundário**

- fundo escuro ou transparente;
- borda neutra;
- texto branco.

**Destrutivo**

- vermelho funcional;
- uso apenas após deixar clara a consequência;
- confirmação específica em operações irreversíveis.

Todos os botões devem ter pelo menos 44 px de altura em interfaces de toque.

### 13.4 Cartões

Existem três níveis:

1. **Herói de missão:** gradiente roxo profundo, borda de marca e assinatura de progresso.
2. **Painel de conteúdo:** superfície escura, borda neutra e sem glow.
3. **Métrica:** painel compacto, número em JetBrains Mono e uma única cor de destaque.

Evitar cartões dentro de cartões. Agrupamentos simples podem usar apenas espaçamento e divisores.

### 13.5 Métricas

- rótulo em Outfit ou IBM Plex Sans;
- valor em JetBrains Mono;
- unidade menor, como `XP` e `PTS`;
- números alinhados e tabulares;
- cor não deve ser a única forma de indicar estado;
- no máximo uma métrica recebe tratamento de alerta por conjunto.

### 13.6 Campos

- rótulo sempre visível;
- fundo escuro elevado;
- borda neutra em repouso;
- borda e anel verde-limão no foco;
- helper e erro aparecem abaixo do campo;
- placeholder não substitui rótulo;
- códigos usam JetBrains Mono e podem ser agrupados visualmente;
- preservar caracteres digitados e capitalização quando o código for case-sensitive.

### 13.7 Badges e status

- usar forma pill apenas para status curtos;
- texto em JetBrains Mono ou Outfit semibold;
- combinar cor e texto explícito;
- exemplos: “Ativo”, “Pendente”, “Entregue”, “Inativo”;
- evitar badges decorativos como “Live Score” quando não representarem estado do sistema.

### 13.8 Progresso

- barras segmentadas são preferíveis para missões com etapas;
- barra contínua é adequada ao XP dentro de um nível;
- sempre mostrar valor ou descrição textual;
- concluído em verde-limão;
- andamento em magenta;
- base neutra escura.

### 13.9 Tabelas e listas administrativas

- fundo geral escuro, sem cartão por linha;
- divisores horizontais discretos;
- cabeçalhos em sentence case;
- números alinhados à direita;
- status visível por texto e cor;
- ações recorrentes alinhadas de forma consistente;
- linha selecionada com superfície roxa de baixa opacidade;
- tabelas largas devem preservar colunas essenciais e permitir overflow controlado no mobile;
- em telas estreitas, transformar linhas em blocos sem perder rótulos de campo.

### 13.10 Diálogos

- superfície elevada `#171019`;
- borda neutra ou de marca, conforme a importância;
- título claro sobre a consequência;
- ação principal à direita no desktop e em largura total no mobile;
- não usar `window.confirm` na experiência final;
- manter foco preso, fechamento por `Esc` quando seguro e retorno do foco ao gatilho.

### 13.11 Feedback

- sucesso: confirmar exatamente a ação realizada;
- erro: explicar o que aconteceu e como continuar;
- loading: skeleton com a geometria final, sem glow pulsante intenso;
- vazio: explicar o que falta e oferecer uma próxima ação quando existir;
- toast não substitui erro persistente de formulário ou tela.

## 14. Aplicação por tela

### 14.1 Login e cadastro (`/login` e `/cadastro`)

- composição sem fotografia;
- logo oficial e título Thunder formam o momento de marca;
- arte abstrata com trilha ou órbita ocupa a área editorial no desktop;
- formulário permanece silencioso e legível;
- remover “Live Score” e cartões explicativos de XP/PTS/CODE da lateral atual;
- apresentar a proposta em uma frase curta, sem transformar a entrada em tutorial;
- no mobile, priorizar formulário e reduzir a arte a um detalhe de fundo.

### 14.2 Início do participante (`/home`)

Estrutura recomendada:

1. contexto do participante;
2. título de jornada;
3. missão em destaque com progresso;
4. métricas de XP, PTS e posição;
5. próximas missões;
6. resgate de código;
7. atalhos para ranking e lojinha quando necessários.

O herói de missão é o único elemento com glow dominante.

### 14.3 Ranking (`/ranking`)

- título Thunder e período selecionado;
- top 3 com hierarquia espacial, sem pódio metálico genérico;
- posição do participante permanece visível;
- linhas seguintes usam divisores, não cartões individuais;
- XP em JetBrains Mono;
- filtros “Geral” e “Hoje” devem ter rótulos claros;
- usar checkpoint ou linha de posição para mostrar avanço;
- dourado não deve voltar como cor estrutural; posição é comunicada por escala, ordem e rótulo.

### 14.4 Lojinha (`/lojinha`)

- saldo de PTS fica próximo ao título e permanece fácil de localizar;
- recompensas podem usar ilustração ou imagem real do próprio item quando disponível, mas não fotografia editorial do evento;
- custo em JetBrains Mono;
- disponibilidade e estoque são textuais;
- CTA verde-limão apenas quando o resgate estiver disponível;
- estados insuficiente, indisponível e esgotado devem ser distintos;
- confirmação usa diálogo próprio e repete item, custo e saldo restante.

### 14.5 Visão geral administrativa (`/admin`)

- título “Visão geral do evento”;
- métricas operacionais em grade compacta;
- apenas a métrica que exige ação recebe destaque;
- fila de retiradas e atalhos aparecem abaixo;
- sem fotografia, scanline ou linguagem de terminal;
- identidade presente em tipografia, cor, checkpoints, logo e composição.

### 14.6 Participantes e detalhe (`/admin/participantes` e `/admin/participantes/[id]`)

- busca e filtros antes da tabela;
- nome e status são a primeira coluna;
- XP e PTS usam JetBrains Mono;
- ações destrutivas ficam separadas de ações rotineiras;
- detalhe apresenta resumo, eventos de pontos, recompensas e auditoria em seções claras;
- linha do tempo de auditoria pode reutilizar a trilha de checkpoints de forma mais sóbria.

### 14.7 Atividades e códigos (`/admin/atividades` e `/admin/codigos`)

- formulários de criação usam painel elevado;
- listagem fica em tabela ou lista sem cartão por registro;
- códigos únicos e reutilizáveis devem ser visualmente distinguíveis por rótulo e descrição, não apenas cor;
- código exibido ou copiado usa JetBrains Mono;
- ações de gerar, desativar e consultar histórico têm hierarquia distinta;
- sucesso de geração deve criar um momento curto de conquista, sem confundir com ação do participante.

### 14.8 Administração da lojinha (`/admin/lojinha`)

- catálogo, criação e histórico de resgates têm navegação local clara;
- retiradas pendentes recebem prioridade por tempo e status;
- confirmação de entrega usa verde-limão;
- cancelamento ou reversão usa tratamento destrutivo;
- recompensas inativas permanecem legíveis sem parecer erro.

### 14.9 Auditoria (`/admin/auditoria`)

- maior densidade visual de todo o produto;
- filtros compactos e agrupados;
- IDs, datas e valores em JetBrains Mono;
- nomes humanos têm prioridade sobre identificadores técnicos;
- operação, ator, alvo e motivo devem ser reconhecíveis sem abrir o detalhe;
- roxo indica seleção; cores semânticas indicam resultado;
- não aplicar glow em linhas da tabela.

## 15. Voz e conteúdo

### Participante

Pode usar o vocabulário de jornada:

- missão;
- nível;
- progresso;
- conquista;
- trilha;
- posição;
- XP;
- pontos ou `PTS`.

O tom deve incentivar sem infantilizar. Evitar frases vazias como “prepare-se para dominar a arena”.

### Administração

Usar linguagem operacional direta:

- visão geral;
- participantes;
- atividades;
- códigos;
- recompensas;
- retiradas;
- auditoria;
- ajuste;
- reversão.

Evitar “operador”, “console”, “OS”, “arena” e outros termos de jogo quando não ajudarem a tarefa.

### Consistência

- escrever em português do Brasil com acentuação correta;
- usar “código”, “próximas”, “não” e “nível”; nunca versões sem acento;
- `XP` é experiência e não é gasto;
- `PTS` é a unidade visual dos pontos da lojinha;
- em texto corrido, preferir “pontos”; em valores, usar `620 PTS`;
- o botão e a confirmação repetem o mesmo verbo: “Resgatar” → “Recompensa resgatada”.

## 16. Responsividade

### Mobile

- prioridade absoluta para conteúdo e ações;
- título display reduzido, sem quebrar palavras;
- navegação lateral vira navegação compacta ou menu;
- heróis passam para uma coluna;
- órbita fica abaixo ou atrás do conteúdo sem prejudicar leitura;
- botões principais podem ocupar a largura disponível;
- métricas empilham ou formam duas colunas quando houver espaço;
- tabelas viram blocos rotulados quando a leitura horizontal deixar de ser segura;
- modais usam quase toda a largura, preservando margem de 16 px.

### Desktop

- usar espaço para hierarquia, não para adicionar decoração;
- manter linhas de texto legíveis;
- shell administrativo pode ter navegação lateral fixa;
- áreas densas devem aproveitar largura sem esticar parágrafos;
- herói e dados de suporte podem coexistir em duas colunas.

### Alvos mínimos

- 320 px sem overflow global;
- 768 px com reorganização clara de navegação e colunas;
- 1.024 px com shell desktop;
- 1.440 px sem alongar excessivamente o conteúdo.

## 17. Acessibilidade

- contraste mínimo WCAG AA para texto e controles;
- foco visível em todos os elementos interativos;
- não remover outline sem substituição equivalente;
- alvos de toque com pelo menos 44 × 44 px;
- cor nunca é o único indicador de estado;
- ícones decorativos ficam ocultos de tecnologias assistivas;
- botões somente com ícone exigem nome acessível;
- formulários associam rótulo, helper e erro;
- erros recebem `role="alert"` quando apropriado;
- loading usa `role="status"` e rótulo conciso;
- modais administram foco corretamente;
- animações respeitam movimento reduzido;
- números, unidades e abreviações permanecem compreensíveis fora do contexto visual;
- tabelas preservam cabeçalhos e relações semânticas.

## 18. Estados essenciais

Cada tela ou componente de dados deve especificar:

1. carregando;
2. carregado com conteúdo;
3. vazio;
4. erro recuperável;
5. erro de autorização;
6. sucesso após mutação;
7. ação desabilitada;
8. confirmação destrutiva, quando aplicável.

Os estados devem usar a mesma estrutura da tela final para reduzir saltos de layout.

## 19. Estratégia de implementação

### Fase 1 — Fundamentos

- copiar logo e Thunder do projeto oficial;
- configurar Thunder, Outfit, IBM Plex Sans e JetBrains Mono;
- substituir tokens globais;
- remover Geist, arcade grid e scanlines;
- criar tokens semânticos, escala de espaço, raios e movimento;
- definir shell compartilhado e padrões de foco.

### Fase 2 — Componentes

- botão;
- campo, label e mensagens;
- card e painel;
- métrica;
- badge e status;
- progresso e checkpoint;
- tabela e paginação;
- diálogo;
- toast;
- skeleton, vazio e erro.

### Fase 3 — Participante

- login;
- cadastro;
- início;
- resgate de código;
- ranking;
- lojinha.

### Fase 4 — Administração

- shell;
- visão geral;
- participantes;
- detalhe do participante;
- atividades;
- códigos;
- lojinha;
- auditoria.

### Fase 5 — Polimento

- movimento;
- responsividade fina;
- contraste;
- navegação por teclado;
- revisão de conteúdo;
- consistência visual entre estados.

## 20. Critérios de aceite

O redesign estará visualmente alinhado quando:

- todas as rotas usam os tokens aprovados;
- o logo oficial aparece sem alteração;
- Thunder, Outfit, IBM Plex Sans e JetBrains Mono têm papéis consistentes;
- ciano e amarelo do protótipo não aparecem como cores estruturais;
- Geist não é mais a voz do produto;
- não existem arcade grids ou scanlines;
- não existem fotografias nas telas centrais do produto;
- participante e administração parecem partes do mesmo sistema;
- a área administrativa continua legível e operacional;
- há no máximo um momento de glow dominante por tela;
- verde-limão permanece raro e ligado a ação, avanço ou sucesso;
- controles têm estados de hover, focus, active e disabled;
- carregamento, vazio, erro e sucesso foram desenhados;
- as telas funcionam a partir de 320 px;
- navegação por teclado e movimento reduzido funcionam;
- português e terminologia estão consistentes;
- o redesign não altera contratos de API ou regras de negócio.

## 21. Checklist de revisão por tela

Antes de considerar uma tela concluída, verificar:

- [ ] O objetivo principal fica claro em até cinco segundos?
- [ ] Existe uma única ação de maior ênfase?
- [ ] A tela usa a identidade sem depender de decoração excessiva?
- [ ] Thunder foi usada apenas em texto de destaque?
- [ ] XP, PTS, códigos e números usam a hierarquia correta?
- [ ] O verde-limão tem significado real?
- [ ] Cartões comuns estão sem glow?
- [ ] A assinatura de checkpoint aparece no máximo uma vez como elemento dominante?
- [ ] A tela evita fotografia e clichês de arcade?
- [ ] Conteúdo e ações funcionam no mobile?
- [ ] Estados de carregamento, vazio, erro e sucesso estão cobertos?
- [ ] Foco, contraste e nomes acessíveis foram verificados?
- [ ] Textos estão em português correto e usam verbos consistentes?

## 22. Resumo executivo

O SEMCOMP Game não será uma cópia literal do site institucional e não continuará com a estética genérica de arcade. Ele será uma extensão funcional da marca oficial.

A identidade será reconhecida por:

- preto como palco;
- roxo e magenta como energia;
- verde-limão como avanço;
- Thunder como voz de destaque;
- Outfit e IBM Plex Sans como clareza;
- JetBrains Mono como linguagem de dados;
- checkpoints e órbitas como assinatura da jornada;
- movimento pontual como confirmação de progresso;
- ausência deliberada de fotografia no núcleo gamificado.

Essa direção deve permanecer consistente tanto para quem participa do evento quanto para quem opera o sistema.
