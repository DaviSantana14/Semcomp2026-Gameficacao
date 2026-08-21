# Marco 11 — Autenticação, presença e resumos operacionais

**Data:** 2026-08-21

**Status:** refinado e aprovado para planejamento

**Timezone operacional:** `America/Sao_Paulo`

## Objetivo

Trocar definitivamente a autenticação participante para email e senha e medir
presença sem rastrear comportamento individual. O Marco 11 preservará o estado
mais recente, picos diários, pico geral, cadastros e logins agregados, com um
CSV pós-evento contendo resumo geral e linhas diárias.

Não existe necessidade de consultar ou exportar a evolução minuto a minuto. O
coletor ainda executa a cada minuto para manter o estado atual e não perder um
pico, mas persiste somente um resumo por dia operacional.

## Escopo

- Participante cadastra nome, CPF, email e senha e já recebe uma sessão.
- Participante autentica somente com email e senha.
- CPF permanece obrigatório, normalizado e único no usuário, fora do login.
- Cada JWT corresponde a uma sessão persistida.
- O frontend participante envia heartbeat aproximadamente a cada 60 segundos.
- Participante fica online por até 120 segundos desde o último heartbeat.
- O backend atualiza um único resumo por dia a cada minuto.
- O dashboard mostra presença atual, resumo diário e resumo geral.
- O histórico administrativo trabalha apenas com dias.
- Um único CSV contém uma linha geral e uma linha para cada dia selecionado.
- Sessões e resumos diários têm retenção automática.
- O ensaio de carga mantém 150 participantes autenticados com heartbeat.

## Fora do escopo

- Histórico, gráfico ou CSV minuto a minuto.
- Tabela permanente de amostras por minuto.
- Rastreamento de páginas, cliques, rotas, conteúdo digitado, IP ou user-agent.
- Analytics comportamental, funis, mapas de calor ou alertas externos.
- Recuperação ou redefinição de senha, envio de email, OTP ou MFA.
- Compatibilidade com o login participante legado por CPF + email.
- Redis, fila, worker separado, eleição de líder ou lock distribuído.
- Exportação individual de participantes, pontos, resgates ou pedidos; essas
  exportações permanecem no Marco 12.

## Arquitetura simplificada

Um novo `PresenceModule` será responsável por sessões, coleta, retenção e
consultas de presença. Ele dependerá somente do Prisma e das funções puras de
tempo operacional.

Os componentes de backend serão:

- `SessionsRepository` e `SessionsService`: criação, validação, heartbeat,
  logout, expiração e limpeza de sessões.
- `PresenceRepository` e `PresenceService`: coleta, upsert diário, overview,
  histórico e dados do CSV.
- `PresenceSchedulerService`: cron por minuto e cron diário de retenção.
- Função pura de serialização CSV, sem serviço ou provider próprio.
- `AdminPresenceController`: três endpoints administrativos protegidos.

Não haverá `PresenceSample`, `PresenceCollectionService`,
`PresenceQueryService`, `PresenceCsvService` nem relógio injetável. Testes
determinísticos usarão relógio falso do Jest e parâmetros explícitos de data
nas funções puras.

O cron de coleta usará `waitForCompletion: true` para impedir sobreposição no
mesmo processo. Cada réplica NestJS continuará executando seu próprio timer;
a chave primária do dia e o upsert atômico no PostgreSQL garantirão segurança
entre processos.

## Corte de credenciais do participante

### Contratos

- Cadastro participante: `name`, `cpf`, `email`, `password`.
- Login participante: `email`, `password`.
- Login administrativo: `cpf`, `email`, `password`.
- `LoginDto` e `AdminLoginDto` são independentes.
- Confirmação de senha existe somente no formulário de cadastro.

`passwordHash` permanece nullable no schema porque o bootstrap administrativo
cria inicialmente um administrador sem senha. Todo novo participante recebe um
hash. Participante sem hash recebe a mesma falha pública de senha incorreta.

### Política de senha

A senha participante aceita quaisquer caracteres, incluindo Unicode e
espaços, sem regra de composição:

- mínimo de 8 caracteres Unicode;
- máximo de 64 caracteres Unicode;
- máximo de 72 bytes em UTF-8, rejeitado antes do bcrypt.

A política administrativa permanece com mínimo de 12 caracteres, máximo de 64
caracteres e 72 bytes UTF-8.

`AdminPasswordService` e `ParticipantPasswordService` continuam sendo as
interfaces por papel. Funções puras compartilhadas concentram bcrypt v6
assíncrono, custo 12, salt automático, hash dummy e a regra de exatamente uma
comparação para cada tentativa. Não será criado um terceiro provider apenas
para encapsular `hash()` e `compare()`.

Como o projeto ainda está em pré-evento, a migration não altera nem apaga
usuários existentes. Bancos locais descartáveis podem ser recriados
explicitamente. Não haverá reset automático de banco nem ativação de legado.

## Modelo de dados

### `UserSession`

```prisma
model UserSession {
  id         String            @id
  userId     String
  user       User              @relation(fields: [userId], references: [id], onDelete: Restrict)
  startedAt  DateTime
  lastSeenAt DateTime
  expiresAt  DateTime
  endedAt    DateTime?
  endReason  SessionEndReason?

  @@index([userId, lastSeenAt])
  @@index([endedAt, expiresAt])
  @@index([lastSeenAt])
  @@index([startedAt])
}
```

`id` é um UUID gerado pela aplicação antes de assinar o JWT. Esse mesmo valor
é enviado no claim padrão `jti`; não existe uma segunda coluna ou identificador
de sessão.

`SessionEndReason` contém `LOGOUT`, `EXPIRED` e `REVOKED`.

### `PresenceDailySummary`

```prisma
model PresenceDailySummary {
  operationalDate                         DateTime @id @db.Date
  lastObservedOnlineParticipants          Int
  registeredParticipantsAtLastObservation Int
  lastCollectedAt                         DateTime
  peakOnlineParticipants                  Int
  peakAt                                  DateTime?
  registeredParticipantsAtPeak            Int
  uniqueParticipantLogins                 Int
  newParticipantRegistrations             Int
  createdAt                               DateTime @default(now())
  updatedAt                               DateTime @updatedAt
}
```

`operationalDate` representa o dia em `America/Sao_Paulo` e é a própria chave
primária. Timestamps continuam em UTC. O modelo não possui `id` separado.

`User` recebe a relação `sessions UserSession[]` e índice composto
`(role, createdAt)` para contagens por período.

## Ciclo de vida da sessão

### Cadastro

1. Normalizar nome, CPF e email e validar a senha.
2. Calcular o hash antes de tentar inserir.
3. Gerar ID da conta, ID da sessão/`jti`, CSRF e expiração de 8 horas.
4. Assinar o JWT com `sub`, `csrfToken` e `jti`.
5. Em uma transação, criar participante, sessão e `lastLoginAt`.
6. Somente após o commit, definir o cookie e retornar `{ user, csrfToken }`.

Constraints únicas do PostgreSQL decidem conflitos de CPF/email. Não haverá
consulta prévia de existência. Conflitos recebem mensagem neutra.

### Login

Participante inexistente, administrador, inativo, sem hash ou com senha errada
sempre executa uma comparação bcrypt e recebe `Email ou senha inválidos.`.

Após validar a credencial, o início de sessão atualiza `lastLoginAt` e cria
`UserSession` em uma transação que confirma novamente `id`, papel e estado
ativo. Isso fecha a corrida entre comparação da senha e desativação da conta.

O login administrativo mantém sua rota e mensagem genérica atuais e também
cria sessão persistida.

### Validação, heartbeat e encerramento

Além de assinatura e expiração, `JwtStrategy` exige que o `jti`:

- exista como `UserSession.id`;
- pertença ao `sub`;
- não tenha `endedAt`;
- tenha `expiresAt` no futuro;
- pertença a usuário ativo.

`POST /auth/heartbeat` exige JWT, CSRF e origem permitida. Ele atualiza
`lastSeenAt` somente se a sessão continua válida e retorna `204`.

Logout marca `endedAt` e `LOGOUT` antes de limpar o cookie. O cron marca sessões
vencidas como `EXPIRED`, usando `expiresAt` como encerramento. Desativação de
participante marca sessões abertas como `REVOKED` na mesma transação da mudança
de status e da auditoria. Reativação exige novo login.

## Definição de presença

Uma pessoa está online quando existe ao menos uma sessão com:

- usuário `PARTICIPANT` ativo;
- `endedAt` ausente;
- `expiresAt` posterior ao instante da coleta;
- `lastSeenAt >= agora - 120 segundos`.

A consulta usa `COUNT(DISTINCT userId)`. Abas e dispositivos adicionais não
duplicam a pessoa. Administradores e participantes inativos são excluídos.

Participantes cadastrados incluem todos os usuários `PARTICIPANT`, ativos ou
inativos. Administradores nunca entram em presença, cadastros, picos ou logins.

## Coleta e resumo diário

O coletor executa no segundo 5 de cada minuto:

1. Captura um único instante `now`.
2. Marca sessões vencidas.
3. Conta participantes distintos online.
4. Conta participantes cadastrados.
5. Conta logins únicos e novos cadastros do dia operacional.
6. Faz um único upsert atômico no resumo daquele dia.

Em toda coleta, os campos `lastObserved*`, `lastCollectedAt`, logins e cadastros
do dia são atualizados. Os campos de pico mudam somente quando o novo número
online é estritamente maior. Empates preservam o primeiro horário e seus
cadastrados correspondentes.

O `INSERT ... ON CONFLICT (operationalDate) DO UPDATE` usa `GREATEST` e `CASE`
em uma única instrução PostgreSQL parametrizada. Duas réplicas podem observar o
mesmo minuto sem duplicar o dia, reduzir o pico ou separar o valor do pico dos
campos correspondentes.

Não existe reconstrução de curva intradiária. Após a virada do dia, o último
estado e o pico daquele dia permanecem no resumo diário.

## Resumo atual, diário e geral

### Estado atual

O estado atual vem do resumo do dia operacional. Se não existir resumo ou se
`agora - lastCollectedAt > 120 segundos`, o status é `DEGRADED`. Caso contrário,
é `LIVE`. Dados antigos podem aparecer com seu horário, mas nunca com indicador
de tempo real.

### Resumo diário

Cada linha contém:

- data operacional;
- última presença observada e última coleta;
- pico online, data/hora e cadastrados no pico;
- logins únicos do dia;
- novos cadastros do dia.

### Resumo geral

O resumo geral contém:

- online na última coleta;
- total atual de participantes cadastrados;
- pico geral dentro dos resumos ainda retidos, com data/hora e cadastrados;
- participantes que já fizeram ao menos um login, calculados por
  `User.lastLoginAt != null` e role `PARTICIPANT`;
- quantidade de dias monitorados ainda retidos.

Somar logins únicos diários não representa pessoas únicas no evento e não será
apresentado como tal.

## API de autenticação

### `POST /auth/register`

Recebe `name`, `cpf`, `email`, `password`; exige origem permitida e rate limit,
mas não CSRF porque ainda não existe sessão. Define cookie httpOnly e retorna
`{ user, csrfToken }`.

### `POST /auth/login`

Recebe somente `email`, `password`; normaliza apenas o email. Exige origem
permitida e rate limit por chave HMAC derivada do email normalizado.

### `POST /auth/admin/login`

Continua recebendo CPF, email e senha. A única mudança pública é a sessão
persistida cujo ID também aparece como `jti` no JWT.

## API administrativa

Todos os endpoints exigem JWT válido e role `ADMIN`.

### `GET /admin/presence/overview`

```ts
type PresenceOverview = {
  status: "LIVE" | "DEGRADED";
  timezone: "America/Sao_Paulo";
  heartbeatIntervalSeconds: 60;
  onlineWindowSeconds: 120;
  lastCollectedAt: string | null;
  onlineNow: number;
  registeredParticipants: number;
  uniqueParticipantsEverLogged: number;
  monitoredDays: number;
  today: {
    operationalDate: string;
    peakOnlineParticipants: number;
    peakAt: string | null;
    registeredParticipantsAtPeak: number;
    uniqueParticipantLogins: number;
    newParticipantRegistrations: number;
  };
  overallPeak: {
    operationalDate: string | null;
    onlineParticipants: number;
    observedAt: string | null;
    registeredParticipantsAtPeak: number;
  };
};
```

Sem coleta no dia, `onlineNow` e o resumo de hoje usam zero/null e o status é
`DEGRADED`. O pico geral pode continuar disponível a partir de dias anteriores.

### `GET /admin/presence/history`

Parâmetros obrigatórios:

- `from=YYYY-MM-DD`, inclusivo;
- `to=YYYY-MM-DD`, exclusivo.

O intervalo máximo é de 24 meses e não pode começar antes da retenção. Não há
granularidade nem paginação; o máximo prático é 731 linhas. A resposta contém
período, timezone e itens diários em ordem crescente.

Datas inválidas, `from >= to`, intervalo excessivo ou fora da retenção retornam
`400` com mensagem pública específica.

### `GET /admin/presence/export.csv`

Recebe os mesmos `from` e `to` e reutiliza exatamente a mesma validação. Retorna
UTF-8 com BOM, delimitador `;`, CRLF, datas `YYYY-MM-DD` e timestamps com offset
explícito de São Paulo.

Cabeçalho único:

```text
tipo;periodo;online_ultima_coleta;pico_online;pico_em;cadastrados_no_pico;logins_unicos;novos_cadastros;cadastrados_totais;dias_monitorados;ultima_coleta_em
```

O primeiro registro é `GERAL` e representa o resumo geral de todos os dados
ainda retidos, independentemente do recorte diário. Em seguida vêm registros
`DIARIO` apenas para `[from, to)`. Campos sem significado para um tipo ficam
vazios. `logins_unicos` na linha geral significa participantes que já fizeram
login; nas linhas diárias significa participantes distintos naquele dia.

O arquivo nunca contém CPF, email, `userId`, ID de sessão/`jti`, IP, user-agent
ou linha individual de sessão.

## Frontend participante

### Cadastro e login

`/cadastro` contém nome, CPF, email, senha e confirmação. A confirmação fica no
Zod e não vai à API. O campo permite colar, não aplica trim e informa os limites
8/64/72. A tela explica que recuperação automática ainda não existe. Cadastro
bem-sucedido segue diretamente para `/home` sem segunda chamada de login.

`/login` contém somente email e senha com autocomplete `username` e
`current-password`. Não possui CPF nem link de recuperação inexistente.

### Heartbeat

O shell participante monta um hook baseado em `useEffect`:

- envia imediatamente após montar;
- usa `setInterval` de 60 segundos;
- usa `AbortController` e limpa timer/requisição no unmount;
- em `401`, limpa o CSRF local e redireciona para `/login`;
- falhas transitórias não fazem logout nem mostram toast repetitivo.

TanStack Query não será usado para heartbeat: a operação é telemetria periódica
sem dado de servidor para cache. Múltiplas abas continuam permitidas e não
alteram a contagem distinta.

## Dashboard administrativo

O dashboard mantém sua consulta atual e adiciona uma consulta independente de
overview, atualizada por TanStack Query a cada 30 segundos.

Novos elementos:

- online na última coleta e indicador `LIVE`/`DEGRADED`;
- janela de 120 segundos e última atualização;
- pico de hoje e pico geral com horário e cadastrados no pico;
- total cadastrado, participantes que já entraram e dias monitorados;
- novos cadastros e logins únicos de hoje;
- histórico por intervalo de datas, sem seletor de granularidade;
- tabela diária sem paginação;
- botão de CSV com os mesmos filtros;
- loading, erro, vazio e retry independentes da consulta antiga.

## Retenção

O cron diário executa às 03:15 em `America/Sao_Paulo`:

- remove `UserSession` 30 dias após `endedAt` ou, se ainda aberta e expirada,
  30 dias após `expiresAt`;
- remove `PresenceDailySummary` anterior a 24 meses.

Linhas exatamente no cutoff permanecem até a próxima execução. A limpeza é
idempotente em múltiplas instâncias. Não existe retenção de 90 dias porque não
existe amostra por minuto.

## Privacidade e segurança

- Senha, confirmação e hash nunca entram em resposta, JWT, cookie, auditoria
  ou log.
- JWT contém `sub`, CSRF e `jti`, mas nenhum CPF/email.
- Tentativas inválidas executam uma comparação bcrypt e têm resposta pública
  equivalente.
- Chaves de rate limit usam HMAC; CPF/email não aparecem em claro.
- Heartbeat não cria `AdminAuditEvent` nem `PointEvent`.
- Métricas não armazenam dados individuais ou comportamentais.
- GETs administrativos não exigem CSRF conforme a política atual.
- CSV contém somente dados agregados.
- Limpeza não altera auditoria, pontos, pedidos ou livro-caixa.

## Estratégia de testes

### Backend unitário e repository

- política participante aceita caracteres livres, Unicode e espaços entre 8 e
  64 caracteres e rejeita mais de 72 bytes;
- política administrativa permanece 12/64/72;
- comparação dummy cobre todos os estados inválidos;
- cadastro cria usuário e sessão atomicamente;
- participante usa email/senha e administrador preserva CPF/email/senha;
- ID da sessão e `jti` são o mesmo valor;
- validação, heartbeat, logout, expiração e revogação;
- contagem distinta exclui administradores e inativos;
- upsert concorrente do mesmo dia preserva o maior pico;
- empate preserva a primeira observação;
- virada de dia em `America/Sao_Paulo`;
- resumo diário, geral e estado `LIVE`/`DEGRADED`;
- filtros `[from, to)` com datas e limite de 24 meses;
- retenção de sessões e resumos;
- CSV com BOM, delimitador, escaping, linha geral, linhas diárias e ausência de
  campos proibidos.

### Backend E2E

- cadastro define cookie e retorna `{ user, csrfToken }`;
- login legado é rejeitado e email/senha é aceito;
- JWT usa o ID persistido da sessão como `jti`;
- heartbeat exige cookie, CSRF e origem;
- logout e desativação invalidam a sessão;
- participante não acessa endpoints administrativos;
- overview, histórico diário e CSV respondem corretamente;
- concorrência real no PostgreSQL mantém uma linha por dia e o maior pico.

### Frontend

- formulários aplicam os contratos e políticas corretos;
- cadastro não executa segundo login;
- timer envia imediatamente, repete em 60 segundos e é limpo no unmount;
- erro transitório fica silencioso e `401` redireciona;
- overview atualiza em 30 segundos sem bloquear o dashboard existente;
- estado degradado, histórico diário e CSV usam os filtros corretos;
- loading, erro, vazio e retry são independentes.

### Carga e regressão

O ensaio mantém 150 sessões participantes com heartbeat a cada 60 segundos. A
validação confirma 150 pessoas distintas online, ausência de `429` legítimo,
uma única linha para o dia, pico preservado, memória abaixo de 75%, CPU não
sustentada acima de 80%, conexões PostgreSQL saudáveis e relatório sem PII ou
credenciais.

Ao final passam Prisma validate/generate, lint, unitários, repository, E2E,
frontend, typecheck, builds, contratos de carga e `git diff --check`.

## Critérios de aceite

- Participante cadastra nome, CPF, email e senha e já recebe sessão.
- Participante entra somente com email e senha; CPF continua obrigatório e
  único como dado do usuário.
- Senha participante é livre, com limites 8/64/72; política admin não muda.
- Falhas não revelam existência, papel, estado ou hash.
- Todo JWT usa o ID de uma sessão persistida como `jti`.
- Logout, expiração e desativação encerram sessões corretamente.
- Heartbeat mantém presença sem registrar navegação.
- Online usa participantes distintos na janela de 120 segundos.
- Coleta por minuto atualiza somente uma linha por dia.
- Múltiplas instâncias não duplicam o dia nem reduzem o pico.
- Dashboard apresenta estado atual, resumo diário e geral.
- Não existe histórico ou exportação minuto a minuto.
- CSV contém uma linha geral e linhas diárias agregadas.
- Sessões ficam 30 dias após encerramento/expiração e dias ficam 24 meses.
- A carga de 150 participantes permanece dentro dos limites do Marco 9.
- Toda a suíte passa sem regressões.
