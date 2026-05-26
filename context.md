# Semcomp Gamification — Contexto do Projeto

## Visão

Sistema de gamificação para a **Semcomp (Semana de Computação de Salvador)**.
Participantes acumulam pontos realizando ações no evento (check-in, visitar stand,
fazer pergunta em palestra, descobrir easter egg etc.) e podem trocá-los por
recompensas em uma lojinha.

### Objetivo de negócio
- Aumentar o engajamento dos participantes nas atividades do evento
- Incentivar presença, participação ativa e exploração dos espaços
- Criar competição saudável via ranking em tempo real (TV do evento)
- Oferecer recompensas tangíveis como incentivo extra

---

## Stack

| camada | tecnologia |
|--------|------------|
| monorepo | npm workspaces + Turbo |
| backend | NestJS (Node.js + TypeScript) |
| ORM | Prisma com driver adapter (`@prisma/adapter-pg`) |
| banco | PostgreSQL 16 (Docker Compose) |
| autenticação | JWT via cookie httpOnly (com `passport-jwt`) |
| documentação | Swagger (`@nestjs/swagger`) |
| frontend | Next.js App Router + Tailwind + shadcn/ui |
| CI/CD | GitHub Actions |
| deploy (planejado) | Render (back) + Vercel (front) |

---

## Estrutura de pastas

```
semcomp/
├── apps/
│   ├── api/                       → NestJS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma      → modelo de dados
│   │   │   ├── migrations/        → histórico de migrações
│   │   │   └── seed.ts            → seed do banco (idempotente)
│   │   ├── src/
│   │   │   ├── main.ts            → bootstrap (ValidationPipe, Swagger, CORS)
│   │   │   ├── app.module.ts
│   │   │   ├── auth/              → autenticação (register, login, JWT, guards)
│   │   │   ├── users/             → usuários (CRUD, me, dados de progresso)
│   │   │   ├── actions/           → ações pontuáveis (CRUD, resgate/redeem)
│   │   │   ├── admin/             → AdminModule (dashboard, métricas, gestão)
│   │   │   ├── prisma/            → PrismaService (global, adapter pg)
│   │   │   └── common/            → DTOs compartilhados (HttpErrorResponseDto)
│   │   ├── .env.example           → template de variáveis de ambiente
│   │   └── prisma.config.ts       → configuração do Prisma 7
│   └── web/                       → Next.js frontend
├── docker-compose.yml             → PostgreSQL local
├── turbo.json                     → configuração do Turbo
├── package.json                   → raiz do monorepo (workspaces, scripts)
├── .env.example                   → template de env para docker-compose
├── .gitignore                     → centralizado na raiz
├── .github/workflows/ci.yml       → CI (lint, build, prisma generate)
└── context.md                     → este arquivo
```

---

## Banco de dados (Prisma)

### Enums

| enum | valores | descrição |
|------|---------|-----------|
| `UserRole` | `PARTICIPANT`, `ADMIN` | define permissões de acesso |
| `ActionType` | `CHECKIN`, `ATTENDANCE`, `STAND_VISIT`, `EASTER_EGG`, `QUESTION`, `DYNAMIC`, `BONUS` | classifica o tipo de ação pontuável |
| `PointEventKind` | `CREDIT`, `DEBIT` | indica se o evento adiciona ou remove pontos |
| `PointEventSource` | `ACTION_REDEEM`, `ADMIN_GRANT`, `ADMIN_ADJUST`, `REWARD_REDEMPTION` | registra a origem da pontuação |

### Models atuais

#### `User`
Participante ou administrador do sistema. Base de identidade e progresso.

| campo | tipo | descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | identificador único |
| `name` | `String` | nome completo |
| `cpf` | `String @unique` | CPF normalizado (só dígitos), usado como um dos fatores de login |
| `email` | `String @unique` | email normalizado (lowercase), usado como um dos fatores de login e comunicação |
| `role` | `UserRole @default(PARTICIPANT)` | papel do usuário |
| `points` | `Int @default(0)` | moeda para trocar por recompensas (gastável) |
| `xp` | `Int @default(0)` | progresso total acumulado (nunca diminui, base do ranking) |
| `level` | `Int @default(1)` | nível atual (cálculo pendente de definição de thresholds) |
| `isActive` | `Boolean @default(true)` | permite desativar sem excluir |
| `lastLoginAt` | `DateTime?` | última vez que fez login |
| `createdAt` | `DateTime @default(now())` | data de cadastro |
| `updatedAt` | `DateTime @updatedAt` | última atualização |

#### `Action`
Define uma oportunidade de ganhar pontos. Ex: "Check-in Dia 1", "Stand X", "Pergunta em Palestra".

| campo | tipo | descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | identificador único |
| `name` | `String` | nome da ação |
| `description` | `String?` | descrição opcional |
| `type` | `ActionType` | tipo da ação |
| `code` | `String? @unique` | código reutilizável opcional para resgate no evento |
| `points` | `Int` | quantos pontos/XP concede |
| `isActive` | `Boolean @default(true)` | permite desativar sem excluir |
| `createdAt` | `DateTime @default(now())` | data de criação |
| `updatedAt` | `DateTime @updatedAt` | última atualização |

#### `PointEvent`
Fonte da verdade de toda movimentação de pontos. Tanto créditos quanto débitos.
Também serve como **trava de duplicidade de resgate** (não foi criada tabela
separada de redemption — `PointEvent` com `userId + actionId + source = ACTION_REDEEM`
cumpre esse papel).

| campo | tipo | descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | identificador único |
| `userId` | `String` | usuário que recebeu/perdeu os pontos |
| `actionId` | `String?` | ação associada (se houver) |
| `points` | `Int` | valor (positivo para crédito, negativo para débito) |
| `kind` | `PointEventKind` | `CREDIT` ou `DEBIT` |
| `source` | `PointEventSource` | origem da movimentação |
| `description` | `String?` | descrição opcional (ex: "Resgate da action: Check-in Dia 1") |
| `createdAt` | `DateTime @default(now())` | data do evento |

Índices: `userId`, `actionId`, `createdAt`.

### Relações
- `User` --< `PointEvent` (cascade delete)
- `Action` --< `PointEvent` (set null on delete)

### Models a implementar

#### `Reward` (recompensa da lojinha)

| campo | tipo | descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | identificador único |
| `name` | `String` | nome do item (ex: "Camiseta Semcomp 2026") |
| `description` | `String?` | descrição opcional |
| `costInPoints` | `Int` | quantos points custa |
| `stock` | `Int` | quantidade disponível |
| `isActive` | `Boolean @default(true)` | permite desativar sem excluir |
| `imageUrl` | `String?` | foto do item (opcional) |
| `createdAt` | `DateTime @default(now())` | data de criação |
| `updatedAt` | `DateTime @updatedAt` | última atualização |

#### `RewardRedemption` (resgate de recompensa)

| campo | tipo | descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | identificador único |
| `userId` | `String` | quem resgatou |
| `rewardId` | `String` | qual item |
| `pointsSpent` | `Int` | quantos pontos gastou |
| `status` | `RedemptionStatus @default(PENDING)` | `PENDING \| DELIVERED \| CANCELLED` |
| `createdAt` | `DateTime @default(now())` | data do resgate |
| `updatedAt` | `DateTime @updatedAt` | última atualização |

**Fluxo:** participante resgata no app (self-service) → desconta `points` do `User`,
reduz `stock` do `Reward`, cria `RewardRedemption` com status `PENDING` e
`PointEvent` de débito (`REWARD_REDEMPTION`, `DEBIT`). Staff da lojinha
acessa painel de pedidos pendentes, entrega o item físico e clica em "Entregue"
→ status muda para `DELIVERED`. Cancelamento reverte `points` e `stock`,
cria `PointEvent` de estorno (`CREDIT`).

#### `ClaimCode` (código de uso único)

| campo | tipo | descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | identificador único |
| `code` | `String @unique` | código aleatório (ex: `K7XM-9N2P`) |
| `actionId` | `String` | qual action concede pontos |
| `isUsed` | `Boolean @default(false)` | já foi usado |
| `usedBy` | `String?` | userId de quem usou |
| `usedAt` | `DateTime?` | quando foi usado |
| `createdAt` | `DateTime @default(now())` | data de geração |

**Formato:** 8 caracteres alfanuméricos maiúsculos aleatórios, sem `I`, `O`, `0`, `1`
para evitar confusão, com hífen no meio (ex: `K7XM-9N2P`). Sem padrão sequencial.

**Geração:** admin gera lotes pré-evento com opção de gerar na hora
(`POST /admin/actions/:id/claim-codes/generate`, `body: { quantity: 50 }`).

#### Campo `code` na `Action` (código reutilizável)

Adicionar campo opcional `code String?` na `Action`. Ex: `"DIA1"`.
Vários usuários usam o mesmo código; proteção contra duplicidade por `PointEvent`
(um resgate por usuário por action). Resolve check-in/stands/presença.

---

## Variáveis de ambiente

### Raiz (para docker-compose)
Arquivo: `.env` (não versionado) / `.env.example` (versionado)

| variável | exemplo |
|----------|---------|
| `COMPOSE_PROJECT_NAME` | `semcomp` |
| `POSTGRES_DB` | `your_database` |
| `POSTGRES_USER` | `your_user` |
| `POSTGRES_PASSWORD` | `your_password` |
| `POSTGRES_PORT` | `5432` |

### Backend
Arquivo: `apps/api/.env` (não versionado) / `apps/api/.env.example` (versionado)

| variável | exemplo | descrição |
|----------|---------|-----------|
| `DB_HOST` | `localhost` | host do PostgreSQL |
| `DB_PORT` | `5432` | porta |
| `DB_NAME` | `your_database` | nome do banco |
| `DB_USER` | `your_user` | usuário |
| `DB_PASSWORD` | `your_password` | senha |
| `DB_SCHEMA` | `public` | schema |
| `JWT_SECRET` | `your_jwt_secret` | segredo para assinar JWT |
| `FRONTEND_URL` | `http://localhost:3000` | origem do frontend para CORS |
| `COOKIE_SAME_SITE` | `lax` | política SameSite do cookie (`lax`, `strict` ou `none`) |
| `COOKIE_SECURE` | `false` | define se cookies usam `Secure` (`true` ou `false`) |

O helper `buildDatabaseUrl()` monta a connection string no runtime a partir dessas
variáveis separadas. Decisão: usar variáveis independentes em vez de uma única
`DATABASE_URL` facilita configuração por ambiente e evita duplicação.

---

## API — Endpoints atuais

### Auth (público)

| método | rota | descrição |
|--------|------|-----------|
| `POST` | `/auth/register` | cadastrar novo participante |
| `POST` | `/auth/login` | autenticar e iniciar sessão |
| `GET` | `/auth/csrf` | recuperar token CSRF da sessão autenticada |

`POST /auth/login` retorna `{ user, csrfToken }` e **seta cookie httpOnly** com
o JWT. Não retorna token JWT no body.

### Users (protegido)

| método | rota | acesso | descrição |
|--------|------|--------|-----------|
| `GET` | `/users/me` | autenticado | perfil do usuário logado |
| `GET` | `/users` | `ADMIN` | listar todos os usuários |
| `GET` | `/users/:id` | `ADMIN` | buscar usuário por id |

### Actions (misto)

| método | rota | acesso | descrição |
|--------|------|--------|-----------|
| `POST` | `/actions` | `ADMIN` | criar ação pontuável |
| `GET` | `/actions` | `ADMIN` | listar ações |
| `GET` | `/actions/:id` | `ADMIN` | buscar ação por id |
| `POST` | `/actions/:id/redeem` | autenticado | resgatar ação por id (uso interno/admin) |
| `POST` | `/actions/redeem-code` | autenticado | resgatar ação por código reutilizável |

### Admin (protegido, ADMIN only — a implementar)

Rotas cross-domain e de gestão centralizada no `AdminModule`.

| método | rota | descrição |
|--------|------|-----------|
| `GET` | `/admin/dashboard` | métricas agregadas (usuários, pontos, ações mais resgatadas) |
| `POST` | `/admin/actions/:id/claim-codes/generate` | gerar lote de códigos de uso único |
| `GET` | `/admin/redemptions/pending` | pedidos da lojinha aguardando entrega |
| `PATCH` | `/admin/redemptions/:id/deliver` | marcar pedido como entregue |

Rotas admin de CRUD (ex: `POST /actions`, `GET /users`) permanecem nos seus
módulos de domínio. Apenas operações que agregam múltiplos domínios ou não
pertencem naturalmente a um módulo específico vão para o `AdminModule`.

### Ranking (protegido)

| método | rota | descrição |
|--------|------|-----------|
| `GET` | `/ranking?limit=10` | top N geral por XP |
| `GET` | `/ranking?period=daily&limit=10` | top N por período (a implementar) |

**Parâmetros atuais:** `limit` (padrão 10, máx 50).
**Parâmetros futuros:** `period` (`daily`, `weekly`, `all`).

**Resposta:** `{ ranking: [{ position, name, xp }], me: { position, name, xp } }`.
Sempre inclui a posição do usuário logado, mesmo que fora do top N.

**Ranking geral:** implementado em `GET /ranking?limit=10`; ordena participantes
ativos por `User.xp` (`xp DESC`, `createdAt ASC`, `id ASC`). Admins não entram
no placar competitivo.

**Ranking diário/semanal:** calcula o XP ganho no período a partir de eventos que
concedem XP, inicialmente `ACTION_REDEEM`, dentro da janela solicitada.
Movimentações da lojinha, débitos e estornos/cancelamentos de rewards não entram
no ranking.

`xpDelta` em `PointEvent` é uma possível evolução futura se surgirem muitos tipos
de bônus, ajustes administrativos ou regras diferentes de ganho de XP. Não é
requisito para o MVP.

### Rewards (protegido — a implementar)

| método | rota | acesso | descrição |
|--------|------|--------|-----------|
| `POST` | `/rewards` | `ADMIN` | criar recompensa |
| `GET` | `/rewards` | autenticado | catálogo da lojinha |
| `GET` | `/rewards/:id` | autenticado | detalhe do item |
| `POST` | `/rewards/:id/redeem` | autenticado | resgatar (self-service) |
| `PATCH` | `/rewards/:id` | `ADMIN` | editar recompensa |

---

## Autenticação e autorização

### Fluxo de login
1. participante envia CPF + email
2. sistema valida credenciais
3. gera `csrfToken` aleatório
4. gera JWT assinado com `JWT_SECRET`, contendo `sub` e `csrfToken`
5. seta cookie `access_token` (httpOnly, 8h; política `sameSite`/`secure`
   configurável por ambiente)
6. retorna `{ user, csrfToken }` no body

### `points` vs `xp`
- `points` = exclusivamente moeda gastável da lojinha
- `xp` = exclusivamente progresso competitivo, usado para ranking e nível
- Actions incrementam `points` e `xp`
- Rewards debitam apenas `points`
- Cancelamentos de rewards devolvem apenas `points` e `stock`
- Todo ranking é baseado em `xp`, nunca em saldo de `points`

Para rankings por período, usar apenas eventos que concedem XP, como resgates de
actions, dentro da janela solicitada. Movimentações da lojinha, incluindo débitos
e estornos, não entram no ranking.

### Resgate de action — regras
1. usuário autenticado chama `POST /actions/:id/redeem`
2. sistema valida ação existe, está ativa
3. verifica se já existe `PointEvent` (`CREDIT`, `ACTION_REDEEM`) do mesmo usuário para a mesma ação
4. se sim → `409 Conflict`
5. se não → cria `PointEvent`, incrementa `points` e `xp` no `User` (em transação)
6. retorna saldo atualizado

### Guards
- `JwtAuthGuard`: extrai e valida o JWT (do cookie httpOnly no runtime)
- `CsrfGuard`: exige `X-CSRF-Token` em mutações autenticadas e compara com o
  `csrfToken` da sessão JWT
- `RolesGuard`: verifica se o usuário tem a role exigida (`@Roles(UserRole.ADMIN)`)

Rotas sem `@Roles()` são acessíveis por qualquer usuário autenticado.
Métodos seguros (`GET`, `HEAD`, `OPTIONS`) não exigem CSRF. Métodos mutantes
autenticados (`POST`, `PUT`, `PATCH`, `DELETE`) exigem o header `X-CSRF-Token`.

### `level` (nível)
O campo `level` existe com default `1`, mas o cálculo de progressão
(ex: a cada 100 xp sobe 1 nível) será implementado depois, com thresholds
calibrados com dados reais do evento.

---

## Respostas da API

### Padrão de resposta de sucesso
Toda resposta de entidade usa **Response DTO** com `@ApiProperty` para Swagger:
- `UserResponseDto`
- `ActionResponseDto`
- `RedeemActionResponseDto`
- `LoginResponseDto`

### Padrão de resposta de erro
Toda resposta de erro segue o formato documentado por `HttpErrorResponseDto`:
```json
{
  "statusCode": 409,
  "message": "Você já resgatou esta action.",
  "error": "Conflict"
}
```

Mensagens em português.

### HTTP status utilizados
| código | quando |
|--------|--------|
| `201` | recurso criado (register, create action, redeem) |
| `200` | sucesso (login, listagens, busca por id, me) |
| `400` | requisição inválida (action inativa, validação de DTO) |
| `401` | não autenticado (token ausente/inválido, credenciais erradas) |
| `403` | sem permissão (usuário não-admin acessa rota admin) |
| `404` | recurso não encontrado (action ou usuário inexistente) |
| `409` | conflito (CPF/email já cadastrado, action já resgatada) |

---

## Decisões de arquitetura e design

### 1. Monorepo com npm workspaces + Turbo
**Decisão:** usar npm workspaces com Turbo, não Nx ou Lerna.
**Motivo:** experiência prévia com Turbo; simplicidade para dois apps; logs
organizados por workspace no terminal; cache de build.

### 2. Prisma com driver adapter (`PrismaPg`) em vez do padrão
**Decisão:** usar `@prisma/adapter-pg` com `pg.Pool`, sem `url = env("DATABASE_URL")`
no datasource do schema.
**Motivo:** o Prisma 7 gerou o projeto nesse formato. O adapter permite controle
fino da pool de conexões, mais adequado para ambientes serverless/edge.
Consequência: seed e scripts que usam Prisma precisam replicar o adapter.

### 3. Variáveis de ambiente separadas (`DB_HOST`, `DB_PORT`…) em vez de `DATABASE_URL`
**Decisão:** usar variáveis independentes.
**Motivo:** solicitado para não hardcodar nada. Separar facilita configuração por
ambiente, evita duplicação entre docker-compose e backend, e permite alterar
cada valor individualmente. O helper `buildDatabaseUrl()` monta a string no runtime.

### 4. Autenticação com CPF + email (sem senha, sem código temporário)
**Decisão:** login apenas com CPF + email.
**Motivo:** priorização de simplicidade e alta adesão dos participantes.
**Risco aceito:** segurança baixa (impersonation possível se alguém souber CPF e email).
**Mitigação futura:** código por email/WhatsApp ou QR code pessoal no credenciamento.
**Preparação:** sistema modelado para evoluir (auth desacoplada, guards separados).

### 5. JWT via cookie httpOnly (melhor prática)
**Decisão:** usar cookie httpOnly em vez de localStorage + Bearer.
**Motivo:** proteção contra XSS (JS não lê o token); browser envia automaticamente;
compatível com SSR; padrão de segurança recomendado.
**Implementação:** `cookie-parser`, CORS com `credentials: true`, `jwtFromRequest`
via `ExtractJwt.fromExtractors`, JWT com `expiresIn: '8h'`, política de cookie
configurável por `COOKIE_SAME_SITE` e `COOKIE_SECURE`, e proteção CSRF via
header `X-CSRF-Token` para mutações autenticadas.
**Configuração:** local/dev usa `COOKIE_SAME_SITE=lax` e `COOKIE_SECURE=false`.
Teste cross-site (ex: Vercel + Render) usa `COOKIE_SAME_SITE=none` e
`COOKIE_SECURE=true`. Produção same-site pode usar `COOKIE_SAME_SITE=lax` e
`COOKIE_SECURE=true`.

### 6. Sessão JWT com expiração de 8h
**Decisão:** configurar `expiresIn: '8h'` no JWT e `maxAge` de 8h no cookie.
**Motivo:** a validade precisa existir no token validado pelo backend, não apenas
no armazenamento do navegador. Isso evita reaproveitamento indefinido de tokens
copiados fora do cookie.

### 7. `UserRole` em enum Prisma + `RolesGuard` desacoplado do `JwtAuthGuard`
**Decisão:** enum no Prisma, decorator `@Roles()`, `RolesGuard` separado.
**Motivo:** separação permite combinar JWT opcional + role obrigatória em qualquer
combinação (ex: rota pública com role, rota autenticada sem role, admin-only).

### 8. Response DTO em vez de expor entidade do Prisma
**Decisão:** toda resposta da API passa por DTO com `@ApiProperty`, construtor e
mapper helper (`toUserResponseDto`, `toActionResponseDto`).
**Motivo:** evita expor campos internos; mantém contrato explícito; facilita
versionamento, Swagger e evolução independente do schema do banco.

### 9. `PointEvent` como fonte única de verdade (sem tabela de redemption separada)
**Decisão:** usar `PointEvent` (`userId + actionId + source = ACTION_REDEEM`)
como trava de duplicidade, sem criar tabela `ActionRedemption`.
**Motivo:** `PointEvent` já tem `userId` e `actionId`; adicionar tabela extra
seria redundante. `PointEvent` cumpre dois papéis: histórico e controle de duplicidade.

### 10. `points` vs `xp` separados
**Decisão:** `points` é exclusivamente moeda gastável da lojinha; `xp` é
exclusivamente progresso competitivo para ranking e nível.
**Motivo:** separar moeda de competição evita que compras, débitos ou estornos da
lojinha distorçam o ranking. Actions incrementam `points` e `xp`; rewards debitam
apenas `points`; cancelamentos de rewards devolvem apenas `points` e `stock`.

### 11. Resgate self-service com confirmação de entrega
**Decisão:** participante resgata sozinho no app; staff da lojinha marca como entregue.
**Motivo:** evita fila e gargalo operacional, mas mantém controle de retirada física.
Cancelamento reverte `points` e `stock`, sem alterar `xp`.
**Modelo (a implementar):** `RewardRedemption` com `status: PENDING | DELIVERED | CANCELLED`.

### 12. Códigos de resgate: reutilizáveis + uso único
**Decisão:** dois mecanismos diferentes.
- **Código reutilizável:** campo `code` opcional na `Action` (ex: `DIA1`). Vários
  usuários usam o mesmo código, proteção por `PointEvent` (um por usuário).
- **Código uso único:** tabela `ClaimCode` (a implementar) com `code` único,
  vinculado a uma `Action`, marcado como `isUsed` após uso. Geração em lote
  pré-evento com opção de gerar na hora. Formato: 8 caracteres alfanuméricos
  maiúsculos aleatórios (ex: `K7XM-9N2P`), sem padrão sequencial.
**Motivo:** reutilizável resolve check-in/stands; uso único resolve perguntas/dinâmicas.

### 13. `level` (nível) sem cálculo automático ainda
**Decisão:** campo existe (`default: 1`) mas thresholds serão definidos depois.
**Motivo:** calibrar com dados reais do evento. O `xp` já está sendo acumulado
desde o início, então quando a regra for definida, o nível será recalculável.

### 14. Deploy depois do frontend testável
**Decisão:** backend e frontend sobem juntos (ou em sequência próxima), não agora.
**Motivo:** frontend ainda não consome a API; subir backend antes não gera valor
de teste real. Esperar o frontend ter ao menos login + home + resgate.

### 15. Sem repository pattern (ainda)
**Decisão:** services chamam `PrismaService` diretamente.
**Motivo:** módulos pequenos e coesos; repository seria abstração prematura.
Revisar quando um módulo crescer ou precisar de mais testabilidade.

### 16. Sem mensageria (RabbitMQ / filas)
**Decisão:** não usar filas ou mensageria.
**Motivo:** sistema síncrono, volume baixo (centenas de participantes, 4 dias),
operações atômicas via transação Prisma. RabbitMQ adicionaria complexidade,
custo operacional e ponto de falha sem benefício real.

### 17. Mensagens de erro em português
**Decisão:** todas as exceções HTTP usam mensagens em português.
**Motivo:** público-alvo brasileiro; evento nacional; melhora debugging e UX.

### 18. Lint sem `--fix` no CI
**Decisão:** criar script `lint:check` (sem `--fix`) para CI; `lint` com `--fix` para dev.
**Motivo:** CI não deve modificar arquivos. Lint local corrige; CI reporta.

### 19. CI: Prisma generate antes do lint do backend
**Decisão:** ordem fixa: install → prisma generate → lint → build.
**Motivo:** lint do backend depende dos tipos gerados pelo Prisma Client.
Rodar generate antes evita falsos erros de tipo (`no-unsafe-member-access` etc.).

### 20. CI usa envs dummy para Prisma generate
**Decisão:** injetar variáveis `DB_*` fake no workflow.
**Motivo:** `prisma generate` não precisa de banco real, mas o `prisma.config.ts`
exige as variáveis para montar a URL. Envs dummy são prática comum e segura.

### 21. Swagger aberto em todos os ambientes (MVP)
**Decisão:** `/docs` sem restrição de ambiente.
**Motivo:** facilita desenvolvimento e integração com frontend.
**Ação pendente:** gatar ou desabilitar em produção.

### 22. Seed idempotente com TypeScript
**Decisão:** seed usa `upsert` para usuários (por email) e busca por `name + type`
para ações, evitando duplicação ao rodar múltiplas vezes.
**Motivo:** `prisma db seed` repetível sem efeitos colaterais. TypeScript mantém
consistência com o resto do backend.

### 23. Docker Compose referenciando `.env` (sem hardcode)
**Decisão:** `docker-compose.yml` usa `${VAR}` do `.env` raiz.
**Motivo:** credenciais não versionadas; `.env.example` documenta as variáveis;
cada ambiente tem seu `.env` real (ignorado pelo git).

### 24. `.gitignore` centralizado na raiz
**Decisão:** um único `.gitignore` robusto; removido o do `apps/api`.
**Motivo:** mais simples de manter; evita duplicação; cobre node_modules, .turbo,
dist, .next, .env, logs, arquivos de sistema.
**Mantido:** `apps/web/.gitignore` padrão do Next.js.

### 25. `AdminModule` híbrido
**Decisão:** rotas admin de CRUD simples (criar action, listar usuários) ficam
nos módulos de domínio. Dashboard, métricas e operações cross-domain
(gerar claim codes, gerenciar entregas da lojinha) vão para um `AdminModule` separado.
**Motivo:** operações de CRUD pertencem naturalmente ao domínio (criar uma action
está em `ActionsModule`). Mas o dashboard agrega dados de múltiplos módulos
(usuários, point events, actions, rewards) e não pertence a nenhum deles.
Centralizar no `AdminModule` evita acoplamento cruzado e mantém os módulos de
domínio coesos, sem forçar dependências desnecessárias entre eles.

### 26. Frontend: dependências iniciais enxutas
**Decisão:** instalar no início apenas as bibliotecas necessárias para o primeiro
fluxo real: `shadcn/ui`, `lucide-react`, `react-hook-form`, `zod`,
`@hookform/resolvers`, `@tanstack/react-query` e `sonner`.
**Motivo:** shadcn/ui acelera UI com componentes acessíveis; react-query gerencia cache e
loading states; react-hook-form + zod reduz boilerplate de formulários e mantém validação
consistente com o backend; sonner resolve feedbacks de sucesso/erro; lucide-react cobre
ícones. `recharts`, `nuqs` e `date-fns` ficam como opcionais para instalar apenas quando
houver necessidade concreta.

### 27. Autenticação no frontend via Next.js Middleware/Proxy
**Decisão:** usar Next.js Middleware/Proxy para redirecionamento e proteção visual
de rotas, em vez de depender apenas de verificação no cliente (useEffect).
**Motivo:** Middleware roda antes do React, sem flash de conteúdo não autorizado,
mais rápido e padrão Next.js atual. Lê cookie `access_token`, redireciona para
`/login` se ausente. Página `/login` é pública, todas as outras são protegidas.
Essa é uma checagem otimista baseada no cookie; a autorização definitiva continua
no backend com `JwtAuthGuard` e `RolesGuard`.

---

## Frontend — estado atual e planejado

### Stack de bibliotecas

| lib | uso |
|-----|-----|
| shadcn/ui | padrão de composição e componentes base versionados no app |
| react-hook-form + zod | formulários com validação |
| @hookform/resolvers | integração entre react-hook-form e zod |
| @tanstack/react-query | chamadas à API, cache, loading/error states |
| lucide-react | ícones (já incluso no shadcn/ui) |
| sonner | toasts de feedback (resgate concluído, erro) |
| date-fns | opcional; formatação de datas quando houver histórico/feed |
| recharts | opcional; gráficos quando houver dashboard visual |
| nuqs | opcional; filtros via URL quando forem necessários |

### Estrutura de páginas

| rota | acesso | descrição |
|------|--------|-----------|
| `/login` | público | formulário CPF + email em dark mode arcade tech |
| `/cadastro` | público | cadastro com nome, CPF e email; faz login automático após sucesso |
| `/home` | autenticado | central do participante com nome, nível, XP, pontos e atalhos |
| `/ranking` | autenticado | leaderboard geral por XP |
| `/lojinha` | autenticado | catálogo e resgate de recompensas (a implementar) |
| `/admin` | `ADMIN` | formulário administrativo mínimo para criar actions com código |

### Layout da Home

- visual dark mode arcade tech, com atmosfera de placar/competição
- bloco principal com identidade do participante e botão de resgate de código
- cards de status: `PTS` como moeda da loja, `XP` como ranking e `LVL` como nível
- barra de progresso do nível atual
- atalhos para Ranking e Lojinha ainda desabilitados até os módulos existirem

### Decisões de sessão no frontend

- Chamadas à API usam `credentials: "include"` para enviar o cookie httpOnly.
- `POST /auth/login` salva `csrfToken` em memória no frontend.
- Após refresh, `/home` chama `GET /auth/csrf` para reidratar o CSRF da sessão.
- `AUTH_PROXY_ENABLED=false` deve ser usado no frontend quando API e web estiverem
  em domínios diferentes, como Vercel + Render, porque o Proxy do Next não enxerga
  cookie host-only da API nesse cenário.
- Em produção same-site, `AUTH_PROXY_ENABLED=true` mantém a proteção visual por Proxy.

---

## Próximos passos (ordem de implementação)

| ordem | feature | status |
|-------|---------|--------|
| 1 | User + Auth + JWT (cookie httpOnly) | ✅ |
| 2 | Actions + PointEvent | ✅ |
| 3 | Action redeem | ✅ |
| 4 | Swagger + mensagens HTTP | ✅ |
| 5 | CI (GitHub Actions) | ✅ |
| 6 | **Migrar auth para cookie httpOnly** | ✅ |
| 7 | **Frontend mínimo: login + cadastro + home + sessão** | ✅ |
| 8 | **Campo `code` na Action + resgate por código reutilizável** | ✅ |
| 9 | **Ranking geral por `User.xp`** | ✅ |
| 10 | **Ranking diário/semanal por XP ganho no período** | ❌ |
| 11 | **Rewards: modelo, catálogo, resgate, entrega** | ❌ |
| 12 | **ClaimCode: códigos de uso único** | ❌ |
| 13 | **AdminModule + admin dashboard** | ❌ |
| 14 | **Frontend: ranking + lojinha + admin dashboard** | ❌ |
| 15 | **Deploy Render + Vercel** | ❌ |
| 16 | QR codes | ❌ (futuro) |
| 17 | Cálculo de nível (level) | ❌ (futuro) |

---

## Comandos úteis

```bash
# ambiente
npm run db:up              # sobe PostgreSQL (Docker)
npm run db:down            # desce PostgreSQL
npm run db:logs            # logs do banco
npm run dev                # sobe front + back (Turbo)

# prisma
npm --workspace api run prisma:generate    # gerar Prisma Client
npm --workspace api run prisma:migrate     # criar migration
npm --workspace api run prisma:seed        # popular banco
npm --workspace api run prisma:studio      # interface visual
npx prisma db seed                         # atalho via CLI

# backend
npm --workspace api run build              # compilar NestJS
npm --workspace api run lint:check         # lint sem autofix (CI)
npm --workspace api run lint               # lint com autofix (dev)

# frontend
npm --workspace web run build              # compilar Next.js
npm --workspace web run lint               # lint
```
