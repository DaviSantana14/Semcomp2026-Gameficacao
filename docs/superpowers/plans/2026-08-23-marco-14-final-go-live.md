# Marco 14 — Plano de implementação e go-live

> **Para Codex:** SUB-SKILL OBRIGATÓRIA: use `executing-plans` para executar este plano tarefa por tarefa, parando nos checkpoints operacionais indicados.

**Objetivo:** publicar a gamificação da SEMCOMP em `https://gameficacao.semcomp.com.br` até 24 de agosto de 2026 às 12h, em produção direta na AWS, com HTTPS, rollback por digest e backup restaurável.

**Arquitetura:** uma stack de produção em `sa-east-1` provisiona VPC pública, Elastic IP, uma EC2 `m7i-flex.large`, EBS `gp3` criptografado, S3, ECR, IAM/SSM e AWS Budget. A EC2 executa PostgreSQL 16, NestJS, Next.js, Nginx e Certbot por Docker Compose. O Nginx começa em manutenção, atende o challenge HTTP-01, e só publica a aplicação após DNS, certificado, smoke e restauração de backup passarem.

**Stack técnica:** CloudFormation, EC2, EBS, EIP, ECR, S3, SSM Parameter Store/Session Manager, AWS Budgets, Docker Compose, PostgreSQL 16, NestJS 11, Prisma 7.8, Next.js 16, Nginx 1.28 e Certbot.

## Restrições globais

- Trabalhar na branch atual `feat/continue`; não criar worktree porque o prazo é imediato e a especificação já foi aprovada.
- Preservar todos os artefatos de ensaio em `deploy/aws/`; produção fica isolada em `deploy/aws/production/`.
- Não criar staging, ALB, ACM, RDS, NAT Gateway, Redis, WAF, Spot ou segunda EC2.
- Não executar teste de carga hospedado. O gate é teste local completo mais smoke de produção de 20–30 minutos.
- Não inserir participante sintético em produção. Apenas o administrador inicial e a conta real do organizador designado entram no smoke.
- Nunca passar senha, JWT secret, cookie, hash ou token por argumento de processo, CloudFormation parameter em claro, Git, log ou relatório.
- Não executar mutação AWS até confirmar, no mesmo terminal, conta de 12 dígitos e região `sa-east-1`.
- Não pedir o DNS até o output `ProductionElasticIp` existir.
- Não retirar a manutenção enquanto todos os itens críticos do smoke e da restauração não passarem.
- Cada tarefa de código segue teste vermelho, implementação mínima, teste verde e commit próprio.

---

### Tarefa 1: Unificar duração de sessão, JWT e cookie por papel

**Arquivos:**

- Criar: `apps/api/src/common/session-duration.ts`
- Alterar: `apps/api/src/presence/sessions.service.ts`
- Alterar: `apps/api/src/auth/auth.service.ts`
- Alterar: `apps/api/src/auth/cookie-options.ts`
- Alterar: `apps/api/src/auth/auth.controller.ts`
- Alterar: `apps/api/src/presence/specs/sessions.service.spec.ts`
- Alterar: `apps/api/src/auth/specs/auth.service.spec.ts`
- Alterar: `apps/api/src/auth/specs/cookie-options.spec.ts`
- Alterar: `apps/api/src/auth/specs/auth.controller.spec.ts`

- [ ] **1.1 Escrever primeiro os testes de duração por papel.**

  Em `sessions.service.spec.ts`, substituir o caso único por casos explícitos:

  ```ts
  it.each([
    ['PARTICIPANT', 8 * 60 * 60 * 1000],
    ['ADMIN', 4 * 60 * 60 * 1000],
  ] as const)('creates a %s draft with the configured expiry', (role, duration) => {
    const draft = createSessionDraft(now, role);
    expect(draft.expiresAt.getTime()).toBe(now.getTime() + duration);
  });
  ```

  Em `auth.service.spec.ts`, exigir `expiresIn: '4h'` no login administrativo e `expiresIn: '8h'` no cadastro/login de participante. Exigir também que o draft administrativo expire em quatro horas, com tolerância inferior a cinco segundos entre os relógios capturados pelo teste.

  Em `cookie-options.spec.ts`, exigir `maxAge` de oito horas para `PARTICIPANT` e quatro horas para `ADMIN`. Em `auth.controller.spec.ts`, exigir quatro horas no cookie de `adminLogin` e oito horas nos cookies de `register` e `login`.

- [ ] **1.2 Rodar os testes focados e confirmar a falha esperada.**

  ```powershell
  npm --workspace api test -- --runTestsByPath src/presence/specs/sessions.service.spec.ts src/auth/specs/auth.service.spec.ts src/auth/specs/cookie-options.spec.ts src/auth/specs/auth.controller.spec.ts
  ```

  Esperado: falhas de assinatura em `createSessionDraft`/`getAuthCookieOptions` e expectativas administrativas ainda recebendo oito horas.

- [ ] **1.3 Criar o contrato único de duração.**

  `apps/api/src/common/session-duration.ts` deve exportar exatamente:

  ```ts
  export type SessionRole = 'PARTICIPANT' | 'ADMIN';

  export const SESSION_DURATION_MS: Readonly<Record<SessionRole, number>> = {
    PARTICIPANT: 8 * 60 * 60 * 1000,
    ADMIN: 4 * 60 * 60 * 1000,
  };

  export const SESSION_JWT_TTL: Readonly<Record<SessionRole, '8h' | '4h'>> = {
    PARTICIPANT: '8h',
    ADMIN: '4h',
  };
  ```

  Alterar as interfaces para que:

  - `createSessionDraft(now, role)` use `SESSION_DURATION_MS[role]`;
  - cadastro passe explicitamente `PARTICIPANT`;
  - login passe o papel para o draft e `issueTokens` use `user.role` em `SESSION_JWT_TTL`;
  - `getAuthCookieOptions(httpOnly, role)` use a mesma tabela;
  - os três endpoints passem `user.role` ao criar o cookie.

  Não manter constantes duplicadas em `auth`, `presence` ou controller.

- [ ] **1.4 Rodar testes focados, suíte da API e typecheck/build.**

  ```powershell
  npm --workspace api test -- --runTestsByPath src/presence/specs/sessions.service.spec.ts src/auth/specs/auth.service.spec.ts src/auth/specs/cookie-options.spec.ts src/auth/specs/auth.controller.spec.ts
  npm --workspace api test
  npm --workspace api run build
  ```

  Esperado: todos os testes passam e o build termina sem erro TypeScript.

- [ ] **1.5 Commitar o contrato de sessão.**

  ```powershell
  git add apps/api/src/common/session-duration.ts apps/api/src/presence/sessions.service.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/cookie-options.ts apps/api/src/auth/auth.controller.ts apps/api/src/presence/specs/sessions.service.spec.ts apps/api/src/auth/specs/auth.service.spec.ts apps/api/src/auth/specs/cookie-options.spec.ts apps/api/src/auth/specs/auth.controller.spec.ts
  git commit -m "feat: enforce role-aware session lifetimes"
  ```

---

### Tarefa 2: Criar os artefatos Docker e Nginx exclusivos de produção

**Arquivos:**

- Criar: `deploy/aws/production/compose.yml`
- Criar: `deploy/aws/production/production.env.example`
- Criar: `deploy/aws/production/nginx-maintenance.conf`
- Criar: `deploy/aws/production/nginx-report-only.conf`
- Criar: `deploy/aws/production/nginx-production.conf`
- Criar: `deploy/aws/production/artifacts.test.mjs`

- [ ] **2.1 Escrever testes de contrato dos artefatos antes dos arquivos.**

  `artifacts.test.mjs` deve ler os quatro artefatos e validar com `node:test`:

  - imagens de API e web são obrigatórias via `API_IMAGE` e `WEB_IMAGE`, sem `build:` e sem tag móvel;
  - PostgreSQL usa `postgres:16-alpine`, volume nomeado e apenas a rede interna `backend`;
  - somente Nginx publica `80:80` e `443:443`;
  - portas `22`, `3000`, `3001` e `5432` não aparecem em `ports:`;
  - Nginx, API e web mantêm filesystem somente-leitura e `no-new-privileges`;
  - manutenção atende `/nginx-health` e `/.well-known/acme-challenge/`, retornando 503 para o restante;
  - report-only emite `Content-Security-Policy-Report-Only` e não emite CSP de enforcement;
  - produção emite `Content-Security-Policy`, HSTS e `Permissions-Policy` com `camera=(self)`;
  - HTTP final preserva ACME e redireciona o restante para HTTPS;
  - CSP não contém `unsafe-eval`;
  - Swagger, cookie seguro, URL final e `/api` constam no env de exemplo.

- [ ] **2.2 Rodar o teste e confirmar que falha por arquivos ausentes.**

  ```powershell
  node --test deploy/aws/production/artifacts.test.mjs
  ```

  Esperado: `ENOENT` para o primeiro artefato de produção ainda inexistente.

- [ ] **2.3 Implementar `compose.yml`.**

  Definir os serviços `postgres`, `migrate`, `seed`, `api`, `web`, `nginx` e `certbot` com estes contratos:

  - `api`, `migrate` e `seed`: `image: ${API_IMAGE:?API_IMAGE is required}`;
  - `web`: `image: ${WEB_IMAGE:?WEB_IMAGE is required}`;
  - `nginx`: `nginx:1.28-alpine`, bind mount somente-leitura de `${NGINX_CONFIG_FILE:?NGINX_CONFIG_FILE is required}` e volumes nomeados `certbot_etc`/`certbot_webroot`;
  - `certbot`: `certbot/certbot:v4.2.0`, perfil `operations`, com os mesmos volumes;
  - `postgres_data`, `certbot_etc` e `certbot_webroot` persistentes;
  - redes `backend` interna e `edge`;
  - healthchecks de PostgreSQL, API, web e Nginx;
  - `NEXT_PUBLIC_API_URL=/api` é somente build-time da imagem web, não um valor mutável no container;
  - `NODE_ENV=production`, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax`, `SWAGGER_ENABLED=false`.

- [ ] **2.4 Implementar os três estados do Nginx.**

  Reusar upstreams e limites já ensaiados, corrigindo o bloqueio atual da câmera. A política CSP compartilhada entre report-only e enforcement deve ser:

  ```text
  default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; manifest-src 'self'
  ```

  Configurações report-only e production devem incluir:

  - TLS 1.2 e 1.3;
  - certificado em `/etc/letsencrypt/live/gameficacao.semcomp.com.br/fullchain.pem`;
  - chave em `/etc/letsencrypt/live/gameficacao.semcomp.com.br/privkey.pem`;
  - HSTS `max-age=31536000; includeSubDomains`, sem `preload`;
  - `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin` e `Permissions-Policy geolocation=(), microphone=(), camera=(self)`;
  - `proxy_set_header X-Forwarded-For $remote_addr` para impedir spoofing da cadeia recebida;
  - `/api/` para `api:3001/` e `/` para `web:3000`.

- [ ] **2.5 Validar testes e resolução do Compose.**

  ```powershell
  node --test deploy/aws/production/artifacts.test.mjs
  docker compose --env-file deploy/aws/production/production.env.example -f deploy/aws/production/compose.yml config --quiet
  ```

  Esperado: teste verde e Compose válido sem interpolação ausente.

- [ ] **2.6 Commitar os artefatos de runtime.**

  ```powershell
  git add deploy/aws/production/compose.yml deploy/aws/production/production.env.example deploy/aws/production/nginx-maintenance.conf deploy/aws/production/nginx-report-only.conf deploy/aws/production/nginx-production.conf deploy/aws/production/artifacts.test.mjs
  git commit -m "feat: add production runtime and edge configs"
  ```

---

### Tarefa 3: Provisionar a stack de produção com IP estável e custo controlado

**Arquivos:**

- Criar: `deploy/aws/production/cloudformation.yml`
- Criar: `deploy/aws/production/cloudformation.test.mjs`

- [ ] **3.1 Escrever os testes de infraestrutura primeiro.**

  Os testes devem exigir:

  - `InstanceType` default e único permitido `m7i-flex.large`;
  - SG com ingress público apenas TCP 80 e 443, sem regra 22;
  - `AWS::EC2::EIP` e `AWS::EC2::EIPAssociation`;
  - output `ProductionElasticIp` usando o EIP;
  - metadata IMDSv2 obrigatória;
  - volume de dados `gp3`, criptografado e com `DeletionPolicy: Snapshot`/`UpdateReplacePolicy: Snapshot`;
  - S3 privado, criptografado, versionado, com `DeletionPolicy: Retain`;
  - ECR de API e web com mutabilidade `IMMUTABLE` e scan no push;
  - IAM com `AmazonSSMManagedInstanceCore`, leitura limitada a `/semcomp/production/*`, pull do ECR e acesso somente aos prefixos `backups/*` e `releases/*` do bucket;
  - budget mensal de US$ 80 e notificações ACTUAL em 50%, 75% e 90%;
  - ausência de ALB, RDS, NAT Gateway, Redis/ElastiCache e segunda EC2.

- [ ] **3.2 Rodar o teste vermelho.**

  ```powershell
  node --test deploy/aws/production/cloudformation.test.mjs
  ```

  Esperado: falha porque `cloudformation.yml` ainda não existe.

- [ ] **3.3 Implementar o template.**

  Criar VPC `10.91.0.0/16`, subnet pública `10.91.0.0/24`, Internet Gateway, route table, SG, EIP, EC2, volume de dados de 50 GiB, bucket, dois repositórios ECR, role/profile IAM e budget.

  O `UserData` deve:

  1. montar o volume de dados em `/var/lib/docker` por UUID no `/etc/fstab` antes de iniciar Docker;
  2. instalar Docker Engine/Compose pelo repositório oficial;
  3. habilitar SSM Agent;
  4. criar `/opt/semcomp/releases`, `/opt/semcomp/shared` e `/opt/semcomp/shared/nginx` com grupo `docker` e permissões restritas;
  5. instalar timers `semcomp-certbot-renew.timer` e `semcomp-backup.timer`, inicialmente desabilitados até o primeiro deploy criar os scripts atuais.

  Outputs obrigatórios:

  - `InstanceId`
  - `ProductionElasticIp`
  - `BackupBucketName`
  - `ApiRepositoryUri`
  - `WebRepositoryUri`

- [ ] **3.4 Rodar os testes e validação local de sintaxe.**

  ```powershell
  node --test deploy/aws/production/cloudformation.test.mjs
  aws cloudformation validate-template --template-body file://deploy/aws/production/cloudformation.yml --region sa-east-1
  ```

  Esperado: testes verdes e `validate-template` retorna a descrição/parâmetros sem erro. Esta chamada é somente leitura e não cria recursos.

- [ ] **3.5 Commitar a infraestrutura.**

  ```powershell
  git add deploy/aws/production/cloudformation.yml deploy/aws/production/cloudformation.test.mjs
  git commit -m "feat: provision marco 14 production stack"
  ```

---

### Tarefa 4: Configurar parâmetros e publicar imagens imutáveis

**Arquivos:**

- Criar: `deploy/aws/production/scripts/configure-parameters.ps1`
- Criar: `deploy/aws/production/scripts/publish.ps1`
- Criar: `deploy/aws/production/scripts/deploy-release.sh`
- Criar: `deploy/aws/production/scripts/rollback-release.sh`
- Criar: `deploy/aws/production/scripts/set-admin-password.sh`
- Criar: `deploy/aws/production/scripts/release-scripts.test.sh`

- [ ] **4.1 Escrever testes de segurança e release.**

  O teste Bash deve usar executáveis fake de `aws`, `docker` e `curl`, como a suíte de ensaio, e provar:

  - região diferente de `sa-east-1` e conta diferente da esperada falham antes de qualquer mutação;
  - parâmetros ficam em `/semcomp/production/`;
  - `POSTGRES_PASSWORD`, `JWT_SECRET` e `RATE_LIMIT_KEY_SECRET` são `SecureString` novos;
  - `FRONTEND_URL=https://gameficacao.semcomp.com.br`, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax`, `NODE_ENV=production`, `SWAGGER_ENABLED=false`;
  - não existe parâmetro de senha administrativa;
  - publicação exige worktree limpo e SHA completo;
  - API e web são construídas localmente, enviadas ao ECR pela tag do SHA e resolvidas para `repository@sha256:digest`;
  - o manifesto S3 contém SHA e dois digests, mas nenhum secret;
  - deploy rejeita tag sem digest, lê apenas o prefixo de produção, grava env `0600`, executa `prisma migrate deploy` e faz health check local;
  - falha antes do health não troca o link `current` e reinicia o manifesto anterior;
  - rollback aceita somente um manifesto já publicado no bucket da stack;
  - senha administrativa é lida por stdin e encaminhada por stdin ao container, nunca por variável ou argumento.

- [ ] **4.2 Rodar o teste vermelho.**

  ```powershell
  bash deploy/aws/production/scripts/release-scripts.test.sh
  ```

  Esperado: falha informando os scripts ausentes.

- [ ] **4.3 Implementar configuração de parâmetros.**

  `configure-parameters.ps1` deve receber `ExpectedAccountId`, `Region` e `StackName`, validar `sts get-caller-identity`, exigir `SEED_ADMIN_NAME`, `SEED_ADMIN_CPF` e `SEED_ADMIN_EMAIL` no ambiente do operador e gerar os três secrets com RNG criptográfico.

  Valores não secretos exatos:

  ```text
  POSTGRES_DB=semcomp_production
  POSTGRES_USER=semcomp_production
  POSTGRES_SCHEMA=public
  FRONTEND_URL=https://gameficacao.semcomp.com.br
  COOKIE_SAME_SITE=lax
  COOKIE_SECURE=true
  NODE_ENV=production
  SWAGGER_ENABLED=false
  SEED_MODE=admin-only
  COMPOSE_PROJECT_NAME=semcomp-production
  ```

- [ ] **4.4 Implementar publicação por digest.**

  `publish.ps1` deve:

  1. exigir worktree limpo e capturar `git rev-parse HEAD`;
  2. ler `ApiRepositoryUri`, `WebRepositoryUri`, `BackupBucketName` e `InstanceId` da stack;
  3. autenticar Docker no ECR sem imprimir senha;
  4. construir API e web localmente, usando `NEXT_PUBLIC_API_URL=/api`;
  5. executar testes rápidos dos containers (`bcrypt` na API e health do build web);
  6. enviar tags iguais ao SHA completo;
  7. consultar os dois `imageDigest` no ECR;
  8. criar manifesto JSON sem secrets em `releases/$sha/manifest.json` com o
     nome do bucket e referências `repository@sha256:digest`;
  9. enviar pelo SSM um comando que baixa o commit archive e manifesto e chama `deploy-release.sh`.

  `deploy-release.sh` deve usar apenas as referências do manifesto; não pode conter `docker compose build` nem `--build`.
  O env local `0600` criado no host deve receber `BACKUP_BUCKET` do manifesto e
  `NGINX_CONFIG_FILE=/opt/semcomp/shared/nginx/active.conf`; esses dois valores
  não são armazenados no Parameter Store.
  Depois do primeiro deploy saudável, deve habilitar e iniciar
  `semcomp-certbot-renew.timer` e `semcomp-backup.timer`; ambos precisam apontar
  para scripts sob `/opt/semcomp/current` para acompanhar a troca atômica de
  release.

- [ ] **4.5 Implementar rollback e senha administrativa.**

  `rollback-release.sh` recebe `RELEASE_SHA`, baixa o manifesto correspondente, valida SHA/digests, cria backup pré-rollback, executa `docker compose up -d` com as imagens anteriores e só troca `current` após `/api/health` passar.

  `set-admin-password.sh` deve executar o utilitário já existente dentro da imagem da API com `docker compose run --rm --no-deps -T api`, lendo a senha protegida de stdin. Exigir `DEPLOY_ENV=production`, HTTPS já ativo e confirmação literal `semcomp-production`.

- [ ] **4.6 Rodar testes de scripts e sintaxe.**

  ```powershell
  bash -n deploy/aws/production/scripts/*.sh
  bash deploy/aws/production/scripts/release-scripts.test.sh
  ```

  Esperado: sintaxe e mocks passam; nenhum teste acessa AWS real.

- [ ] **4.7 Commitar a trilha imutável.**

  ```powershell
  git add deploy/aws/production/scripts/configure-parameters.ps1 deploy/aws/production/scripts/publish.ps1 deploy/aws/production/scripts/deploy-release.sh deploy/aws/production/scripts/rollback-release.sh deploy/aws/production/scripts/set-admin-password.sh deploy/aws/production/scripts/release-scripts.test.sh
  git commit -m "feat: publish production releases by digest"
  ```

---

### Tarefa 5: Automatizar manutenção, certificado e renovação

**Arquivos:**

- Criar: `deploy/aws/production/scripts/request-certificate.sh`
- Criar: `deploy/aws/production/scripts/activate-edge.sh`
- Criar: `deploy/aws/production/scripts/renew-certificate.sh`
- Criar: `deploy/aws/production/scripts/edge-scripts.test.sh`

- [ ] **5.1 Escrever testes dos estados do edge.**

  Com mocks de DNS, Docker e curl, exigir:

  - emissão falha antes de `gameficacao.semcomp.com.br` resolver exatamente para `ProductionElasticIp`;
  - Certbot recebe `certonly --webroot -w /var/www/certbot -d gameficacao.semcomp.com.br --cert-name gameficacao.semcomp.com.br -n --agree-tos --no-eff-email`;
  - email ACME é obrigatório e validado, mas não aparece no log de sucesso;
  - ativação report-only só ocorre quando os arquivos de certificado existem e `nginx -t` passa;
  - enforcement só ocorre com confirmação `SEMCOMP_CSP_ENFORCEMENT=approved` e novo `nginx -t`;
  - renovação executa `certbot renew`, valida Nginx e recarrega sem derrubar containers;
  - `renew-certificate.sh --dry-run` encaminha `renew --dry-run`.

- [ ] **5.2 Rodar o teste vermelho.**

  ```powershell
  bash deploy/aws/production/scripts/edge-scripts.test.sh
  ```

  Esperado: falha por scripts ausentes.

- [ ] **5.3 Implementar os scripts.**

  `request-certificate.sh` deve manter `nginx-maintenance.conf` ativo, comparar `dig +short A` com o EIP passado por ambiente e emitir por HTTP-01 usando o serviço Certbot do Compose.

  `activate-edge.sh` deve trocar atomicamente `/opt/semcomp/shared/nginx/active.conf` nesta ordem:

  1. manutenção → `nginx-report-only.conf`;
  2. recriar somente Nginx;
  3. percorrer smoke de navegador;
  4. report-only → `nginx-production.conf` após confirmação explícita;
  5. recarregar Nginx e confirmar CSP enforcement por curl.

  Nunca copiar chave privada para o release; Nginx e Certbot compartilham apenas o volume `certbot_etc`.

- [ ] **5.4 Rodar testes e sintaxe.**

  ```powershell
  bash -n deploy/aws/production/scripts/request-certificate.sh deploy/aws/production/scripts/activate-edge.sh deploy/aws/production/scripts/renew-certificate.sh
  bash deploy/aws/production/scripts/edge-scripts.test.sh
  ```

  Esperado: todos passam.

- [ ] **5.5 Commitar automação TLS.**

  ```powershell
  git add deploy/aws/production/scripts/request-certificate.sh deploy/aws/production/scripts/activate-edge.sh deploy/aws/production/scripts/renew-certificate.sh deploy/aws/production/scripts/edge-scripts.test.sh
  git commit -m "feat: automate production tls activation"
  ```

---

### Tarefa 6: Produzir backup e provar restauração isolada

**Arquivos:**

- Criar: `deploy/aws/production/backup-verify.compose.yml`
- Criar: `deploy/aws/production/scripts/backup-postgres.sh`
- Criar: `deploy/aws/production/scripts/verify-backup.sh`
- Criar: `deploy/aws/production/scripts/backup-scripts.test.sh`

- [ ] **6.1 Escrever testes de backup e restore-check.**

  Os testes devem provar:

  - backup faz `pg_dump -Fc` e publica primeiro em `backups/.staging/`, promovendo somente após sucesso;
  - falha de dump remove staging e nunca publica o destino final;
  - destino fica sob `backups/production/` e usa SSE-S3;
  - verificação rejeita bucket/key divergente e objetos staging;
  - restauração cria projeto Compose `semcomp-backup-verify-$RELEASE_SHA`, PostgreSQL descartável com `tmpfs`, sem montar `postgres_data` de produção;
  - `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges` roda no banco vazio;
  - verificação executa `prisma migrate status`, consulta contagens essenciais e encerra/remova o projeto descartável mesmo em falha;
  - nenhum comando `DROP DATABASE`, `ALTER DATABASE` ou `docker compose down -v` aponta para `semcomp-production`.

- [ ] **6.2 Rodar o teste vermelho.**

  ```powershell
  bash deploy/aws/production/scripts/backup-scripts.test.sh
  ```

  Esperado: falha por scripts/Compose ausentes.

- [ ] **6.3 Implementar backup e verificação.**

  O backup deve gerar chaves como `backups/production/semcomp-20260824T120000Z.dump`, imprimir apenas a URI final e nunca materializar o dump no disco do host.

  A verificação deve baixar para diretório `mktemp`, subir seu PostgreSQL isolado em rede própria, restaurar, validar as tabelas reais `User`, `UserSession`, `Action`, `Reward` e `ClaimCode`, registrar somente contagens agregadas e destruir apenas o projeto cujo nome foi validado contra `^semcomp-backup-verify-[0-9a-f]{40}$`.

- [ ] **6.4 Rodar testes e sintaxe.**

  ```powershell
  bash -n deploy/aws/production/scripts/backup-postgres.sh deploy/aws/production/scripts/verify-backup.sh
  bash deploy/aws/production/scripts/backup-scripts.test.sh
  docker compose -f deploy/aws/production/backup-verify.compose.yml config --quiet
  ```

  Esperado: todos passam; nenhuma chamada real à AWS nos testes.

- [ ] **6.5 Commitar backup restaurável.**

  ```powershell
  git add deploy/aws/production/backup-verify.compose.yml deploy/aws/production/scripts/backup-postgres.sh deploy/aws/production/scripts/verify-backup.sh deploy/aws/production/scripts/backup-scripts.test.sh
  git commit -m "feat: verify production backups in isolation"
  ```

---

### Tarefa 7: Criar smoke automatizado e runbook do evento

**Arquivos:**

- Criar: `deploy/aws/production/scripts/smoke-test.sh`
- Criar: `deploy/aws/production/scripts/smoke-test.test.sh`
- Criar: `docs/operations/marco-14-runbook.md`
- Criar: `docs/operations/marco-14-opening-checklist.md`
- Criar: `docs/operations/marco-14-closing-checklist.md`

- [ ] **7.1 Escrever testes do smoke antes do script.**

  Com curl/mock TLS, exigir que o script valide:

  - URL é exatamente `https://gameficacao.semcomp.com.br`;
  - DNS A é igual ao EIP esperado;
  - HTTP retorna 301/308 para HTTPS, exceto ACME;
  - certificado contém o hostname e não está expirado;
  - HSTS, CSP enforcement, framing, MIME, referrer e permissions policy existem;
  - CSP report-only já não substitui enforcement;
  - `/api/health` retorna 200 e status saudável;
  - `/api/docs` retorna 404;
  - cookies de participante têm `Secure`, `HttpOnly`, `SameSite=Lax`, `Max-Age=28800`;
  - cookies de admin têm os mesmos atributos e `Max-Age=14400`;
  - participante real faz login e heartbeat; administrador faz login e acessa o dashboard;
  - senhas são lidas com `read -s`, nunca do ambiente;
  - portas 22, 3000, 3001 e 5432 não aceitam conexão pública;
  - logs são varridos por padrões de CPF, email, bearer token, cookie e campos de senha; um achado falha o smoke sem imprimir o valor encontrado.

- [ ] **7.2 Rodar o teste vermelho.**

  ```powershell
  bash deploy/aws/production/scripts/smoke-test.test.sh
  ```

  Esperado: falha porque `smoke-test.sh` ainda não existe.

- [ ] **7.3 Implementar smoke sem criar dados descartáveis.**

  O script deve pedir interativamente CPF/email/senha do admin e email/senha da conta real do organizador. Não chamar `/auth/register`, não criar códigos, pontos, recompensas ou atividades e finalizar ambos os logins com logout.

  Separar o resultado em linhas `PASS`/`FAIL` sem valores sensíveis e sair diferente de zero no primeiro gate crítico.

- [ ] **7.4 Escrever runbook e checklists operacionais.**

  O runbook deve ter comandos exatos e decisões para:

  - DNS não propagado: manter manutenção, comparar EIP e `dig`, contatar o responsável;
  - falha TLS: manter porta 80/ACME, repetir emissão após DNS, nunca liberar HTTP puro;
  - falha de login: confirmar health, relógio, perfil/ativo e logs sanitizados;
  - falha de banco: bloquear mutações, capturar backup/estado, reiniciar PostgreSQL uma vez e restaurar somente com confirmação do responsável;
  - falha de release: executar rollback por manifesto/digest anterior;
  - lojinha/presença: congelar mutações específicas e preservar leitura;
  - disco acima de 80%: limpar apenas imagens sem referência e releases além dos dois anteriores; nunca remover volumes;
  - encerramento: manutenção, backup final, restore-check, evidências e só depois destruição autorizada.

  O checklist de abertura deve incluir teste manual em celular real da câmera traseira, permissão, leitura QR, cancelar e fallback manual. O checklist de fechamento deve registrar URI do backup, digest do release e horário.

- [ ] **7.5 Rodar testes do smoke e revisão de segredos.**

  ```powershell
  bash -n deploy/aws/production/scripts/smoke-test.sh
  bash deploy/aws/production/scripts/smoke-test.test.sh
  rg -n "password=|Bearer [A-Za-z0-9]|access_token=" deploy/aws/production docs/operations
  ```

  Esperado: testes verdes; `rg` não encontra credencial literal ou emissão de valor sensível. Nomes de variáveis como `POSTGRES_PASSWORD` são permitidos, valores reais não.

- [ ] **7.6 Commitar operação e smoke.**

  ```powershell
  git add deploy/aws/production/scripts/smoke-test.sh deploy/aws/production/scripts/smoke-test.test.sh
  git add -f docs/operations/marco-14-runbook.md docs/operations/marco-14-opening-checklist.md docs/operations/marco-14-closing-checklist.md
  git commit -m "docs: add marco 14 production runbook"
  ```

---

### Tarefa 8: Integrar todos os gates à CI e fazer revisão final local

**Arquivos:**

- Alterar: `package.json`
- Alterar: `.github/workflows/ci.yml`

- [ ] **8.1 Fazer a CI falhar enquanto produção não está conectada.**

  Adicionar temporariamente a expectativa em `release-scripts.test.sh` de que `package.json` exponha `test:production-deployment` e que `.github/workflows/ci.yml` o execute.

- [ ] **8.2 Rodar e observar a falha.**

  ```powershell
  bash deploy/aws/production/scripts/release-scripts.test.sh
  ```

  Esperado: falha indicando script npm/step CI ausente.

- [ ] **8.3 Adicionar o agregador e steps CI.**

  `package.json` deve adicionar:

  ```json
  "test:production-deployment": "node --test deploy/aws/production/cloudformation.test.mjs deploy/aws/production/artifacts.test.mjs && bash deploy/aws/production/scripts/release-scripts.test.sh && bash deploy/aws/production/scripts/edge-scripts.test.sh && bash deploy/aws/production/scripts/backup-scripts.test.sh && bash deploy/aws/production/scripts/smoke-test.test.sh"
  ```

  A CI deve executar esse script, `bash -n deploy/aws/production/scripts/*.sh`, validar o Compose de produção com `production.env.example` e construir as imagens de API/web com tag igual a `${{ github.sha }}`.

- [ ] **8.4 Rodar a verificação completa local.**

  ```powershell
  npm --workspace api run prisma:generate
  npm --workspace api run lint:check
  npm --workspace web run lint
  npm --workspace api test
  npm --workspace web test
  npm --workspace api run test:e2e
  npm run test:deployment-scripts
  npm run test:production-deployment
  npm run build
  docker compose --env-file deploy/aws/production/production.env.example -f deploy/aws/production/compose.yml config --quiet
  ```

  Esperado: todos os comandos terminam com código 0. Se o e2e exigir PostgreSQL, subir somente o banco local existente com `docker compose up -d postgres`, rodar o e2e e depois `docker compose stop postgres`; não apagar volume local.

- [ ] **8.5 Fazer self-review do diff.**

  ```powershell
  git diff --check
  git status --short
  rg -n "TODO|TBD|CHANGE_ME|example-not-a-secret" deploy/aws/production docs/operations apps/api/src/common/session-duration.ts
  rg -n "latest|:main|:master" deploy/aws/production
  ```

  Esperado: `git diff --check` limpo; nenhuma pendência ou tag móvel. O valor seguro de CI em `production.env.example` deve ser removido desta busca ou trocado por valores explicitamente nomeados `ci-only-*` que nunca sejam aceitos pelo script de produção.

- [ ] **8.6 Commitar integração CI.**

  ```powershell
  git add package.json .github/workflows/ci.yml deploy/aws/production/scripts/release-scripts.test.sh
  git commit -m "ci: gate marco 14 production artifacts"
  ```

---

### Tarefa 9: Executar o go-live controlado na AWS

**Checkpoint:** esta tarefa muta AWS, DNS e produção. Antes de cada bloco, mostrar o comando e pedir aprovação do usuário. Não combinar todos os blocos em uma única aprovação.

- [ ] **9.1 Congelar um release verificável.**

  ```powershell
  git status --short
  git rev-parse HEAD
  ```

  Esperado: worktree vazio e SHA completo. Registrar o SHA no checklist de abertura.

- [ ] **9.2 Confirmar conta e região sem mutação.**

  ```powershell
  aws sts get-caller-identity --query "{Account:Account,Arn:Arn}" --output table
  aws configure get region
  ```

  Esperado: conta deliberadamente confirmada pelo usuário e região `sa-east-1`. Se a região configurada divergir, parar; não acrescentar `--region` silenciosamente para mascarar contexto incorreto.

- [ ] **9.3 Criar a stack de produção.**

  Ler o email de orçamento sem gravá-lo no repositório e executar:

  ```powershell
  $budgetEmail = Read-Host 'Email para alertas AWS Budget'
  aws cloudformation deploy --stack-name semcomp-production --template-file deploy/aws/production/cloudformation.yml --parameter-overrides BudgetEmail=$budgetEmail --capabilities CAPABILITY_NAMED_IAM --region sa-east-1 --no-fail-on-empty-changeset
  Remove-Variable budgetEmail
  ```

  Esperado: stack `CREATE_COMPLETE`/`UPDATE_COMPLETE`.

- [ ] **9.4 Capturar outputs e só então solicitar DNS.**

  ```powershell
  $productionIp = aws cloudformation describe-stacks --stack-name semcomp-production --query "Stacks[0].Outputs[?OutputKey=='ProductionElasticIp'].OutputValue | [0]" --output text --region sa-east-1
  $productionIp
  ```

  Enviar ao DevOps exatamente:

  ```text
  Tipo: A
  Nome: gameficacao
  Valor: o IPv4 exibido pelo output ProductionElasticIp
  TTL: 300
  Não alterar semcomp.com.br nem a landing page atual.
  ```

  Manter Nginx em manutenção enquanto aguarda. Não pedir CNAME, ACM ou mudança no domínio raiz.

- [ ] **9.5 Configurar parâmetros e publicar o release.**

  Definir apenas a identidade inicial no ambiente do operador, configurar,
  limpar as variáveis e publicar:

  ```powershell
  $expectedAccountId = Read-Host 'ID de 12 dígitos da conta AWS confirmada'
  $env:SEED_ADMIN_NAME = Read-Host 'Nome do administrador inicial'
  $env:SEED_ADMIN_CPF = Read-Host 'CPF do administrador inicial'
  $env:SEED_ADMIN_EMAIL = Read-Host 'Email do administrador inicial'
  & ./deploy/aws/production/scripts/configure-parameters.ps1 -ExpectedAccountId $expectedAccountId -Region sa-east-1 -StackName semcomp-production
  Remove-Item Env:SEED_ADMIN_NAME,Env:SEED_ADMIN_CPF,Env:SEED_ADMIN_EMAIL
  & ./deploy/aws/production/scripts/publish.ps1 -ExpectedAccountId $expectedAccountId -Region sa-east-1 -StackName semcomp-production -RepositoryPath .
  ```

  Os scripts usam SSM e não podem imprimir o conteúdo dos parâmetros. Manter
  `$expectedAccountId` somente até o fim do go-live e removê-lo depois.

  Esperado: containers saudáveis localmente na EC2, Nginx em manutenção, manifesto S3 criado e imagens referenciadas por digest.

- [ ] **9.6 Aguardar DNS verificável.**

  ```powershell
  Resolve-DnsName gameficacao.semcomp.com.br -Type A
  ```

  Esperado: exatamente o EIP da stack. Se houver outro IP ou ausência, continuar em manutenção e aguardar o DevOps; não emitir certificado repetidamente.

- [ ] **9.7 Emitir certificado e ativar report-only.**

  Abrir uma sessão no host pelo output da stack:

  ```powershell
  $instanceId = aws cloudformation describe-stacks --stack-name semcomp-production --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" --output text --region sa-east-1
  aws ssm start-session --target $instanceId --region sa-east-1
  ```

  Dentro da sessão SSM, executar:

  ```bash
  cd /opt/semcomp/current
  read -r -p 'Production Elastic IP: ' production_ip
  DEPLOY_ENV=production PRODUCTION_ELASTIC_IP="$production_ip" bash deploy/aws/production/scripts/request-certificate.sh
  DEPLOY_ENV=production EDGE_MODE=report-only bash deploy/aws/production/scripts/activate-edge.sh
  ```

  `request-certificate.sh` deve pedir o email ACME interativamente. Não exportar
  esse email. Fora da sessão, rodar:

  ```powershell
  curl.exe -I https://gameficacao.semcomp.com.br
  ```

  Esperado: TLS válido, HSTS presente e `Content-Security-Policy-Report-Only` presente.

- [ ] **9.8 Definir a senha administrativa real.**

  Na mesma Session Manager, executar e digitar a senha no prompt oculto:

  ```bash
  cd /opt/semcomp/current
  DEPLOY_ENV=production CONFIRM_ADMIN_PASSWORD=semcomp-production bash deploy/aws/production/scripts/set-admin-password.sh
  ```

  Não colar a senha em chat, histórico, variável ou Parameter Store. Confirmar
  que o comando só relata sucesso, sem ecoar senha/hash.

- [ ] **9.9 Rodar o smoke em report-only e o teste manual de câmera.**

  Na Session Manager, executar e responder aos prompts protegidos com a conta
  real do organizador e o administrador:

  ```bash
  cd /opt/semcomp/current
  DEPLOY_ENV=production EXPECTED_ELASTIC_IP="$production_ip" BASE_URL=https://gameficacao.semcomp.com.br bash deploy/aws/production/scripts/smoke-test.sh
  ```

  Percorrer login, perfil, captura/QR e dashboard no navegador com console
  aberto. Em um celular real, confirmar câmera traseira, permitir, ler QR
  válido, cancelar e usar fallback manual.

  Se houver violação CSP necessária, corrigir a diretiva mínima no repositório, repetir tarefas 8.4–8.6, publicar novo digest e repetir este passo. Não liberar `unsafe-eval`.

- [ ] **9.10 Ativar CSP enforcement.**

  Somente com smoke report-only limpo, executar na Session Manager:

  ```bash
  cd /opt/semcomp/current
  DEPLOY_ENV=production EDGE_MODE=enforcement SEMCOMP_CSP_ENFORCEMENT=approved bash deploy/aws/production/scripts/activate-edge.sh
  ```

  Reexecutar as verificações de headers e os fluxos críticos.

- [ ] **9.11 Produzir e restaurar-testar o backup inicial.**

  Na Session Manager, ler o bucket da stack pelo metadata local usado pelo
  deploy, produzir o backup e encaminhar somente a URI retornada:

  ```bash
  cd /opt/semcomp/current
  backup_uri="$(DEPLOY_ENV=production bash deploy/aws/production/scripts/backup-postgres.sh)"
  release_sha="$(basename "$(readlink -f /opt/semcomp/current)")"
  DEPLOY_ENV=production BACKUP_S3_URI="$backup_uri" RELEASE_SHA="$release_sha" bash deploy/aws/production/scripts/verify-backup.sh
  unset backup_uri release_sha production_ip
  ```

  Confirmar que o projeto descartável foi removido e `semcomp-production`
  permaneceu ativo.

- [ ] **9.12 Abrir o sistema.**

  Preencher todos os itens críticos de `marco-14-opening-checklist.md`, confirmar espaço em disco abaixo de 80%, relógio, certificado, health, admin, organizador, QR e backup. Confirmar que o edge permanece na configuração final de enforcement e registrar o horário oficial de abertura/divulgação.

  No PowerShell do operador, limpar as variáveis mantidas para o go-live:

  ```powershell
  Remove-Variable expectedAccountId,productionIp,instanceId -ErrorAction SilentlyContinue
  ```

---

### Tarefa 10: Verificação pós-abertura e encerramento seguro

**Arquivos:**

- Alterar após evidência: `docs/operations/marco-14-opening-checklist.md`
- Alterar no fim do evento: `docs/operations/marco-14-closing-checklist.md`

- [ ] **10.1 Verificar 15 minutos após abertura.**

  Confirmar `/api/health`, CPU/memória/disco, reinícios de containers, erros 5xx, login, heartbeat, presença e lojinha. Não alterar funcionalidade sem incidente crítico.

- [ ] **10.2 Confirmar alarmes de custo.**

  No AWS Budgets, confirmar orçamento de US$ 80 e inscrições de email em 50%, 75% e 90%. Registrar apenas status, nunca email completo em log público.

- [ ] **10.3 Fechar o evento com backup final.**

  Colocar manutenção, bloquear novas mutações, gerar backup final, executar `verify-backup.sh`, registrar URI/digest/horário e exportar evidências operacionais.

- [ ] **10.4 Destruir recursos somente com autorização separada.**

  Antes de `cloudformation delete-stack`, listar stack, EIP, volume snapshot-retained, bucket e backups. Pedir autorização explícita. A exclusão da stack não deve apagar bucket/backups nem o snapshot do volume. Informar ao DevOps quando o registro A puder ser removido; não tocar na landing page.

## Gate final de aceite

- [ ] `https://gameficacao.semcomp.com.br` abre com certificado válido.
- [ ] `semcomp.com.br` continua servindo a landing page anterior.
- [ ] HTTP redireciona para HTTPS e ACME continua renovável.
- [ ] Somente 80/443 estão públicas; SSM substitui SSH.
- [ ] Admin expira em quatro horas e participante em oito horas nas três camadas.
- [ ] Produção usa secrets novos e senha administrativa nunca foi persistida em artefato.
- [ ] Release atual e anterior estão identificados por digest imutável.
- [ ] Health, login, heartbeat, câmera/QR e headers passam.
- [ ] Swagger está indisponível e logs não expõem PII/credenciais.
- [ ] Backup inicial está no S3 e passou por restauração isolada.
- [ ] Runbook, abertura, rollback e fechamento estão utilizáveis pelo operador.

## Referências técnicas consultadas

- AWS CloudFormation: EIP/association, EBS, S3 lifecycle/retention, IAM para SSM e notificações do AWS Budgets.
- Docker Compose: volumes nomeados, healthchecks, redes internas e execução isolada por projeto/perfil.
- Certbot: `certonly --webroot`, certificado nomeado e `renew --dry-run` com volumes persistentes compartilhados.
