# Marco 9 — Prontidão para produção e ensaio temporário na AWS — Plano de Implementação

> **Para agentes implementadores:** use `subagent-driven-development`
> (recomendado) ou `executing-plans` para executar uma tarefa por vez. Atualize
> os checkboxes somente depois de executar as verificações indicadas.

**Objetivo:** tornar a aplicação reproduzível em uma EC2 descartável, validar
os fluxos e a capacidade para 150 participantes simultâneos e remover os
recursos depois do ensaio, sem manter staging ocioso.

**Arquitetura:** uma EC2 `m7i-flex.large` executará Nginx, Next.js, NestJS e
PostgreSQL por Docker Compose. Nginx publicará frontend e API na mesma origem;
PostgreSQL ficará somente na rede interna do Compose e persistirá em EBS. O
primeiro ensaio usará o DNS público da EC2 em HTTP com dados descartáveis;
domínio, TLS e go-live continuam no Marco 14.

**Stack:** AWS EC2, CloudFormation, Systems Manager Session Manager, S3, AWS
Budgets, Ubuntu Server 24.04 LTS, Docker Engine, Docker Compose v2, Nginx,
Node.js 22, Next.js 16.2.4, NestJS 11, `@nestjs/throttler`, Helmet,
`bcrypt` 6, Prisma 7.8.0 e PostgreSQL 16.

## Como usar este documento

Este é um plano operacional, não uma implementação pronta. Cada tarefa define:

- os arquivos que podem mudar;
- o comportamento e os contratos obrigatórios;
- os testes que devem orientar a implementação;
- os comandos de verificação;
- o critério de aceite e o commit esperado.

Decisões de implementação que não alterem esses contratos ficam a cargo de quem
executar a tarefa. Trechos completos de código, Dockerfile, YAML, Nginx e
scripts não pertencem a este plano.

## Restrições globais

- Região do ensaio: `sa-east-1`.
- Tipo inicial: `m7i-flex.large`; manter `t3.large` somente como opção manual e
  usar `t3.xlarge` apenas após falha documentada no teste de carga.
- Volume raiz: EBS `gp3`, 40 GiB, criptografado e apagado na terminação.
- Não criar Elastic IP no primeiro ensaio.
- Não abrir as portas `22`, `3000`, `3001` ou `5432` no Security Group.
- Publicar somente a porta `80`; acesso administrativo ocorre via Session
  Manager.
- Usar somente dados, CPFs, emails, secrets e banco descartáveis de ensaio.
- Nunca imprimir JWT, cookies, token CSRF, senha do banco ou SecureStrings.
- Participantes autenticam somente por email + senha; CPF continua obrigatório,
  normalizado e único como dado de perfil, mas nunca atua como credencial.
- Senhas de participantes aceitam qualquer Unicode e espaços, sem trim ou regra
  de composição, com 8–64 pontos de código Unicode e no máximo 72 bytes UTF-8.
  Não existe recuperação de senha neste escopo.
- Administradores autenticam por CPF + email + senha. Somente o hash `bcrypt`
  pode ser persistido; recuperação é manual e não usa email.
- A senha administrativa nunca entra em seed, variável de ambiente, argumento
  de processo, parâmetro AWS, log ou relatório.
- Rate limiting reduz automação e volume; ele não transforma CPF ou email em
  segredo nem altera a decisão de autenticação.
- Chaves de limitação nunca armazenam CPF ou email em claro.
- `COOKIE_SECURE=false` só é permitido no perfil HTTP de ensaio. Produção exige
  HTTPS e `COOKIE_SECURE=true`.
- HSTS não pode ser emitido no ensaio HTTP.
- PostgreSQL deve persistir em volume Docker sobre EBS e nunca ser publicado no
  host.
- O backup deve sair da EC2 e ser restaurado pelo menos uma vez.
- Somente `prisma migrate deploy` pode aplicar migrations no ensaio.
- O Marco 11 já fornece heartbeat a cada 60 segundos, janela online de 120
  segundos e um único resumo diário por data operacional; não existe histórico
  de amostras por minuto.
- Alterações da aplicação começam por teste falhando e terminam com testes
  focados e build passando.
- Cada tarefa possui commit próprio; nunca usar `git add .`.
- Não alterar `docs/plan.md` durante a execução deste plano.
- Antes de provisionar, publicar ou destruir recursos, conferir conta e região
  com `aws sts get-caller-identity` e `aws configure get region`.

## Referências validadas

- Next.js standalone:
  https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Variáveis de ambiente do Next.js:
  https://nextjs.org/docs/app/guides/environment-variables
- Prisma migrate deploy:
  https://www.prisma.io/docs/cli/migrate/deploy
- Prisma seeding:
  https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding
- Ordem de inicialização no Compose:
  https://docs.docker.com/compose/how-tos/startup-order/
- Nginx proxy:
  https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- NestJS rate limiting:
  https://docs.nestjs.com/security/rate-limiting
- NestJS Helmet:
  https://docs.nestjs.com/security/helmet
- OWASP Authentication:
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- bcrypt para Node.js:
  https://github.com/kelektiv/node.bcrypt.js
- OWASP REST Security:
  https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- EC2 Session Manager:
  https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html

Validação feita com Context7 usando `/vercel/next.js/v16.2.9`,
`/prisma/prisma/7.6.0`, `/docker/compose`, `/nestjs/throttler` e
`/kelektiv/node.bcrypt.js`. Como o Context7 não expôs exatamente Next.js 16.2.4
e Prisma 7.8.0, foram usadas as versões mais próximas e o comando de migration
também foi conferido com o Prisma 7.8.0 instalado no projeto. Para bcrypt, a
documentação confirmou o uso das APIs assíncronas, o limite de 72 bytes e o
suporte da versão 6 ao Node.js 22.

---

### Tarefa 1: Fechar CSRF de login/logout e validar a origem

**Resultado:** os logins participante e administrativo e o logout só aceitam
requisições originadas do frontend configurado; logout exige sessão e token
CSRF.

**Arquivos:**

- Criar `apps/api/src/auth/allowed-origin.guard.ts`.
- Criar `apps/api/src/auth/specs/allowed-origin.guard.spec.ts`.
- Modificar `apps/api/src/auth/auth.controller.ts`.
- Modificar `apps/api/src/auth/auth.module.ts`.
- Modificar `apps/api/src/auth/specs/auth.controller.spec.ts`.
- Modificar `apps/web/src/features/auth/auth.service.ts`.
- Modificar `apps/web/src/lib/http/client.spec.ts`.

**Contrato obrigatório:**

- `AllowedOriginGuard` compara `URL.origin` do cabeçalho `Origin` com
  `FRONTEND_URL`.
- `Referer` só pode ser usado quando `Origin` não existir.
- Origem ausente, inválida ou diferente deve retornar `403`.
- Todo endpoint de login usa `AllowedOriginGuard`.
- Logout usa, nesta ordem lógica, `JwtAuthGuard`, `CsrfGuard` e
  `AllowedOriginGuard`.
- O frontend envia o token CSRF no logout; `skipCsrf` não pode ser usado.

**Execução:**

- [ ] Criar testes para origem correta, incorreta, inválida, ausente e fallback
  por `Referer`.
- [ ] Criar testes da composição dos guards no controller.
- [ ] Criar teste do logout no frontend com cookie e `X-CSRF-Token`.
- [ ] Executar os testes e confirmar que falham pelo comportamento ausente.
- [ ] Implementar o comportamento mínimo.
- [ ] Executar:
  `npm --workspace api test -- --runTestsByPath src/auth/specs/allowed-origin.guard.spec.ts src/auth/specs/auth.controller.spec.ts`.
- [ ] Executar:
  `npm --workspace web test -- src/lib/http/client.spec.ts`.

**Aceite:** testes passam; login rejeita origem ausente/incorreta; logout sem
sessão, CSRF ou origem correta falha.

**Commit:** `feat: enforce origin and csrf on auth mutations`.

---

### Tarefa 2: Adicionar senhas de participante e administrador com bcrypt

**Resultado:** participantes entram com email + senha e CPF apenas como dado de
perfil, enquanto administradores usam uma rota separada que também exige senha.

**Arquivos:**

- Modificar `apps/api/prisma/schema/users.prisma`.
- Criar
  `apps/api/prisma/migrations/20260730090000_add_admin_password_hash/migration.sql`.
- Criar `apps/api/src/auth/password-policy.ts`.
- Criar `apps/api/src/auth/specs/password-policy.spec.ts`.
- Criar `apps/api/src/auth/dto/admin-login.dto.ts`.
- Criar `apps/api/src/auth/admin-password.service.ts`.
- Criar `apps/api/src/auth/specs/admin-password.service.spec.ts`.
- Modificar `apps/api/src/auth/auth.controller.ts`.
- Modificar `apps/api/src/auth/auth.module.ts`.
- Modificar `apps/api/src/auth/auth.service.ts`.
- Modificar `apps/api/src/auth/specs/auth.controller.spec.ts`.
- Modificar `apps/api/src/auth/specs/auth.service.spec.ts`.
- Modificar `apps/api/src/users/users.repository.ts`.
- Modificar `apps/api/src/users/users.service.ts`.
- Criar `apps/api/src/cli/set-admin-password.ts`.
- Criar `apps/api/src/cli/set-admin-password.spec.ts`.
- Modificar `apps/api/prisma/seed.ts`.
- Modificar `apps/api/package.json`.
- Modificar `package-lock.json`.
- Criar `apps/web/src/app/login/admin/page.tsx`.
- Criar `apps/web/src/app/login/admin/admin-login-form.tsx`.
- Criar `apps/web/src/app/login/admin/admin-login-form.spec.tsx`.
- Modificar `apps/web/src/features/auth/auth.types.ts`.
- Modificar `apps/web/src/features/auth/auth.service.ts`.
- Modificar `apps/web/src/proxy.ts`.
- Criar `deploy/aws/scripts/set-admin-password.sh`.

**Contrato obrigatório:**

- `User` recebe `passwordHash String?` e `passwordChangedAt DateTime?`.
  Participantes cadastrados e administradores configurados armazenam somente o
  hash; administrador sem hash não pode entrar.
- `POST /auth/login` aceita somente email + senha e nunca autentica uma conta
  `ADMIN`.
- `POST /auth/admin/login` exige CPF + email + senha e nunca autentica uma conta
  `PARTICIPANT`.
- Respostas para identidade inexistente, role incorreta, conta inativa, hash
  ausente e senha errada são públicas, genéricas e equivalentes.
- Instalar `bcrypt` v6 e usar apenas `hash()` e `compare()` assíncronos. O salt é
  gerado pela biblioteca; somente o hash é persistido.
- O custo inicial é 12. Ele só pode ser alterado após benchmark documentado na
  `m7i-flex.large`, sem reduzir a proteção silenciosamente por ambiente.
- Senha de participante deve ter 8–64 pontos de código e no máximo 72 bytes em
  UTF-8; senha administrativa deve ter 12–64 caracteres e no máximo 72 bytes.
  Entradas acima de 72 bytes são rejeitadas antes do bcrypt.
- Não exigir classes artificiais de caracteres e não normalizar ou truncar a
  senha informada.
- Quando a identidade ou o hash não existir, executar comparação dummy com um
  hash bcrypt válido para reduzir diferenças observáveis de tempo.
- `passwordHash` nunca aparece em DTO, cookie, JWT, resposta, log, métrica ou
  evento de auditoria. Consultas comuns usam seleção explícita; somente o fluxo
  interno de autenticação administrativa pode ler o hash.
- O seed cria ou atualiza a identidade `ADMIN` sem receber senha em claro e sem
  sobrescrever um hash já definido.
- O CLI seleciona um administrador existente, recebe a nova senha por `stdin`,
  aplica a mesma política e atualiza hash/data em transação. Saídas são
  genéricas e não revelam CPF, email ou hash.
- `set-admin-password.sh` solicita CPF, email, senha e confirmação
  interativamente, desabilita o eco da senha e envia os dados ao CLI por
  `stdin`; a senha não pode ir em argumento, variável de ambiente ou arquivo.
- O mesmo comando atende bootstrap e reset manual. No ensaio ele é executado
  somente via Session Manager, com credencial descartável.
- Usuário não autenticado que acessa `/admin` é direcionado para
  `/login/admin`; o formulário participante não ganha campo de senha.

**Execução:**

- [ ] Escrever testes da política incluindo 11/12/64/65 caracteres, 72/73 bytes
  UTF-8 e confirmação divergente.
- [ ] Escrever testes de hash/compare, custo, falha genérica, comparação dummy,
  role incorreta, conta inativa e hash ausente.
- [ ] Escrever testes comprovando que o login participante exige email + senha e
  não aceita administradores.
- [ ] Escrever testes do CLI sem valor em argumento/ambiente e sem vazamento na
  saída.
- [ ] Escrever teste do formulário e do redirecionamento administrativo.
- [ ] Executar os testes focados e confirmar as falhas iniciais.
- [ ] Instalar `bcrypt` v6, criar a migration e implementar o menor fluxo que
  satisfaça os testes.
- [ ] Executar:
  `npm --workspace api test -- --runTestsByPath src/auth/specs/password-policy.spec.ts src/auth/specs/admin-password.service.spec.ts src/auth/specs/auth.service.spec.ts src/auth/specs/auth.controller.spec.ts src/cli/set-admin-password.spec.ts`.
- [ ] Executar:
  `npm --workspace web test -- src/app/login/admin/admin-login-form.spec.tsx`.
- [ ] Executar `npm --workspace api run build` e
  `npm --workspace web run build`.
- [ ] Executar `bash -n deploy/aws/scripts/set-admin-password.sh`.
- [ ] Medir o tempo de hash e comparação com custo 12 dentro do contêiner da
  API na `m7i-flex.large` durante o ensaio e anexar o resultado ao artefato de
  métricas do host sem incluir senha ou hash.

**Aceite:** participante autentica somente com email + senha e mantém CPF no
perfil; administrador falha sem senha ou com senha incorreta e entra com senha
válida; nenhum texto claro ou hash vaza; bootstrap/reset funciona por entrada
interativa via SSM.

**Commit:** `feat: require bcrypt password for admin access`.

---

### Tarefa 3: Adicionar hardening HTTP e controle de abuso

**Resultado:** a API limita automação e flood sem bloquear os 150 participantes
atrás do mesmo NAT, preservando os fluxos distintos de participante e
administrador.

**Arquivos:**

- Criar `apps/api/src/security/security.module.ts`.
- Criar `apps/api/src/security/rate-limit-key.ts`.
- Criar `apps/api/src/security/rate-limit-key.spec.ts`.
- Criar `apps/api/src/security/app-throttler.guard.ts`.
- Criar `apps/api/src/security/app-throttler.guard.spec.ts`.
- Modificar `apps/api/src/app.module.ts`.
- Modificar `apps/api/src/main.ts`.
- Modificar `apps/api/src/auth/auth.controller.ts`.
- Modificar `apps/api/src/auth/auth.service.ts`.
- Modificar `apps/api/src/auth/specs/auth.service.spec.ts`.
- Modificar `apps/api/.env.example`.
- Modificar `apps/api/package.json`.
- Modificar `package-lock.json`.

**Contrato obrigatório:**

- Instalar `@nestjs/throttler` e `helmet`.
- Login participante recebe email + senha, sem OTP ou recuperação; login
  administrativo continua exigindo a senha definida na Tarefa 2 e CPF + email.
- Requisições anônimas usam chave HMAC derivada do email + rota no login
  participante e de CPF + email + rota no login administrativo, sempre com
  `RATE_LIMIT_KEY_SECRET`.
- Depois da autenticação, a chave principal é o ID interno do usuário; o IP é
  fallback, não identificador primário.
- Nenhuma chave, métrica, erro ou log contém CPF/email em claro.
- Armazenamento em memória é aceito porque haverá uma única instância da API;
  reinício limpa os contadores e essa limitação deve ser documentada.
- Limites iniciais:
  - login participante: 5 tentativas por chave a cada 15 minutos;
  - login administrativo: 5 tentativas por chave a cada 15 minutos;
  - cadastro: 3 tentativas por chave a cada 60 minutos;
  - leituras autenticadas: 120 requisições por usuário por minuto;
  - mutações de participante: 10 por usuário por minuto;
  - mutações administrativas: 30 por administrador por minuto;
  - health público: 60 requisições por IP por minuto.
- Resposta de bloqueio usa `429`, `Retry-After` e headers de limite, sem revelar
  a chave usada.
- Login e cadastro não informam se CPF ou email individualmente existe; conflito
  de cadastro usa mensagem única.
- Helmet é aplicado globalmente; `X-Powered-By` é removido.
- Body JSON fica limitado a 128 KiB e content types inesperados são recusados.
- CORS é desabilitado no perfil de mesma origem e, no desenvolvimento, aceita
  somente a origem exata configurada. Produção não usa fallback para localhost.
- O NestJS confia em exatamente um proxy; a Tarefa 7 fará o Nginx sobrescrever
  os headers de encaminhamento.
- HSTS permanece desabilitado no perfil HTTP do ensaio.

**Execução:**

- [ ] Escrever testes das chaves HMAC, normalização e ausência de PII.
- [ ] Escrever testes de cada classe de limite e dos headers `429`.
- [ ] Cobrir 150 usuários distintos no mesmo IP sem bloqueio indevido.
- [ ] Cobrir mensagens genéricas de login e cadastro.
- [ ] Confirmar as falhas antes da implementação.
- [ ] Instalar dependências e implementar `SecurityModule` e o guard.
- [ ] Configurar Helmet, proxy, CORS, body e content type.
- [ ] Executar:
  `npm --workspace api test -- --runTestsByPath src/security/rate-limit-key.spec.ts src/security/app-throttler.guard.spec.ts src/auth/specs/auth.service.spec.ts`.
- [ ] Executar `npm --workspace api run build`.

**Aceite:** limites abusivos retornam `429`; 150 identidades atrás do mesmo IP
não são tratadas como uma só; respostas e logs não expõem qual CPF/email existe;
os dois modos de autenticação permanecem isolados.

**Commit:** `feat: add api abuse and http hardening`.

---

### Tarefa 4: Adicionar configuração segura de Swagger e health check

**Resultado:** Swagger não fica exposto no ensaio e a aplicação publica um
readiness check que comprova acesso ao PostgreSQL.

**Arquivos:**

- Criar `apps/api/src/config/runtime-options.ts`.
- Criar `apps/api/src/config/runtime-options.spec.ts`.
- Criar `apps/api/src/health/health.module.ts`.
- Criar `apps/api/src/health/health.controller.ts`.
- Criar `apps/api/src/health/health.service.ts`.
- Criar `apps/api/src/health/health.service.spec.ts`.
- Modificar `apps/api/src/main.ts`.
- Modificar `apps/api/src/app.module.ts`.
- Modificar `apps/api/.env.example`.

**Contrato obrigatório:**

- `SWAGGER_ENABLED` aceita somente `true` ou `false`.
- Sem configuração explícita, Swagger fica habilitado fora de produção e
  desabilitado em produção.
- `GET /health` executa `SELECT 1` pelo `PrismaService`.
- Banco acessível retorna `200` com estado saudável.
- Falha do banco retorna `503` sem expor credenciais ou detalhes internos.
- O perfil de ensaio documenta `NODE_ENV=production`,
  `SWAGGER_ENABLED=false`, `COOKIE_SECURE=false` e `COOKIE_SAME_SITE=lax`.

**Execução:**

- [ ] Escrever testes das combinações válidas e inválidas de
  `SWAGGER_ENABLED`.
- [ ] Escrever testes do health check com banco acessível e indisponível.
- [ ] Confirmar a falha inicial.
- [ ] Implementar flags de runtime e `HealthModule`.
- [ ] Condicionar a criação do Swagger à flag.
- [ ] Executar:
  `npm --workspace api test -- --runTestsByPath src/config/runtime-options.spec.ts src/health/health.service.spec.ts`.
- [ ] Executar `npm --workspace api run build`.

**Aceite:** `/health` consulta o banco; Swagger não existe no perfil do ensaio;
configuração inválida interrompe o bootstrap.

**Commit:** `feat: add deployment health and swagger controls`.

---

### Tarefa 5: Tornar o seed seguro, configurável e idempotente

**Resultado:** a identidade do administrador inicial vem do ambiente, permanece
sem acesso até o bootstrap de senha e o seed pode ser reexecutado sem duplicação
ou perda do hash existente.

**Arquivos:**

- Criar `apps/api/prisma/seed-config.ts`.
- Criar `apps/api/src/prisma/seed-config.spec.ts`.
- Modificar `apps/api/prisma/seed.ts`.
- Modificar `apps/api/.env.example`.

**Contrato obrigatório:**

- `SEED_MODE` aceita `admin-only` ou `demo`.
- Nome, CPF e email do administrador vêm de `SEED_ADMIN_NAME`,
  `SEED_ADMIN_CPF` e `SEED_ADMIN_EMAIL`.
- CPF precisa conter 11 dígitos e email precisa ser válido.
- `admin-only` cria ou atualiza somente o administrador.
- `demo` também cria os participantes e as ações demonstrativas atuais.
- Nenhuma identidade administrativa fixa permanece no código.
- O seed não recebe senha nem hash por código, argumento ou ambiente. Ao criar o
  administrador, `passwordHash` fica nulo; ao atualizá-lo, um hash existente é
  preservado.
- Logs não contêm CPF nem email.
- O seed usa operações idempotentes.

**Execução:**

- [ ] Escrever testes para modo inválido, campos ausentes, CPF, email e
  normalização.
- [ ] Executar
  `npm --workspace api test -- --runTestsByPath prisma/seed-config.spec.ts` e
  confirmar falha.
- [ ] Implementar a leitura estrita da configuração.
- [ ] Adaptar o seed para os dois modos.
- [ ] Executar o seed duas vezes contra banco descartável.
- [ ] Confirmar que usuários e ações não foram duplicados e que o hash definido
  pelo bootstrap não foi apagado ou substituído.
- [ ] Reexecutar o teste focado.

**Aceite:** os dois modos funcionam; `admin-only` não aceita senha; duas
execuções produzem o mesmo estado e preservam o hash administrativo existente.

**Commit:** `feat: make deployment seed explicit and idempotent`.

---

### Tarefa 6: Criar imagens Docker reproduzíveis

**Resultado:** API e web podem ser construídos a partir de um commit limpo, sem
copiar secrets para as imagens.

**Arquivos:**

- Criar `.dockerignore`.
- Criar `apps/api/Dockerfile`.
- Criar `apps/web/Dockerfile`.
- Modificar `apps/web/next.config.ts`.
- Modificar `apps/web/package.json`.
- Modificar `package-lock.json`.
- Modificar `apps/web/.env.example`.

**Contrato obrigatório:**

- Ambas as imagens usam Node.js 22 e build multi-stage.
- A API executa `prisma generate` durante o build e inicia
  `apps/api/dist/main.js`.
- A imagem final da API contém o binário nativo do `bcrypt` v6 compatível com a
  distribuição e a arquitetura escolhidas; o build falha se o módulo não puder
  ser carregado no estágio de runtime.
- A imagem da API conserva Prisma CLI, migrations e suporte ao seed porque será
  reutilizada pelos serviços one-shot.
- O web usa `output: 'standalone'` e `outputFileTracingRoot` apontando para a
  raiz do monorepo.
- `sharp` fica em `dependencies` do web.
- A imagem final copia o standalone para a raiz, `public` para
  `apps/web/public` e `.next/static` para `apps/web/.next/static`.
- O servidor web inicia por `apps/web/server.js`.
- `NEXT_PUBLIC_API_URL=/api` é definido durante o build. Alterá-lo exige
  reconstruir a imagem.
- `.env`, `.git`, dependências locais e artefatos de build não entram no
  contexto Docker.

**Execução:**

- [ ] Adicionar `sharp` ao workspace web.
- [ ] Configurar standalone e tracing do monorepo.
- [ ] Criar `.dockerignore` e os dois Dockerfiles.
- [ ] Construir a API:
  `docker build -f apps/api/Dockerfile -t semcomp-api:marco11 .`.
- [ ] Executar um smoke do módulo `bcrypt` dentro da imagem final da API.
- [ ] Construir o web:
  `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=/api -t semcomp-web:marco11 .`.
- [ ] Inspecionar as imagens e confirmar que não contêm `.env`.
- [ ] Executar os builds dos workspaces.

**Aceite:** as duas imagens constroem a partir de checkout limpo e os containers
de runtime executam como usuário não root.

**Commit:** `feat: add production container images`.

---

### Tarefa 7: Compor Nginx, aplicações e PostgreSQL sem expor o banco

**Resultado:** o stack completo sobe por um único Compose e publica somente a
porta web.

**Arquivos:**

- Criar `deploy/aws/compose.yml`.
- Criar `deploy/aws/nginx.conf`.
- Criar `deploy/aws/rehearsal.env.example`.

**Contrato obrigatório:**

- Nginx publica `http://host/` para o web e `http://host/api/` para a API,
  removendo o prefixo `/api`.
- Nginx sobrescreve `X-Forwarded-For` e `X-Real-IP` com o endereço observado;
  valores enviados pelo cliente não são propagados.
- `/api/` usa limite grosseiro de 50 requisições por segundo por IP, com burst
  100. Esse limite protege a borda, mas não substitui os limites por usuário.
- Nginx e API limitam bodies a 128 KiB.
- Respostas incluem proteção contra framing e MIME sniffing, política de
  referrer e permissions policy mínima. HSTS fica ausente no ensaio HTTP.
- Somente Nginx possui `ports`, com `80:80`.
- PostgreSQL usa `postgres:16-alpine`, volume nomeado e health check por
  `pg_isready`.
- `migrate` depende de `postgres: service_healthy`, executa
  `npm --workspace api exec -- prisma migrate deploy` e termina.
- API depende de PostgreSQL saudável e de
  `migrate: service_completed_successfully`.
- `seed` usa profile `operations`, depende da migration e executa
  `prisma db seed` explicitamente.
- Web, API, PostgreSQL e Nginx reiniciam automaticamente.
- API e web possuem health checks.
- Containers de aplicação executam sem root, com `no-new-privileges`,
  capabilities removidas e filesystem somente leitura quando compatível.
- Nenhum container monta o Docker socket; diretórios graváveis são volumes ou
  `tmpfs` explícitos.
- O arquivo de ambiente documenta todas as variáveis do perfil de ensaio com
  valores locais descartáveis, incluindo `RATE_LIMIT_KEY_SECRET`; secrets reais
  são fornecidos somente por SSM.

**Execução:**

- [ ] Criar o arquivo de ambiente de exemplo.
- [ ] Criar Nginx e Compose respeitando as dependências acima.
- [ ] Validar:
  `docker compose --env-file deploy/aws/rehearsal.env.example -f deploy/aws/compose.yml config`.
- [ ] Confirmar na configuração expandida que `5432` não está publicada.
- [ ] Confirmar que `X-Forwarded-For` forjado não altera o IP visto pela API.
- [ ] Confirmar headers de segurança e ausência de HSTS no ensaio.
- [ ] Confirmar que payload acima de 128 KiB recebe `413`.
- [ ] Confirmar `read_only`, `no-new-privileges`, capabilities e ausência do
  Docker socket na configuração expandida.
- [ ] Subir localmente com
  `docker compose --env-file deploy/aws/rehearsal.env.example -f deploy/aws/compose.yml up -d --build`.
- [ ] Verificar `http://localhost/api/health`, `http://localhost/login` e
  `docker compose --env-file deploy/aws/rehearsal.env.example -f deploy/aws/compose.yml ps`.
- [ ] Executar o seed pelo profile `operations`.
- [ ] Reexecutar migration e seed; confirmar ausência de migrations pendentes e
  de registros duplicados.
- [ ] Remover o stack local sem apagar o volume nessa primeira revisão.

**Aceite:** Nginx, web, API e PostgreSQL ficam saudáveis; migration termina com
sucesso; somente a porta 80 é publicada.

**Commit:** `feat: add single-host rehearsal stack`.

---

### Tarefa 8: Automatizar backup e restauração com travas de segurança

**Resultado:** o banco pode ser copiado para S3 e restaurado sem permitir uso
acidental fora do ambiente descartável.

**Arquivos:**

- Criar `deploy/aws/scripts/backup-postgres.sh`.
- Criar `deploy/aws/scripts/restore-postgres.sh`.
- Criar `deploy/aws/scripts/scripts.test.sh`.

**Contrato obrigatório:**

- Backup usa `pg_dump -Fc` e envia o stream diretamente para
  `s3://${BACKUP_BUCKET}/backups/`, com criptografia do S3.
- O dump e a senha não ficam permanentemente no host nem aparecem nos logs.
- Restauração exige `DEPLOY_ENV=rehearsal` e
  `CONFIRM_RESTORE=semcomp-rehearsal`.
- Ambiente diferente deve ser recusado antes de acessar arquivo, Docker ou AWS.
- O arquivo temporário de restore usa diretório temporário e limpeza por
  `trap`.
- A restauração afeta somente o banco do ensaio, usa
  `pg_restore --exit-on-error` e termina validando `/api/health`.

**Execução:**

- [ ] Escrever primeiro o teste de recusa para `DEPLOY_ENV=production`.
- [ ] Confirmar que o teste falha porque o script ainda não existe.
- [ ] Implementar backup e restauração.
- [ ] Executar `bash -n` nos três scripts.
- [ ] Executar `bash deploy/aws/scripts/scripts.test.sh`.
- [ ] Em banco local descartável, criar backup, alterar dados, restaurar e
  confirmar o estado original.

**Aceite:** o gate impede restore fora do ensaio; backup e restore funcionam
com dados descartáveis; nenhum secret é registrado.

**Commit:** `feat: add guarded postgres backup and restore`.

---

### Tarefa 9: Provisionar infraestrutura temporária por CloudFormation

**Resultado:** uma stack recriável provisiona toda a infraestrutura do ensaio
sem SSH público.

**Arquivo:** criar `deploy/aws/cloudformation.yml`.

**Contrato obrigatório:**

- Parâmetros: `InstanceType` com padrão `m7i-flex.large`, limitado a
  `m7i-flex.large`/`t3.large`/`t3.xlarge`, e `BudgetEmail`.
- Outputs: `InstanceId`, `PublicDnsName` e `BackupBucketName`.
- Recursos: VPC, subnet pública, Internet Gateway, rota, Security Group, bucket
  S3, IAM role/profile, EC2 e budget mensal.
- Security Group recebe somente TCP 80 da internet.
- EC2 usa Ubuntu Server 24.04 LTS, EBS `gp3` de 40 GiB criptografado,
  `DeleteOnTermination=true` e metadata IMDSv2 obrigatória.
- IAM concede somente SSM, leitura do prefixo de parâmetros, acesso ao bucket
  do ensaio e leitura das métricas necessárias no CloudWatch.
- User data instala Docker/Compose, cria `/opt/semcomp` e habilita os serviços
  necessários.
- Bucket bloqueia acesso público, usa criptografia e expira artefatos
  temporários.
- Budget apenas alerta; ele não substitui teardown nem acompanhamento de
  créditos.

**Execução:**

- [ ] Criar o template com parâmetros e políticas mínimas.
- [ ] Revisar que não existe KeyPair, regra de porta 22 ou Elastic IP.
- [ ] Validar sintaxe YAML localmente.
- [ ] Executar:
  `aws cloudformation validate-template --region sa-east-1 --template-body file://deploy/aws/cloudformation.yml`.
- [ ] Revisar o change set antes do primeiro deploy.

**Aceite:** o template é válido, recriável e não expõe administração ou banco.

**Commit:** `feat: provision disposable aws rehearsal infrastructure`.

---

### Tarefa 10: Automatizar parâmetros, publicação e rollback de release

**Resultado:** um commit limpo pode ser publicado por S3/SSM e só se torna
release atual depois de passar no health check.

**Arquivos:**

- Criar `deploy/aws/scripts/configure-parameters.ps1`.
- Criar `deploy/aws/scripts/publish.ps1`.
- Criar `deploy/aws/scripts/deploy-release.sh`.

**Contrato obrigatório:**

- Parâmetros ficam sob `/semcomp/rehearsal/`; secrets usam `SecureString`.
- `POSTGRES_PASSWORD`, `JWT_SECRET` e `RATE_LIMIT_KEY_SECRET` são
  `SecureString` distintos e gerados para o ensaio.
- Senha administrativa e `passwordHash` não são parâmetros AWS. O deploy cria
  somente a identidade pelo seed; a senha é definida depois, de forma
  interativa, pelo script da Tarefa 2 via Session Manager.
- Scripts validam conta e `sa-east-1` antes de qualquer mutação.
- Publicação exige worktree limpo e identifica a release pelo SHA do commit.
- O artefato vai para `releases/${COMMIT_SHA}.zip` no bucket da stack.
- O comando remoto é enviado por SSM; nenhuma porta administrativa é aberta.
- A release é extraída em `/opt/semcomp/releases/${COMMIT_SHA}`.
- O ambiente local à EC2 usa permissão `0600`.
- Deploy valida Compose, constrói imagens, sobe o stack, executa seed
  `admin-only` separadamente e aguarda `/api/health` por até 120 segundos.
- O symlink `/opt/semcomp/current` só muda após o health check.
- Falha mantém a release anterior e retorna código diferente de zero.
- Apenas as duas releases anteriores são preservadas.

**Execução:**

- [ ] Implementar configuração dos parâmetros sem imprimir valores.
- [ ] Implementar empacotamento, upload, comando SSM e espera pelo resultado.
- [ ] Implementar deploy remoto e rollback pelo symlink.
- [ ] Testar o gate local usando uma região diferente de `sa-east-1`.
- [ ] Executar `bash -n deploy/aws/scripts/deploy-release.sh`.
- [ ] Conferir que nenhum script contém secret fixo.
- [ ] Confirmar que a lista `/semcomp/rehearsal/` não contém senha ou hash
  administrativo.

**Aceite:** região/conta incorretas abortam antes de mutação; release com health
falhando não substitui a anterior.

**Commit:** `feat: automate aws rehearsal releases`.

---

### Tarefa 11: Atualizar smoke test, CI, roadmap e carga do Marco 11

**Resultado:** o ensaio produz evidências objetivas de funcionamento,
capacidade e consumo de recursos sem registrar dados sensíveis.

O Marco 11 usa o UUID de `UserSession.id` como o `jti` exato do JWT, retém
sessões encerradas/expiradas por 30 dias e resumos diários por 24 meses. A API
administrativa expõe overview, histórico sem paginação por data operacional e
CSV agregado com uma linha `GERAL` e linhas `DIARIO` filtradas, em UTF-8 com
BOM, `;` e CRLF; não há amostras, endpoint ou exportação por minuto e nenhum
identificador individual aparece no arquivo.

**Arquivos:**

- Modificar `scripts/load/marco-9-load.mjs`.
- Criar `scripts/load/marco-11-load.test.mjs`.
- Modificar `.github/workflows/ci.yml`, `docs/plan.md`, este documento, os
  READMEs dos workspaces e os exemplos de ambiente.

**Contrato obrigatório:**

- Smoke cobre health, cadastro descartável, login participante por email +
  senha, sessão, logout, Swagger indisponível e ausência de resposta pública na
  porta 5432.
- Smoke comprova que o login administrativo recusa senha ausente/incorreta e
  aceita a credencial descartável recebida por entrada protegida; a senha
  permanece somente em memória e não aparece no relatório.
- Smoke valida `413`, `429`, `Retry-After`, headers de segurança e tentativa de
  falsificar `X-Forwarded-For`.
- O gerador mantém CPFs determinísticos e únicos somente como dados obrigatórios
  de perfil; nenhum CPF atua como credencial.
- A carga registra 150 participantes com senhas distintas geradas em memória,
  encerra a sessão criada no cadastro e autentica novamente por email + senha.
- A carga mantém 150 sessões, envia heartbeat imediato e a cada 60 segundos por
  pelo menos 130 segundos, e confirma uma linha diária com 150 participantes
  online distintos.
- Cenário: 150 acessos a home/ranking em 10 segundos, 100 resgates quase
  simultâneos e poucas operações administrativas concorrentes.
- O relatório contém contagem, erros, mínimo, mediana, p95 e máximo por
  operação, além de status HTTP e métricas agregadas de recursos.
- Relatório não contém senhas, CPFs, emails, cookies, CSRF, JWT ou outros
  identificadores; os valores transitórios são incluídos no scan antes da
  serialização.
- O relatório é `artifacts/marco-11-load-report.json`, com schema versionado e
  thresholds para participantes online observados e uma linha diária.
- Limites: erros abaixo de 1%; leituras p95 abaixo de 800 ms; mutações p95
  abaixo de 1 segundo.
- Métricas: CPU, memória, disco, conexões PostgreSQL, `CPUUtilization`,
  `NetworkIn`, `NetworkOut`, `StatusCheckFailed` e contagens agregadas de `401`,
  `403` e `429`.
- O artefato de métricas do host inclui latência de `hash()` e `compare()`
  bcrypt com custo 12, executados dentro do contêiner da API na
  `m7i-flex.large`, sem senha nem hash, para confirmar que o custo é suportável.
- Limites do host: memória abaixo de 75%, CPU não sustentada acima de 80% e
  nenhum timeout por esgotamento de conexões.

**Execução:**

- [ ] Escrever testes do gerador e do contrato Marco 11 e confirmar a falha
  inicial.
- [ ] Implementar registro/login por email + senha, logout, heartbeat, polling
  de overview/histórico diário e captura de métricas.
- [ ] Adicionar cenário de abuso que ultrapassa o limite e recebe `429`.
- [ ] Adicionar cenário válido com 150 participantes no mesmo IP sem `429`.
- [ ] Adicionar cenários administrativos de senha ausente, incorreta e válida,
  e confirmar overview/histórico diário sem gravar a credencial.
- [ ] Executar `node --test scripts/load/cpf.test.mjs`.
- [ ] Executar `node --check scripts/load/marco-9-load.mjs`.
- [ ] Executar `bash -n` nos scripts operacionais.
- [ ] Rodar cenário reduzido localmente e verificar o formato do relatório.

**Aceite:** abuso recebe `429`; login legado sem senha é rejeitado; carga válida
mantém 150 pessoas distintas online sem `429`, executa dois intervalos de
heartbeat, produz uma linha diária e os dois fluxos de login mantêm seus
contratos; custo bcrypt 12 foi medido; scripts falham quando limites de
desempenho são excedidos; artefatos não contêm PII ou credenciais.

**Commit:** `chore: validate marco 11 daily presence`.

---

### Tarefa 12: Tornar artefatos de deploy obrigatórios no CI

**Resultado:** mudanças de infraestrutura e empacotamento não podem ser
integradas sem validação automática.

**Arquivo:** modificar `.github/workflows/ci.yml`.

**Contrato obrigatório:**

- Criar job `deployment-artifacts` em Ubuntu com Node.js 22.
- O job não usa credenciais AWS.
- Executar regressões locais do CloudFormation, das métricas M7i e do rollback
  de release.
- Validar os contratos de carga Marco 11, senha administrativa, sintaxe dos scripts,
  configuração do Compose, build das duas imagens e carregamento do bcrypt na
  imagem final da API.
- Executar os testes de bcrypt, isolamento dos logins, rate limiting, chave HMAC
  e mensagens genéricas.
- Manter lint, testes, E2E e builds existentes dos workspaces.

**Execução:**

- [ ] Adicionar o job sem duplicar instalação desnecessária.
- [ ] Executar localmente:
  `node --test deploy/aws/cloudformation.test.mjs deploy/aws/scripts/capture-metrics.test.mjs scripts/load/cpf.test.mjs scripts/load/marco-11-load.test.mjs`.
- [ ] Executar `npm run test:deployment-scripts`.
- [ ] Executar:
  `npm --workspace api test -- --runTestsByPath src/auth/specs/password-policy.spec.ts src/auth/specs/admin-password.service.spec.ts src/auth/specs/auth.service.spec.ts src/security/rate-limit-key.spec.ts src/security/app-throttler.guard.spec.ts`.
- [ ] Executar `bash -n deploy/aws/scripts/*.sh`.
- [ ] Executar `docker compose --env-file deploy/aws/rehearsal.env.example -f deploy/aws/compose.yml config`.
- [ ] Construir as imagens API e web com as mesmas opções do CI.
- [ ] Executar lint, testes, E2E e builds dos workspaces.
- [ ] Executar `git diff --check`.

**Aceite:** o job passa sem AWS e detecta script inválido, Compose inválido ou
imagem que não constrói.

**Commit:** `ci: validate aws rehearsal artifacts`.

---

### Tarefa 13: Executar o ensaio AWS, registrar evidências e remover recursos

**Resultado:** a stack é testada com dados descartáveis e completamente
removida depois da coleta das evidências.

**Artefatos locais não versionados:**

- `artifacts/marco-11-load-report.json`.
- `artifacts/marco-9-host-metrics.log`.
- `artifacts/marco-9-aws-metrics.json`.
- `artifacts/marco-9-smoke.log`.

**Gate:** esta tarefa altera recursos externos e gera cobrança. Antes de cada
comando mutante, confirmar conta, região, saldo de créditos, email do budget e
o alvo exato da operação.

**Execução:**

- [ ] Conferir identidade com `aws sts get-caller-identity`.
- [ ] Conferir que `aws configure get region` retorna `sa-east-1`.
- [ ] Provisionar a stack `semcomp-rehearsal` com
  `InstanceType=m7i-flex.large`.
- [ ] Aguardar `CREATE_COMPLETE` e revisar os outputs.
- [ ] Configurar parâmetros com
  `deploy/aws/scripts/configure-parameters.ps1`.
- [ ] Publicar o commit com `deploy/aws/scripts/publish.ps1`.
- [ ] Abrir uma sessão SSM, executar
  `deploy/aws/scripts/set-admin-password.sh` e definir uma senha exclusiva,
  forte e descartável para o administrador do ensaio.
- [ ] Confirmar que a senha não aparece em histórico, argumentos, ambiente,
  parâmetros AWS, saída do comando ou logs da aplicação.
- [ ] Obter `PublicDnsName` dos outputs da stack, armazenar em `PUBLIC_DNS` e
  executar o smoke test com `BASE_URL="http://${PUBLIC_DNS}"`.
- [ ] Demonstrar `413`, `429`, `Retry-After`, headers de segurança e resistência
  a `X-Forwarded-For` forjado.
- [ ] Validar manualmente cadastro, login, logout, home, resgate de código,
  ranking, lojinha e as principais operações administrativas.
- [ ] Validar que participante entra com email + senha, que o login legado sem
  senha é rejeitado e que administrador falha sem senha ou com senha incorreta.
- [ ] Preferir o túnel do Session Manager para a validação administrativa; se
  alguma etapa usar o HTTP público, utilizar exclusivamente a senha descartável
  do ensaio e nunca promovê-la para staging ou produção.
- [ ] Acessar a EC2 por SSM e demonstrar backup e restauração.
- [ ] Reexecutar o smoke test depois da restauração.
- [ ] Capturar métricas na EC2 enquanto a carga roda da máquina cliente; o
  script também deve registrar o benchmark bcrypt dentro do contêiner da API.
- [ ] Confirmar que 150 participantes atrás do mesmo IP não recebem `429`.
- [ ] Confirmar que logs e relatórios não contêm CPF/email em claro.
- [ ] Confirmar todos os limites de erro, latência e recursos.
- [ ] Se apenas capacidade falhar, repetir uma única vez em `t3.xlarge` e
  registrar a evidência. Não aumentar por antecipação.
- [ ] Copiar relatórios para fora da EC2 e verificar ausência de PII/secrets.
- [ ] Resolver novamente o bucket pelo output da stack e esvaziar somente esse
  bucket.
- [ ] Listar `/semcomp/rehearsal/`, revisar os nomes e apagar somente esses
  parâmetros.
- [ ] Executar
  `aws cloudformation delete-stack --region sa-east-1 --stack-name semcomp-rehearsal`.
- [ ] Aguardar `stack-delete-complete`.
- [ ] Confirmar ausência de EC2, EBS, IPv4 público, bucket e parâmetros do
  ensaio.
- [ ] Revisar Cost Explorer, Budgets, EC2, EBS, IPv4, S3 e Systems Manager.

**Aceite:** fluxos e carga passam, incluindo os dois modos de login; custo
bcrypt 12 foi registrado; backup é restaurado; a senha descartável não vazou
nem será reutilizada; evidências ficam fora da EC2 e nenhum recurso temporário
ocioso permanece gerando custo.

---

## Verificação final do Marco 9

- [ ] Login rejeita origem ausente ou incorreta.
- [ ] Logout exige sessão, CSRF e origem correta.
- [ ] Participante autentica por email + senha; CPF permanece somente como dado
  obrigatório de perfil, sem OTP ou recuperação.
- [ ] Senha de participante respeita 8–64 pontos de código e no máximo 72 bytes
  UTF-8, sem regra de composição.
- [ ] Administrador autentica em rota separada por CPF + email + senha.
- [ ] `UserSession.id` é o `jti` do JWT; heartbeat mantém uma janela online de
  120 segundos e a carga comprova 150 pessoas distintas.
- [ ] Presença persiste somente um resumo diário por data operacional, com
  retenção de 24 meses; sessões encerradas/expiradas têm retenção de 30 dias.
- [ ] Overview, histórico diário e CSV `GERAL` + `DIARIO` não expõem PII nem
  histórico por minuto.
- [ ] Identidade inexistente, role incorreta, conta inativa, hash ausente e senha
  errada produzem erro público genérico equivalente.
- [ ] `bcrypt` v6 usa APIs assíncronas, salt automático e custo 12 validado por
  benchmark na `m7i-flex.large`.
- [ ] Senhas administrativas respeitam 12–64 caracteres e no máximo 72 bytes
  UTF-8, sem truncamento ou normalização.
- [ ] Nenhum DTO, JWT, cookie, log, relatório, seed ou parâmetro expõe senha ou
  `passwordHash`.
- [ ] Bootstrap/reset administrativo recebe a senha sem eco e por `stdin` via
  Session Manager, nunca por argumento ou variável de ambiente.
- [ ] Rate limiting usa HMAC para autenticação e ID interno após login.
- [ ] Abuso retorna `429` e `Retry-After`.
- [ ] 150 participantes no mesmo NAT não são bloqueados.
- [ ] Login/cadastro não revelam qual identificador já existe.
- [ ] Helmet, limites de body e headers do ensaio estão ativos sem HSTS.
- [ ] `X-Forwarded-For` forjado não contorna os limites.
- [ ] Containers usam os controles de menor privilégio definidos.
- [ ] Swagger está desabilitado no ensaio.
- [ ] `GET /api/health` comprova acesso ao PostgreSQL.
- [ ] Seed `admin-only` é configurável, idempotente, não recebe senha e preserva
  o hash existente.
- [ ] Imagens Docker são reproduzíveis a partir de commit limpo.
- [ ] Nginx publica web e API na mesma origem.
- [ ] PostgreSQL não possui porta pública.
- [ ] Migration usa `prisma migrate deploy`.
- [ ] Backup externo foi restaurado com sucesso.
- [ ] Teste de 150 participantes respeita todos os limites.
- [ ] `m7i-flex.large` foi mantida ou a mudança para `t3.xlarge` possui
  evidência.
- [ ] Nenhum dado real foi usado.
- [ ] A senha administrativa do ensaio é descartável e não será reutilizada em
  staging ou produção.
- [ ] EC2, EBS, IPv4, bucket e parâmetros temporários foram removidos.
- [ ] Domínio, TLS, DNS estável, staging final e go-live permanecem no Marco 14.

## Handoff de execução

Opções:

1. **Subagent-driven development:** uma tarefa por agente, com revisão entre
   commits.
2. **Execução inline:** lotes pequenos, com checkpoint antes de qualquer ação
   AWS.

Em ambos os casos, a Tarefa 13 exige confirmação humana da conta e da região
antes de provisionar ou destruir recursos.
