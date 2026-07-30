# Ajuste de contraste do hero do participante

## Contexto

O hero atual do dashboard do participante usa `bg-secondary` em toda a superfície. Como a órbita também é desenhada com violeta e rosa translúcidos, o fundo roxo uniforme reduz a separação entre plano, selo de nível e animação.

A composição aprovada segue a segunda referência visual enviada: um palco quase preto, com roxo usado como iluminação localizada, borda violeta discreta, selo de nível quadrado e órbitas contrastantes à direita.

## Objetivo

Recuperar a profundidade e o contraste do hero sem alterar conteúdo, dados ou fluxos. O botão lima continua sendo a ação dominante; a órbita funciona como assinatura visual da jornada.

## Fora de escopo

- Alterar os textos do hero.
- Alterar a lógica de nível, pontos, XP ou posição geral.
- Adicionar missões, etapas ou informações que não existam na API.
- Redesenhar os demais cartões do dashboard.

## Direção visual aprovada

### Paleta do hero

- Base: `#08040B`, próxima ao fundo global, mas perceptível como uma superfície própria.
- Superfície elevada: `#100817` com transparência controlada.
- Violeta estrutural: `#912CBC`, usado na borda, nos anéis e na iluminação.
- Rosa orbital: `#FF4BB4`, reservado a um dos pontos de movimento e a um halo discreto.
- Lima de ação: `#8CFF00`, usado no CTA, no número do nível e em um ponto orbital.
- Texto principal: branco quente da identidade existente; texto secundário com contraste mínimo equivalente a `text-muted-foreground` sobre a nova base.

O hero não terá preenchimento roxo sólido. O violeta aparecerá como gradiente radial localizado no lado esquerdo e como halo próximo à órbita, deixando a maior parte do painel escura.

## Composição desktop

O painel mantém a largura e a posição atuais, mas passa a usar duas zonas:

```text
┌──────────────────────────────────────────────────────────────┐
│ checkpoint rápido                         ◌      ╭──────╮    │
│ CONCLUIU UMA ATIVIDADE?                  •  ◉   │ NÍVEL│    │
│ Texto de apoio...                           ◌   │  07  │    │
│                                                       ╰──────╯
│ [ Resgatar código ]                         arco externo →   │
└──────────────────────────────────────────────────────────────┘
```

- Conteúdo textual e CTA ocupam aproximadamente 58% do painel.
- A área esquerda recebe uma luz violeta concentrada, sem reduzir o contraste do texto.
- O selo de nível troca o círculo por um quadrado de `7rem` com cantos de `22px`, sem inclinação, fundo quase preto, borda lima discreta e número em lima.
- Um anel interno envolve o selo e carrega os pontos rosa e lima.
- Um arco externo maior é parcialmente cortado pela borda direita do hero, reproduzindo a sensação de percurso da referência.
- A borda violeta do painel permanece sutil; o brilho externo é reduzido para não competir com os elementos internos.

## Composição mobile

A órbita permanece visível. O conteúdo segue uma coluna, e a última linha do painel reúne o CTA e o conjunto orbital compacto:

```text
┌────────────────────────────┐
│ checkpoint rápido          │
│ CONCLUIU UMA               │
│ ATIVIDADE?                 │
│ Texto de apoio...          │
│                            │
│ [ Resgatar ]      ◌ [01]   │
└────────────────────────────┘
```

- O selo usa `5.5rem` e a órbita completa `7.5rem`.
- O CTA não pode ser coberto ou empurrado para fora do painel.
- A unidade orbital fica alinhada à direita, inteiramente dentro do painel, e o número do nível permanece legível.
- Abaixo de `360px`, CTA e órbita ocupam duas linhas: CTA com largura total e órbita centralizada abaixo, sem sobrepor o texto.
- O painel não pode gerar overflow horizontal.

## Movimento

- O anel interno gira lentamente no sentido horário, com duração de `14s`.
- O arco externo gira ainda mais lentamente no sentido oposto, com duração de `22s`.
- Os pontos rosa e lima pertencem aos anéis; não haverá partículas soltas adicionais.
- A animação é ambiental e contínua, sem mudanças bruscas de escala ou opacidade.
- Com `prefers-reduced-motion: reduce`, os anéis permanecem estáticos em uma composição visual completa.

## Componentes e limites técnicos

- `participant-dashboard.tsx` controla estrutura, responsividade, conteúdo e posição do conjunto orbital.
- `globals.css` controla os anéis, pontos, arcos, gradientes e keyframes.
- A órbita deste hero usa classes próprias com prefixo `.journey-orbit`; a assinatura compartilhada `.semcomp-orbit` não será alterada.
- O botão continua usando o componente compartilhado e mantém foco visível, área de toque e texto atuais.

## Acessibilidade

- O conjunto orbital continua com `aria-hidden="true"`, pois é decorativo; o nível permanece disponível nos dados textuais do dashboard.
- Texto e CTA devem manter contraste perceptível sobre todas as áreas do gradiente.
- `prefers-reduced-motion` deve ser respeitado.
- Nenhum elemento decorativo pode capturar foco ou bloquear interação com o CTA.

## Critérios de aceite

1. O hero não apresenta uma superfície roxa chapada.
2. Texto branco, CTA lima, selo e órbitas são distinguíveis sem esforço.
3. O resultado se aproxima da segunda referência: painel escuro, roxo localizado, selo quadrado e arcos à direita.
4. A órbita aparece em desktop e mobile.
5. Não há sobreposição nem overflow horizontal em `390px` e `1440px`.
6. O CTA continua abrindo o diálogo de resgate.
7. A versão com movimento reduzido preserva a composição sem animação.
8. Testes existentes, lint e build continuam passando.

## Verificação

- Comparação visual em desktop `1440 × 1000`.
- Comparação visual em mobile `390 × 844`.
- Inspeção do contraste nas regiões esquerda, central e orbital.
- Teste funcional do botão “Resgatar código”.
- Suíte completa do web app, lint e build de produção.
