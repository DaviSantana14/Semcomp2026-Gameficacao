# Marco 11 — Presença e Métricas Operacionais

**Data:** 2026-08-21

**Status:** aprovado para planejamento

**Timezone operacional:** `America/Sao_Paulo`

## Objetivo

Medir quantos participantes estão online, preservar os picos de presença e
mostrar a evolução de cadastros e logins sem transformar telemetria em
auditoria ou rastreamento individual. O marco também deve permitir baixar os
dados agregados depois do evento.

## Escopo

- Criar uma sessão persistida para cada JWT emitido.
- Enviar heartbeat aproximadamente a cada 60 segundos enquanto o participante
  estiver autenticado.
- Considerar online quem teve heartbeat nos últimos 120 segundos.
- Consolidar uma amostra por minuto e um resumo por dia.
- Exibir métricas atuais e históricas no dashboard administrativo.
- Exportar somente métricas agregadas em CSV.
- Aplicar retenção automática aos dados de sessão e presença.
- Atualizar o ensaio de carga para incluir 150 sessões com heartbeat.

## Fora do escopo

- Rastreamento de páginas, cliques, rotas, conteúdo digitado, IP ou user-agent.
- Analytics comportamental, funis, mapas de calor ou alertas externos.
- Gráficos sofisticados.
- Exportação de participantes, resgates, pontos ou pedidos da loja; essas
  exportações permanecem no Marco 12.
- Coordenação por Redis, fila ou worker separado.

## Decisões arquiteturais

### Módulo de presença

Um novo `PresenceModule` será responsável por sessões, cálculo de presença,
coleta, consolidação, retenção e consulta das métricas. O módulo não conhecerá
controllers de autenticação ou administração; ele exportará serviços com
interfaces explícitas para os módulos consumidores.

- `AuthModule` usará o serviço de sessões para login, validação do JWT,
  heartbeat e logout.
- `AdminModule` usará o serviço de métricas para overview, histórico e CSV.
- `PresenceModule` dependerá apenas do acesso Prisma e do relógio operacional.

O coletor usará `@nestjs/schedule`. Como cada processo NestJS monta o próprio
agendador, a coordenação acontecerá no PostgreSQL: chaves únicas e upserts
atômicos tornarão coleta, consolidação e limpeza seguras quando houver mais de
uma instância da API.

### Separação entre sessão e presença

Uma sessão permanece autenticável até logout, revogação ou expiração do JWT.
Ausência de heartbeat não encerra a sessão: apenas deixa o participante
offline. Assim, uma aba suspensa pode voltar a enviar heartbeat sem exigir
novo login enquanto seu JWT ainda for válido.

Heartbeat é telemetria operacional. Ele não cria `AdminAuditEvent` nem
`PointEvent`.

## Modelo de dados

### `UserSession`

- `id String @id @default(cuid())`
- `jti String @unique`
- `userId String`
- `startedAt DateTime @default(now())`
- `lastSeenAt DateTime`
- `expiresAt DateTime`
- `endedAt DateTime?`
- `endReason SessionEndReason?`
- relação obrigatória com `User`, usando `onDelete: Restrict`

Índices devem atender às consultas por `jti`, por usuário e à janela de
presença: `(userId, lastSeenAt)`, `(endedAt, expiresAt)` e `lastSeenAt`.

`SessionEndReason` terá:

- `LOGOUT`: encerramento solicitado pelo usuário.
- `EXPIRED`: JWT atingiu `expiresAt`.
- `REVOKED`: usuário foi desativado ou a sessão foi invalidada por uma operação
  administrativa.

Todo login, inclusive administrativo, cria `UserSession`, permitindo validar e
encerrar o JWT. Consultas de presença e login excluem `ADMIN` explicitamente.

### `PresenceSample`

- `id String @id @default(cuid())`
- `bucket DateTime @unique`: início UTC do minuto.
- `onlineParticipants Int`
- `registeredParticipants Int`
- `peakObservedAt DateTime`
- `lastCollectedAt DateTime`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Uma nova observação substitui o pico do bucket somente se
`onlineParticipants` for maior. Nesse caso, também substitui
`registeredParticipants` e `peakObservedAt`. Empates preservam a primeira
observação, enquanto `lastCollectedAt` sempre avança.

### `PresenceDailySummary`

- `id String @id @default(cuid())`
- `operationalDate DateTime @unique @db.Date`
- `peakOnlineParticipants Int`
- `peakAt DateTime?`
- `registeredParticipantsAtPeak Int`
- `uniqueParticipantLogins Int`
- `newParticipantRegistrations Int`
- `lastCalculatedAt DateTime`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

`operationalDate` representa o dia em `America/Sao_Paulo`. Timestamps continuam
armazenados em UTC. Empates de pico preservam o primeiro horário observado.
Conversões de data usarão PostgreSQL e `Intl.DateTimeFormat` com timezone
explícito; nenhuma nova biblioteca de datas será adicionada.

## Ciclo de vida da sessão

### Login

1. Validar as credenciais atuais de participante ou administrador.
2. Gerar `jti` com fonte criptograficamente segura.
3. Calcular `expiresAt` com a mesma duração de 8 horas do JWT.
4. Assinar o JWT com `sub`, `csrfToken` e `jti`.
5. Em transação, atualizar `lastLoginAt` e criar `UserSession`.
6. Somente então definir o cookie e responder ao cliente.

Falha na persistência impede a conclusão do login. A senha, o token, o cookie e
o CSRF nunca são persistidos na sessão.

### Validação do JWT

Além de validar assinatura e expiração, `JwtStrategy` exige que o `jti`:

- exista;
- pertença ao `sub` do JWT;
- não tenha `endedAt`;
- tenha `expiresAt` no futuro;
- pertença a usuário ativo.

A identidade autenticada disponibiliza `jti` ao heartbeat e ao logout.

### Heartbeat

`POST /auth/heartbeat` exige `JwtAuthGuard`, `CsrfGuard` e
`AllowedOriginGuard`. A operação atualiza `lastSeenAt` apenas quando a sessão
continua válida e retorna `204 No Content`. Repetições e chamadas de múltiplas
abas são seguras e não criam novos registros.

### Logout, expiração e revogação

- Logout marca `endedAt` e `LOGOUT` antes de limpar o cookie.
- Uma rotina por minuto marca sessões vencidas como `EXPIRED`, usando o próprio
  `expiresAt` como instante de encerramento.
- Desativar um participante revoga suas sessões abertas na mesma transação da
  alteração administrativa e da auditoria já exigida pelo Marco 10.
- Reativação não restaura sessões; exige novo login.

## Definição de presença

Uma pessoa está online quando existe ao menos uma sessão que satisfaça todas as
condições abaixo no instante da consulta:

- usuário com role `PARTICIPANT`;
- usuário ativo;
- sessão sem `endedAt`;
- `expiresAt` posterior ao instante atual;
- `lastSeenAt` maior ou igual a `agora - 120 segundos`.

A consulta usa `COUNT(DISTINCT userId)`. Abas e dispositivos adicionais não
aumentam a contagem da mesma pessoa. Participantes cadastrados incluem todos os
usuários com role `PARTICIPANT`, ativos ou inativos; administradores nunca
entram nessa métrica.

## Coleta e consolidação

### Coletor por minuto

O coletor executa uma vez por minuto, cinco segundos após a virada do minuto.
Ele:

1. encerra sessões cujo JWT expirou;
2. conta participantes distintos online;
3. conta participantes cadastrados;
4. calcula o bucket do minuto;
5. faz upsert atômico em `PresenceSample`;
6. atualiza o resumo do dia operacional.

O upsert PostgreSQL usa a chave única de `bucket` e expressões equivalentes a
`GREATEST` e `CASE` para manter o maior valor com seus campos correspondentes.
Isso evita duplicação e perda de pico mesmo quando várias instâncias coletam o
mesmo minuto.

O resumo diário recalcula logins únicos e novos cadastros do dia até o instante
da coleta. O volume esperado, 150 participantes, permite essa consulta simples
sem infraestrutura adicional. Índices em `User.createdAt`,
`UserSession.startedAt` e role sustentam essas agregações.

### Estado degradado

O overview compara `lastCollectedAt` da amostra mais recente com o relógio da
API. Se a diferença ultrapassar 120 segundos, retorna `DEGRADED`; caso
contrário, `LIVE`. Ausência de qualquer amostra também retorna `DEGRADED`, com
`lastCollectedAt: null`. O dado antigo pode ser exibido com seu horário, mas
nunca rotulado como tempo real.

Falhas do coletor são registradas com `requestId` ou identificador da execução,
sem PII, e não derrubam a API. A próxima execução tenta novamente.

## API administrativa

Todos os endpoints exigem JWT válido e role `ADMIN`.

### `GET /admin/presence/overview`

Resposta:

```ts
type PresenceOverview = {
  status: "LIVE" | "DEGRADED";
  timezone: "America/Sao_Paulo";
  heartbeatIntervalSeconds: 60;
  onlineWindowSeconds: 120;
  lastCollectedAt: string | null;
  onlineNow: number;
  registeredParticipants: number;
  newRegistrationsToday: number;
  uniqueLoginsToday: number;
  todayPeak: {
    onlineParticipants: number;
    observedAt: string | null;
    registeredParticipantsAtPeak: number;
  };
  overallPeak: {
    onlineParticipants: number;
    observedAt: string | null;
    registeredParticipantsAtPeak: number;
  };
};
```

### `GET /admin/presence/history`

Parâmetros:

- `from` e `to` obrigatórios em ISO 8601.
- `granularity=minute|daily`, com padrão `daily`.
- `page` e `pageSize`, limitado a 500 itens por página.
- Intervalo máximo de 90 dias para minuto e 24 meses para diário.

`from` é inclusivo e `to` é exclusivo. A mesma convenção vale para histórico,
exportação e testes, evitando contagem dupla entre downloads adjacentes.

A resposta informa período normalizado, timezone, granularidade, itens e
metadados de paginação. Intervalos inválidos ou fora da retenção retornam `400`
com mensagem pública específica, sem detalhes internos.

### `GET /admin/presence/export.csv`

Usa `from`, `to` e `granularity` com as mesmas validações do histórico, sem
paginação. Retorna `text/csv; charset=utf-8`, BOM UTF-8 e
`Content-Disposition: attachment` com nome determinístico.

CSV por minuto:

- `inicio_periodo`
- `participantes_online`
- `participantes_cadastrados`
- `pico_observado_em`
- `ultima_coleta_em`

CSV diário:

- `data`
- `pico_online`
- `pico_em`
- `cadastrados_no_pico`
- `logins_unicos`
- `novos_cadastros`

O delimitador será `;`. Datas e horas terão offset explícito de São Paulo. A
exportação não contém CPF, email, `userId`, `jti`, IP ou qualquer linha de
sessão individual.

## Frontend participante

Um `PresenceHeartbeatProvider` será montado dentro do shell autenticado do
participante. Ele usa a infraestrutura HTTP/CSRF existente e dispara heartbeat
a cada 60 segundos, inclusive em segundo plano quando o navegador permitir.

- A primeira chamada ocorre após a sessão autenticada estar disponível.
- Um erro transitório não remove o usuário nem exibe toast repetitivo.
- Um `401` segue o fluxo existente de sessão expirada.
- Desmontar o shell cancela o timer; não existe chamada de logout implícita ao
  fechar a aba.

Não será criada coordenação entre abas neste marco. Idempotência e
`COUNT(DISTINCT userId)` garantem correção; otimizar heartbeats duplicados pode
ser avaliado somente se as métricas demonstrarem necessidade.

## Dashboard administrativo

O dashboard mantém a consulta existente e adiciona uma consulta independente
de presença, atualizada a cada 30 segundos. Assim, falha na telemetria não
oculta métricas de códigos, pontos ou loja.

Novos elementos:

- cards de online agora, pico simultâneo, horário do pico, cadastrados no pico
  e novos cadastros do dia;
- indicação da janela de 120 segundos e da última atualização;
- banner de estado degradado;
- histórico com período, granularidade e paginação;
- botão para baixar o CSV com os filtros ativos;
- estados independentes de loading, atualização em segundo plano, erro, vazio
  e retry.

O histórico será uma tabela/lista acessível. Gráficos permanecem fora deste
marco.

## Retenção

Uma rotina diária, às 03:15 em `America/Sao_Paulo`, aplica:

- `UserSession`: remover 30 dias depois de `endedAt` ou, para sessões já
  expiradas, 30 dias depois de `expiresAt`.
- `PresenceSample`: remover buckets com mais de 90 dias.
- `PresenceDailySummary`: remover dias com mais de 24 meses.

O resumo diário é atualizado durante cada coleta, antes de qualquer amostra se
tornar elegível à exclusão. A limpeza é idempotente e segura em múltiplas
instâncias.

## Privacidade e segurança

- Heartbeat não entra em `AdminAuditEvent`.
- Métricas e logs não armazenam CPF, email, token, cookie, CSRF, IP,
  user-agent, rota ou conteúdo digitado.
- Endpoints administrativos reutilizam `JwtAuthGuard` e `RolesGuard`.
- `GET`s administrativos não exigem CSRF, conforme a política atual.
- O CSV é agregado e nunca inclui identificadores individuais.
- Limpeza não altera o livro-caixa, auditoria ou histórico de pontos.

## Estratégia de testes

### Backend unitário e repository

- início de sessão com `jti` e expiração coerentes com o JWT;
- validação de sessão ativa, encerrada, expirada e pertencente a outro usuário;
- heartbeat idempotente;
- logout e revogação;
- cálculo da janela de 120 segundos;
- múltiplas abas e dispositivos contados uma vez;
- exclusão de admins e inativos;
- upsert concorrente no mesmo bucket preservando o maior pico;
- empate preservando a primeira observação;
- pico geral e diário;
- virada de dia em `America/Sao_Paulo`;
- estado `LIVE` e `DEGRADED`;
- retenção nas três janelas;
- CSV com escaping, BOM, delimitador e ausência de campos proibidos.

### Backend E2E

- login cria sessão e JWT com `jti`;
- heartbeat exige cookie, CSRF e origem permitida;
- logout encerra a sessão e impede reutilização do JWT;
- usuário desativado perde acesso e deixa de contar;
- endpoints de presença recusam participante e aceitam admin;
- histórico valida intervalo e paginação;
- exportação retorna headers e conteúdo agregados.

### Frontend

- timers falsos confirmam heartbeat a cada 60 segundos e cancelamento no
  unmount;
- erro transitório não gera logout;
- dashboard atualiza presence overview a cada 30 segundos;
- estado degradado e última atualização são apresentados corretamente;
- loading, erro, vazio, retry e atualização em segundo plano são independentes;
- filtros do histórico são reutilizados no download.

### Carga e regressão

O cenário do Marco 9 será ampliado para manter 150 sessões participantes com
heartbeat a cada 60 segundos. A validação confirma:

- ausência de `429` no cenário legítimo;
- contagem distinta de 150 pessoas mesmo com heartbeats concorrentes;
- coleta sem duplicar buckets;
- memória abaixo de 75%;
- CPU não sustentada acima de 80%;
- ausência de esgotamento de conexões PostgreSQL;
- nenhuma PII nos relatórios.

Ao final, devem passar testes unitários, repository, E2E, frontend, lint,
builds e `git diff --check`.

## Critérios de aceite

- Login cria sessão persistida e JWT com `jti`; logout invalida a sessão.
- Heartbeat mantém a presença sem registrar navegação individual.
- Online agora usa participantes distintos na janela de 120 segundos.
- Abas e dispositivos adicionais não duplicam uma pessoa.
- Admins e participantes inativos não entram nas métricas.
- Amostras por minuto e resumos diários são idempotentes em múltiplas
  instâncias.
- Pico geral e diário preservam horário e cadastrados naquele instante.
- Dashboard informa atraso e nunca apresenta dado antigo como tempo real.
- CSV pós-evento respeita filtros e não contém dados individuais.
- Retenções de 30 dias, 90 dias e 24 meses são automatizadas.
- A carga de 150 participantes continua dentro dos limites do Marco 9.
- A suíte completa passa sem regressões.
