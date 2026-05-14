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

`POST /auth/login` retorna `{ user }` e **seta cookie httpOnly** com o JWT.
Não retorna token no body.

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
| `POST` | `/actions/:id/redeem` | autenticado | resgatar ação (ganhar pontos) |

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

---

## Autenticação e autorização

### Fluxo de login
1. participante envia CPF + email
2. sistema valida credenciais
3. gera JWT assinado com `JWT_SECRET`
4. seta cookie `access_token` (httpOnly, secure em prod, sameSite lax, 8h)
5. retorna dados do usuário no body

### `Points` vs `XP`
- `points` = moeda gastável (lojinha)
- `xp` = progresso total acumulativo (ranking, nunca diminui)

Ambos são incrementados juntos no resgate de action. Apenas `points` é debitado
no resgate de reward.

### Resgate de action — regras
1. usuário autenticado chama `POST /actions/:id/redeem`
2. sistema valida ação existe, está ativa
3. verifica se já existe `PointEvent` (`CREDIT`, `ACTION_REDEEM`) do mesmo usuário para a mesma ação
4. se sim → `409 Conflict`
5. se não → cria `PointEvent`, incrementa `points` e `xp` no `User` (em transação)
6. retorna saldo atualizado

### Guards
- `JwtAuthGuard`: extrai e valida o JWT (do cookie httpOnly no runtime)
- `RolesGuard`: verifica se o usuário tem a role exigida (`@Roles(UserRole.ADMIN)`)

Rotas sem `@Roles()` são acessíveis por qualquer usuário autenticado.

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
via `ExtractJwt.fromExtractors`, `secure: true` em produção, `sameSite: 'lax'`.

### 6. JWT sem expiração definida (MVP)
**Decisão:** não configurar `expiresIn` ainda.
**Motivo:** MVP inicial, sem decisão de tempo de sessão do evento.
**Ação pendente:** definir `expiresIn` (ex: 8h) e renovação antes do evento real.

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
**Decisão:** dois campos independentes com propósitos diferentes.
**Motivo:** `xp` é acumulativo (ranking, nunca diminui); `points` é moeda (gastável
na lojinha). Ambos são incrementados juntos no resgate de action; apenas `points`
é debitado no resgate de reward.

### 11. Resgate self-service com confirmação de entrega
**Decisão:** participante resgata sozinho no app; staff da lojinha marca como entregue.
**Motivo:** evita fila e gargalo operacional, mas mantém controle de retirada física.
Cancelamento reverte pontos e estoque.
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

---

## Próximos passos (ordem de implementação)

| ordem | feature | status |
|-------|---------|--------|
| 1 | User + Auth + JWT (cookie httpOnly) | ✅ |
| 2 | Actions + PointEvent | ✅ |
| 3 | Action redeem | ✅ |
| 4 | Swagger + mensagens HTTP | ✅ |
| 5 | CI (GitHub Actions) | ✅ |
| 6 | **Migrar auth para cookie httpOnly** | ❌ |
| 7 | **Ranking (diário + semanal + geral)** | ❌ |
| 8 | **Rewards: modelo, catálogo, resgate, entrega** | ❌ |
| 9 | **ClaimCode: códigos de uso único** | ❌ |
| 10 | **AdminModule + admin dashboard** | ❌ |
| 11 | **Campo `code` na Action (código reutilizável)** | ❌ |
| 12 | **Frontend: login + home + ranking + lojinha** | ❌ |
| 13 | **Frontend: admin dashboard** | ❌ |
| 14 | **Deploy Render + Vercel** | ❌ |
| 15 | QR codes | ❌ (futuro) |
| 16 | Cálculo de nível (level) | ❌ (futuro) |

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
