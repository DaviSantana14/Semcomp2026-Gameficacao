# Hierarquia de informações do dashboard do participante

## Contexto

O dashboard apresenta o nível atual em quatro pontos próximos: no marcador acima do título, no selo da órbita, no cartão “Progresso” de “Seu placar” e no bloco “Evolução”. A repetição ocupa espaço sem acrescentar contexto e reduz o impacto da órbita, que foi definida como a assinatura visual da jornada.

O participante aprovou a ordem atual das seções. Este ajuste não altera a estrutura da página; apenas atribui uma responsabilidade informacional distinta a cada área.

## Objetivo

Eliminar a repetição do nível atual, mantendo a ordem, o ritmo visual e os fluxos do dashboard. Após o ajuste, cada seção deve responder a uma pergunta diferente:

| Área | Pergunta respondida |
| --- | --- |
| Órbita do hero | Em qual nível estou? |
| Seu placar | Quais recursos e posição possuo? |
| Evolução | Quanto falta para avançar? |

## Conteúdo aprovado

### Cabeçalho

O marcador `jornada // nível 07` passa a exibir `jornada // SEMCOMP 2026`.

- O título “Sua jornada está em movimento.” e o texto de boas-vindas permanecem inalterados.
- O nível atual deixa de ser repetido antes do hero.
- O ano do evento reforça o contexto da experiência sem introduzir uma nova métrica.

### Hero e órbita

O hero mantém conteúdo, CTA, composição, animação e responsividade atuais.

- A órbita passa a ser a única representação explícita do nível atual.
- O selo continua exibindo `NÍVEL 07`, usando o valor real de `user.level`.
- A órbita continua decorativa para tecnologias assistivas por meio de `aria-hidden="true"`.
- Um texto exclusivo para leitores de tela, `Nível atual: 07`, mantém essa informação acessível sem criar outra repetição visual.

### Seu placar

O cartão “Progresso”, cujo valor repete `Nível 07`, é removido. A seção mantém o mesmo lugar na página e passa a conter três cartões:

1. Experiência — XP total acumulado.
2. Seus pontos — saldo disponível.
3. Posição geral — colocação entre participantes.

Em telas largas, os três cartões ocupam colunas de mesma largura. Em telas menores, seguem o comportamento responsivo existente, sem forçar uma quarta posição vazia.

### Evolução

O bloco deixa de repetir o nível atual e passa a comunicar exclusivamente a próxima meta.

Para um participante com `620 XP` no nível `07`, o conteúdo será:

- Título: `Rumo ao nível 08`.
- Indicador lateral: `20%`.
- Barra de progresso: `20%`.
- Rodapé esquerdo: `20/100 XP nesta etapa`.
- Rodapé direito: `80 XP restantes`.

Os valores são derivados do modelo já utilizado pelo dashboard:

- `levelProgress = user.xp % 100`, limitado ao intervalo de `0` a `100`.
- `remainingXp = 100 - levelProgress`.
- `nextLevel = user.level + 1`.

Não será criada uma nova fonte de dados nem alterada a regra de progressão do sistema.

## Estados de borda

- Quando o progresso da etapa for `0`, o bloco exibirá `0/100 XP nesta etapa` e `100 XP restantes`.
- A posição geral continua exibindo `—` quando não houver posição disponível.
- Formatação de números permanece em `pt-BR`.
- Níveis continuam com dois dígitos na interface, como `08`.

## Acessibilidade e semântica

- Os três cartões de placar continuam como artigos dentro da seção “Seu placar”.
- Um texto `sr-only` informa o nível atual fora da árvore `aria-hidden` da órbita.
- O título `Rumo ao nível 08`, o valor percentual e os textos de XP permanecem textuais e acessíveis.
- Nenhuma mudança é feita em foco, navegação, CTA ou preferência de movimento reduzido.

## Fora de escopo

- Reordenar seções ou cartões.
- Alterar o design do hero, da órbita ou dos cartões.
- Criar métricas sem suporte na API, como número de atividades concluídas.
- Alterar as regras de XP, nível, pontos ou ranking.
- Modificar o dashboard administrativo.

## Critérios de aceite

1. O nível atual aparece visualmente apenas no selo da órbita.
2. Leitores de tela recebem `Nível atual: 07` por um texto não visual.
3. O marcador do cabeçalho exibe `jornada // SEMCOMP 2026`.
4. “Seu placar” contém somente Experiência, Seus pontos e Posição geral.
5. Os três cartões usam o espaço disponível de forma equilibrada em desktop e preservam a responsividade atual.
6. “Evolução” exibe próximo nível, XP da etapa e XP restante sem repetir o nível atual.
7. Para `620 XP` e nível `07`, os valores apresentados são nível `08`, `20%`, `20/100 XP` e `80 XP restantes`.
8. Nenhum fluxo, CTA ou dado do dashboard é alterado.
9. Testes, lint e build do web app continuam passando.

## Verificação

- Teste do conteúdo renderizado com dados conhecidos do participante.
- Teste de ausência do cartão “Progresso” e de `Nível 07` fora da órbita.
- Inspeção visual em desktop e mobile para confirmar o equilíbrio dos três cartões.
- Suíte completa do web app, lint e build de produção.
