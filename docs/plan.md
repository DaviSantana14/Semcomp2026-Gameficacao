# Semcomp Gamification — Roadmap Operacional

## Leitura atual

O `context.md` representa a visão alvo do projeto: arquitetura desejada, decisões
de produto e módulos planejados. Ele não deve ser interpretado como estado atual
implementado.

O projeto ainda está em estágio inicial. A prioridade agora é chegar a um MVP
end-to-end testável, com participante conseguindo entrar, ver seus dados,
resgatar um código e acompanhar pontos/XP.

Regra central:
- `points` é exclusivamente moeda gastável da lojinha.
- `xp` é exclusivamente progresso competitivo, usado para ranking e nível.
- Actions incrementam `points` e `xp`.
- Rewards debitam apenas `points`.
- Cancelamentos de rewards devolvem apenas `points` e `stock`.
- Todo ranking é feito por `xp`, nunca por saldo de `points`.

## MVP demo/local

Objetivo: validar o fluxo principal em localhost.

Inclui:
- Auth funcional com email + senha para participantes, mantendo CPF como dado
  obrigatório de perfil, sem usá-lo como credencial.
- Sessão por cookie httpOnly com JWT expira em 8h.
- Usuário participante.
- Admin básico para criar actions.
- Campo `code` reutilizável em `Action`.
- Resgate de action por código.
- Pontos e XP atualizados.
- Frontend mínimo consumindo a API.
- Ranking geral simples por `User.xp`.

Não incluía obrigatoriamente no primeiro corte:
- Lojinha completa.
- Claim codes de uso único.
- Dashboard admin completo.
- Deploy real.
- Regras refinadas de level.
- QR codes.

## Marco 1 — Núcleo confiável do backend

Objetivo: garantir que o backend mínimo esteja correto o bastante para sustentar
o primeiro fluxo end-to-end.

Tarefas:
- Migrar auth atual para JWT via cookie httpOnly.
- Remover `accessToken` do body do login.
- Retornar `{ user, csrfToken }` no login.
- Criar `GET /auth/csrf` para recuperar o token CSRF da sessão após refresh.
- Configurar CORS com `credentials: true` e origem do frontend.
- Configurar JWT e cookie com expiração de 8h.
- Centralizar política de cookie por ambiente:
  - local/dev: `COOKIE_SAME_SITE=lax` e `COOKIE_SECURE=false`;
  - teste Vercel + Render: `COOKIE_SAME_SITE=none` e `COOKIE_SECURE=true`;
  - produção same-site: `COOKIE_SAME_SITE=lax` e `COOKIE_SECURE=true`.
- Exigir `X-CSRF-Token` em mutações autenticadas.
- Manter `GET`, `HEAD` e `OPTIONS` livres da checagem CSRF.
- Ajustar Swagger para refletir o modo real de autenticação.
- Adicionar proteção forte contra resgate duplicado de action no banco.
- Garantir que o resgate de action seja atômico e seguro contra requisições simultâneas.
- Criar testes para helper de cookie, `CsrfGuard`, register, login, `/users/me`, criação de action, resgate de action, action inativa, duplicidade e permissões admin.

Critério de aceite:
- Backend compila, lint passa e testes críticos passam.
- Um usuário consegue se cadastrar/logar/resgatar uma action sem duplicidade.
- Login não retorna JWT no body; mutações autenticadas usam cookie httpOnly + `X-CSRF-Token`.
- Admin consegue criar/listar actions e usuários conforme permissões.

## Marco 2 — Frontend mínimo e sessão

Objetivo: sair do template inicial do Next.js e ter login/home reais consumindo a
API. O frontend também deve priorizar adesão, com cadastro simples e dark mode
arcade tech alinhado ao contexto gamificado do evento.

Tarefas:
- Instalar apenas bibliotecas necessárias no início:
  - shadcn/ui
  - lucide-react
  - react-hook-form
  - zod
  - @hookform/resolvers
  - @tanstack/react-query
  - sonner
- Deixar `recharts`, `nuqs` e `date-fns` para quando houver necessidade real.
- Criar layout base da aplicação em dark mode arcade tech.
- Implementar `/login` com email + senha.
- Implementar `/cadastro` com nome, CPF, email e senha.
- Após cadastro bem-sucedido, fazer login automático e enviar para `/home`.
- Persistir sessão via cookie httpOnly, usando chamadas com credentials.
- Criar proteção de navegação com Next Middleware/Proxy:
  - `/login` pública.
  - `/cadastro` pública.
  - rotas autenticadas redirecionam para `/login` se não houver cookie.
  - Middleware é checagem otimista de sessão, não autorização definitiva.
  - Para teste cross-site Vercel + Render, permitir desativar a checagem visual via `AUTH_PROXY_ENABLED=false`.
- Manter autorização real no backend via `JwtAuthGuard` e `RolesGuard`.
- Criar `/home` com nome, nível, XP, pontos, progresso para próximo nível e atalhos.

Critério de aceite:
- Participante consegue se cadastrar e logar pelo navegador, com o banco local ligado.
- `/home` carrega dados reais de `/users/me`.
- Rotas protegidas não exibem conteúdo antes do redirect.
- Backend continua sendo a fonte real de autorização.

## Marco 3 — Código reutilizável em Action

Objetivo: aproximar o MVP do uso real no evento com resgate por código simples.

Tarefas:
- Adicionar campo opcional `code` em `Action`.
- Garantir unicidade de `code` quando preenchido.
- Permitir resgate por código reutilizável.
- Manter regra: vários participantes podem usar o mesmo código, mas cada participante só pode resgatar a mesma action uma vez.
- Atualizar frontend para fluxo “Resgatar código”.
- Criar `/admin` mínimo para admin criar action com código.
- Mostrar estados de loading, sucesso, código inválido, action inativa e action já resgatada.

Critério de aceite:
- Admin cria action com código.
- Participante digita código e recebe `points` + `xp`.
- Duplicidade é bloqueada mesmo com requisições simultâneas.
- Código reutilizável funciona para check-in, stand ou presença.
- Claim codes de uso único continuam fora deste marco.

## Marco 4 — Ranking geral simples

Objetivo: adicionar competição básica depois que resgate por código já estiver
funcionando.

Status: ✅ implementado.

Tarefas:
- Criar endpoint de ranking geral baseado em `User.xp`.
- Retornar top N e posição do usuário logado.
- Criar `/ranking` no frontend.
- Não usar saldo de `points` para ranking.
- Adiar ranking diário até o fluxo base estar validado.

Critério de aceite:
- Ranking geral mostra participantes ordenados por XP.
- Dados batem com os resgates realizados.
- Usuário fora do top N ainda vê sua própria posição.

## Marco 5 — Ranking diário

Objetivo: adicionar ranking diário sem misturar moeda da loja com progresso
competitivo.

Status: ✅ implementado.

Tarefas:
- Implementar `period=daily|all`.
- Para `all`, usar `User.xp`.
- Para `daily`, somar apenas eventos que concedem XP, inicialmente `ACTION_REDEEM`.
- Não contar débitos de reward nem créditos de estorno/cancelamento.
- Manter XP derivado dos resgates neste marco; persistir `xpDelta` somente no Marco 10, quando ajustes administrativos de XP exigirem auditoria própria.

Critério de aceite:
- Ranking diário reflete XP ganho no dia.
- Movimentações da lojinha não alteram ranking.
- Regra continua clara: ranking é XP, loja é points.

## Marco 6 — Rewards e lojinha

Objetivo: permitir troca de pontos por recompensas com controle operacional
mínimo.

Status: ✅ implementado.

Tarefas:
- Criar modelo de `Reward`.
- Criar modelo de `RewardRedemption` com status `PENDING`, `DELIVERED`, `CANCELLED`.
- Implementar catálogo de rewards.
- Implementar resgate debitando apenas `points`, nunca `xp`.
- Criar `/lojinha` no frontend.
- Criar fluxo administrativo mínimo para marcar entrega.
- Garantir transação para saldo, estoque e status.
- Impedir estoque negativo e cancelamento duplicado.

Critério de aceite:
- Participante resgata recompensa se tiver saldo suficiente.
- Staff/admin consegue marcar recompensa como entregue.
- Cancelamento devolve apenas `points` e `stock`, sem alterar XP.

## Marco 7 — Claim codes de uso único

Objetivo: suportar ações que exigem validação individual, como perguntas,
dinâmicas ou premiações pontuais.

Tarefas:
- Criar modelo `ClaimCode` vinculado a uma `Action`.
- Implementar geração em lote de códigos.
- Marcar código como usado após resgate.
- Impedir reuso global do mesmo código.
- Integrar resgate por código de uso único no frontend.

Critério de aceite:
- Código de uso único só pode ser usado uma vez no total.
- Admin consegue gerar lote de códigos.
- Participante recebe `points` + `xp` ao usar código válido.

## Marco 8 — Admin dashboard -> implementado

Objetivo: dar visibilidade operacional para organização do evento.

Tarefas:
- Criar `AdminModule`.
- Implementar métricas agregadas básicas: total de usuários, actions resgatadas, pontos emitidos, rewards pendentes.
- Criar `/admin` no frontend.
- Adicionar listagens úteis para operação: participantes, actions, rewards pendentes.
- Adicionar detalhe operacional do participante com resumo da conta, extrato de pontos/XP, origem dos resgates e histórico da lojinha.

Critério de aceite:
- Admin tem uma visão suficiente para acompanhar o evento.
- Rotas admin permanecem protegidas por role no backend.

## Marco 9 — Prontidão para produção e ensaio temporário na AWS

Objetivo: preparar um deploy reproduzível na infraestrutura definitiva da AWS e
executar um ensaio hospedado de curta duração, sem manter um ambiente de staging
ocioso durante o mês anterior ao evento. Este marco valida bootstrap, aplicação,
banco, autenticação básica e capacidade; domínio, TLS e go-live permanecem no
Marco 14.

### Decisões de infraestrutura

- Usar uma única EC2 para frontend Next.js, API NestJS e PostgreSQL neste evento.
- Manter o CPF como dado obrigatório e único do perfil, mas autenticar
  participantes somente por email + senha; não oferecer OTP, envio de email ou
  recuperação de senha.
- Senhas de participantes aceitam qualquer Unicode e espaços, sem trim ou regra
  de composição, com 8–64 pontos de código Unicode e no máximo 72 bytes UTF-8.
- Exigir CPF + email + senha somente dos administradores. Armazenar apenas hash
  `bcrypt` v6, calculado de forma assíncrona com custo inicial 12; gerar o salt
  pela própria biblioteca e revisar o custo com benchmark na `t3.large`.
- Senhas administrativas devem ter de 12 a 64 caracteres e no máximo 72 bytes
  em UTF-8, limite que precisa ser rejeitado antes do hash para evitar o
  truncamento silencioso do bcrypt.
- O administrador inicial define a senha por um comando de bootstrap executado
  via Session Manager. Recuperação administrativa é manual e auditável, sem
  email; senha em claro nunca entra em seed, variável de ambiente, argumento de
  processo, log ou banco.
- Começar com `t3.large` (2 vCPU e 8 GiB); usar `t3.xlarge` somente se o teste de
  carga demonstrar necessidade.
- Colocar Nginx na entrada, servindo frontend e API na mesma origem.
- Persistir o PostgreSQL em EBS e mantê-lo acessível somente pela rede interna da
  máquina/containers; a porta `5432` nunca fica pública.
- Permitir que o primeiro ensaio use o IPv4 ou DNS público fornecido pela EC2,
  sem exigir domínio.
- Encerrar ou remover os recursos temporários depois do ensaio para preservar os
  créditos AWS. O ambiente será recriado na preparação final.

### Prontidão antes do ensaio

- Corrigir a proteção CSRF incompleta de login e logout antes de expor a
  aplicação na internet.
- Separar o login participante do login administrativo: o primeiro aceita
  somente email + senha; o segundo exige CPF + email + senha e retorna erro
  genérico para identidade inexistente, conta sem senha, senha incorreta ou
  conta inativa.
- Adicionar `bcrypt` v6 à API, usar somente `hash()`/`compare()` assíncronos e
  validar a política de senha antes de executar o hash. Uma comparação dummy
  deve reduzir diferenças observáveis quando o administrador ou o hash não
  existir.
- Criar bootstrap/reset administrativo por entrada interativa sem eco,
  executado dentro da EC2 via Session Manager. O seed cria a identidade
  administrativa sem senha e ela permanece incapaz de autenticar até o
  bootstrap.
- Adicionar rate limiting no Nginx e no NestJS. Limites de autenticação usam
  chave HMAC derivada do email do participante ou de CPF + email do
  administrador; rotas autenticadas usam o ID do usuário. CPF e email nunca
  entram em claro nas chaves, métricas ou logs.
- Não usar somente IP como chave de limitação, pois participantes no mesmo
  Wi-Fi podem compartilhar o IP público. O IP continua como proteção grosseira
  no Nginx, com limites compatíveis com 150 participantes.
- Configurar o NestJS para confiar somente no salto do Nginx e fazer o Nginx
  sobrescrever `X-Forwarded-For`, impedindo bypass por header forjado.
- Aplicar Helmet, remover identificação desnecessária do servidor, limitar
  bodies JSON a 128 KiB e aceitar somente content types previstos.
- Retornar mensagens públicas genéricas em login e cadastro, sem informar se o
  CPF ou o email individualmente já existe.
- Aplicar headers contra clickjacking, MIME sniffing e vazamento de referrer.
  HSTS permanece desabilitado no ensaio HTTP e só entra com TLS no Marco 14.
- Endurecer containers com usuário não root, `no-new-privileges`, capabilities
  mínimas, filesystem somente leitura quando compatível e sem acesso ao Docker
  socket.
- Separar e documentar variáveis de ambiente para local, ensaio temporário e
  produção, sem reutilizar secrets ou dados reais do evento.
- Restringir ou desabilitar Swagger fora do ambiente de desenvolvimento.
- Criar processo reproduzível de provisionamento e deploy da aplicação na EC2,
  evitando configuração manual não documentada.
- Automatizar build, inicialização dos serviços, aplicação de
  `prisma migrate deploy` e criação idempotente do administrador inicial.
- Configurar reinício automático dos serviços e uma verificação simples de
  saúde da aplicação.
- Definir backup automatizado do PostgreSQL para armazenamento externo à EC2 e
  documentar o procedimento de restauração.
- Criar AWS Budget e acompanhar consumo de créditos, computação, EBS, IPv4 e
  armazenamento de backup.

### Ensaio temporário na AWS

- Criar uma EC2 `t3.large` descartável com EBS e Security Group expondo somente
  as portas web necessárias; acesso administrativo deve ser restrito.
- Subir Nginx, frontend, API e PostgreSQL pelo processo documentado.
- Para o ensaio sem domínio, usar HTTP com configuração exclusiva de teste
  (`COOKIE_SECURE=false` e `COOKIE_SAME_SITE=lax`). Essa configuração não é
  válida para o go-live e não substitui a validação posterior de HTTPS.
- Aplicar migrations em banco vazio, executar o seed/admin inicial e repetir o
  procedimento para comprovar idempotência.
- Definir uma senha administrativa descartável pelo bootstrap via Session
  Manager e acessar a interface administrativa preferencialmente por túnel do
  Session Manager. Essa senha não pode ser reutilizada no staging final ou na
  produção.
- Rodar manualmente cadastro, login, logout, home, resgate de código, ranking,
  lojinha e principais operações administrativas.
- Demonstrar backup e restauração usando somente dados descartáveis do ensaio.
- Executar teste de carga representando 150 participantes simultâneos:
  - 150 sessões autenticadas;
  - heartbeat a cada 60 segundos por pelo menos 130 segundos;
  - uma linha de resumo diário e 150 participantes distintos online;
  - 150 acessos a home/ranking distribuídos em 10 segundos;
  - 50 a 100 resgates quase simultâneos;
  - acessos administrativos concorrentes em baixa quantidade.
- Registrar latência, erros, CPU, memória, disco, conexões do PostgreSQL,
  `CPUCreditBalance`, créditos excedentes da instância e contagens de `401`,
  `403` e `429`, sem registrar PII.
- Demonstrar que o rate limiting bloqueia abuso, não pode ser burlado por
  `X-Forwarded-For` e não bloqueia 150 participantes atrás do mesmo NAT.
- Encerrar o ensaio removendo EC2, EBS, IPv4/Elastic IP e demais recursos
  descartáveis que gerem custo, preservando apenas scripts, documentação,
  backups necessários e o relatório de validação.

Critério de aceite:
- Uma EC2 limpa pode ser provisionada novamente seguindo apenas o processo
  versionado e documentado.
- O fluxo participante e as operações administrativas funcionam pelo IPv4 ou
  DNS público da EC2 com dados de teste.
- Migrations e seed/admin inicial são repetíveis e verificáveis.
- PostgreSQL não fica publicamente acessível, persiste em EBS e pode ser
  restaurado a partir de backup externo à instância.
- No teste de 150 participantes, a taxa de erro fica abaixo de 1%, leituras
  permanecem com p95 abaixo de 800 ms e mutações com p95 abaixo de 1 segundo.
- Durante o teste, memória permanece abaixo de 75%, CPU não fica sustentada
  acima de 80% e não ocorrem timeouts por esgotamento de conexões do banco.
- Rate limiting retorna `429` e `Retry-After` nos limites definidos, mas o
  cenário válido de 150 participantes não recebe `429`.
- Respostas de autenticação/cadastro não revelam qual identificador já existe e
  nenhuma chave ou log contém CPF/email em claro.
- Participantes entram com email + senha, mantendo CPF apenas no perfil;
  administradores não entram sem senha ou com senha incorreta, e somente hashes
  bcrypt aparecem no banco.
- O bootstrap recebe a senha sem eco e sem argumento/variável de ambiente, e
  nenhum seed, parâmetro, artefato ou log contém a senha administrativa em
  claro.
- O ensaio não usa domínio, credenciais, banco ou dados reais do evento.
- Ao final, não permanecem recursos ociosos desnecessários consumindo os
  créditos AWS.
- Domínio final, TLS, cookies seguros, DNS estável, separação definitiva entre
  staging e produção e autorização de go-live continuam obrigatórios no
  Marco 14.

## Marco 10 — Auditoria e correções operacionais

Objetivo: permitir correções excepcionais com rastreabilidade depois que a
operação principal estiver estável, transformando `PointEvent` e o histórico
administrativo em um livro-caixa reconciliável e resistente a repetição,
concorrência, edição ou exclusão acidental.

Tarefas:

### Fundação do histórico

- Criar `AdminAuditEvent` append-only com administrador responsável, ator `SYSTEM` quando não houver pessoa, operação, tipo/id da entidade, participante relacionado quando aplicável, valores anteriores/novos, justificativa, `requestId` e data.
- Usar tipos/enums fechados para operação e entidade; não depender de textos livres para filtrar ou interpretar o histórico.
- Evoluir `PointEvent` com `xpDelta`, vínculo opcional com `AdminAuditEvent`, chave de idempotência e autor da operação quando a origem for administrativa.
- Adicionar `PointEvent.rewardRedemptionId` para ligar débito e estorno ao pedido correspondente.
- Adicionar em `RewardRedemption` os instantes `deliveredAt`/`cancelledAt` e o administrador responsável pela transição.
- Corrigir a apresentação de `LEGACY_UNKNOWN`: evento antigo sem origem comprovável deve aparecer como origem histórica desconhecida, nunca como resgate direto.
- Fazer migration com backfill explícito; valores impossíveis de provar permanecem desconhecidos em vez de serem inferidos pelo estado atual das entidades.

### Auditoria transacional das operações administrativas

- Gravar a alteração de negócio e o `AdminAuditEvent` na mesma transação PostgreSQL; falha da auditoria deve reverter a operação e falha da operação não pode deixar auditoria de sucesso.
- Implementar auditoria explicitamente nos services/repositories de domínio, onde existem estado anterior, estado posterior e contexto de negócio; não depender apenas de interceptor HTTP.
- Auditar ativação/desativação de participante.
- Auditar criação/edição/ativação de Action e ativação do código reutilizável, registrando apenas os campos realmente alterados.
- Auditar geração de lote e ativação/desativação de Claim Codes; o lote gera um evento resumido com Action, quantidade e identificador do lote, sem criar um registro administrativo redundante por código.
- Auditar criação/edição/ativação de Reward, incluindo custo e estoque anterior/posterior.
- Auditar entrega e cancelamento de RewardRedemption, incluindo responsável, instante e efeitos em points/stock.
- Auditar ajustes e reversões de points/XP.
- Nunca armazenar cookies, JWT, CSRF, headers completos ou outros segredos. CPF/email só podem aparecer quando indispensáveis e devem ser minimizados ou mascarados nos snapshots.

### Ajustes manuais e reversões

- Criar `POST /admin/participants/:id/adjustments` com `pointsDelta`, `xpDelta`, justificativa obrigatória e chave de idempotência.
- Exigir ao menos um delta diferente de zero e mostrar/retornar os saldos anterior e posterior.
- Impedir resultado negativo de points; permitir redução de XP somente como correção explicitamente justificada.
- Não alterar `level` enquanto os thresholds de nível não estiverem definidos.
- Aplicar atualização de `User`, criação de `PointEvent` e criação de `AdminAuditEvent` na mesma transação.
- Tratar repetição da mesma chave de idempotência como a mesma operação, sem aplicar novamente os deltas.
- Proibir edição ou exclusão de ajuste. Corrigir erro criando evento compensatório ligado por `reversalOfPointEventId`, com deltas opostos, nova justificativa, autor e data.
- Permitir apenas uma reversão efetiva por evento e tornar a reversão também idempotente.

### Reconciliação e preservação

- Calcular points esperados pela soma de `PointEvent.points` e XP esperado pela soma de `PointEvent.xpDelta`; comparar ambos com `User.points`/`User.xp`.
- Criar visão administrativa somente leitura com quantidade de divergências, participante, saldo armazenado, saldo calculado e diferença.
- Disponibilizar reconciliação individual no detalhe do participante e resumo de inconsistências no dashboard admin.
- Corrigir divergências somente por evento compensatório auditado; nunca executar `UPDATE` silencioso de saldo.
- Remover exclusão em cascata capaz de apagar `PointEvent` junto com `User`; participantes permanecem desativáveis, não fisicamente removíveis pela aplicação.
- Impedir `UPDATE`/`DELETE` de `AdminAuditEvent` e `PointEvent` pelos fluxos da aplicação e adicionar proteção no banco para preservar o caráter append-only.
- Definir retenção, anonimização e acesso aos registros sem destruir a cadeia financeira/operacional.

### Consulta administrativa

- Exibir no detalhe do participante uma linha do tempo com ajustes, reversões, autor, justificativa, deltas, antes/depois, pedido/Action relacionado e `requestId`.
- Criar visão global paginada com filtros por administrador, ator `SYSTEM`, operação, entidade, participante, período e `requestId`.
- Manter CPF mascarado por padrão e não retornar snapshots sensíveis além do necessário para a tela.
- Mostrar estados independentes de loading, erro, vazio e retry, sem permitir mutação pela tela de histórico.

### Testes e garantias

- Testar rollback quando a escrita da auditoria falha e ausência de auditoria falsa quando a mutação falha.
- Testar concorrência e repetição de ajustes/reversões com a mesma chave de idempotência.
- Testar limites de saldo, redução justificada de XP, tentativa de alterar level e tentativa de ajustar conta admin.
- Testar reconciliação correta e detecção controlada de divergência criada por fixture.
- Testar vínculo entre RewardRedemption, débito, estorno, entrega/cancelamento e administrador responsável.
- Testar que registros append-only não podem ser editados ou removidos pela aplicação.
- Testar filtros, paginação, autorização e minimização de dados das consultas administrativas.

Critério de aceite:
- Toda mutação administrativa coberta identifica quem fez, quando fez, por que fez, qual requisição originou a ação e o que mudou.
- Mutação e auditoria são atômicas: ambas persistem ou ambas fazem rollback.
- Ajustes e reversões são idempotentes, append-only e não permitem points negativos.
- Nenhum saldo é corrigido por edição direta; toda diferença possui `PointEvent` compensatório e `AdminAuditEvent` correspondente.
- Points e XP armazenados podem ser comparados ao histórico, e divergências aparecem no dashboard e no detalhe do participante.
- Débito e estorno da lojinha apontam para a mesma RewardRedemption e preservam autor/datas das transições.
- `LEGACY_UNKNOWN` continua explicitamente desconhecido.
- Nenhum administrador consegue editar ou apagar `PointEvent`/`AdminAuditEvent`, e exclusão de participante não destrói histórico.
- A visão por participante e a visão global permitem localizar operações sem expor segredos ou PII desnecessária.
- Unit tests, testes de repository/service, e2e, lint e builds passam sem regressões.

Fora deste marco:
- Aprovação por dois administradores para ajustes.
- Exportações individuais de participantes e operações em lote, previstas no
  Marco 12; o CSV agregado de presença pertence ao Marco 11.
- Perfis administrativos especializados, previstos no Marco 13.
- Analytics avançado ou alertas por serviços externos.

## Marco 11 — Presença e métricas operacionais do evento

Objetivo: medir utilização real sem confundir telemetria com auditoria,
preservando quantas pessoas estavam online, quando ocorreu o pico simultâneo e
quantos participantes estavam cadastrados naquele momento.

Tarefas:

### Sessões e presença

- Criar `UserSession` identificada por um UUID cujo próprio valor é o `jti`,
  vinculada ao usuário, com início, último heartbeat, expiração, encerramento e
  motivo de encerramento.
- Emitir um UUID/`jti` distinto em cada login e registrar a sessão antes de
  concluir a autenticação.
- Encerrar a sessão atual no logout; fechamento de navegador ou perda de conexão expira por ausência de heartbeat.
- Criar heartbeat autenticado e idempotente para atualizar `lastSeenAt` aproximadamente a cada 60 segundos.
- Considerar online somente sessão de participante ativa cujo último heartbeat ocorreu dentro da janela de 2 minutos e cujo JWT ainda não expirou.
- Contar pessoas online por `COUNT(DISTINCT userId)`, não por aba, heartbeat ou dispositivo.
- Excluir contas `ADMIN` de cadastros, presença, logins e picos de participantes.
- Evitar que múltiplas abas da mesma sessão aumentem a contagem; múltiplos dispositivos continuam representando uma única pessoa online.

### Resumo diário e histórico

- Criar somente `PresenceDailySummary`, com uma linha por dia operacional de
  São Paulo, armazenando a última observação e preservando o pico do dia.
- Atualizar essa linha de forma atômica no coletor de minuto; não criar
  `OperationalMetric`, `PresenceSample`, histórico por minuto, granularidade ou
  paginação de presença.
- Calcular pessoas online agora, pico simultâneo geral, horário do pico e pico
  por dia a partir dos resumos diários retidos.
- Calcular cadastros totais e novos cadastros do dia usando `User.createdAt`; o
  resumo também guarda o total cadastrado no momento do pico.
- Calcular logins únicos do dia a partir de `UserSession`, contando
  participantes distintos.
- Definir timezone operacional explicitamente como `America/Sao_Paulo`, mantendo
  timestamps persistidos em UTC e datas operacionais em `date`.

### Dashboard administrativo

- Adicionar ao dashboard cards de online agora, pico simultâneo, horário do pico, cadastrados totais e novos cadastros do dia.
- Criar visão histórica básica com período selecionável, pico por dia e cadastros por hora/dia; gráficos sofisticados continuam fora deste marco.
- Exibir junto do pico quantos participantes estavam cadastrados naquele instante.
- Informar claramente a janela usada para considerar alguém online e o horário da última atualização.
- Mostrar estado degradado quando o coletor de métricas estiver atrasado, sem apresentar dado antigo como tempo real.
- Expor overview atual/geral, histórico diário sem paginação e um CSV agregado
  com uma linha `GERAL` e linhas `DIARIO` filtradas; o arquivo usa BOM UTF-8,
  separador `;`, CRLF e não contém identificadores individuais.

### Retenção, privacidade e robustez

- Manter heartbeat fora de `AdminAuditEvent`: presença é telemetria, não ação administrativa.
- Não armazenar rota visitada, conteúdo digitado, IP completo ou user-agent completo para calcular presença.
- Reter sessões encerradas/expiradas por 30 dias e resumos diários por 24 meses;
  a limpeza não pode apagar os picos dentro da retenção.
- Criar índices para sessão ativa por `userId`/`lastSeenAt` e para a data do
  resumo diário.
- Garantir que falha no heartbeat não derrube a sessão imediatamente; o participante fica offline somente após ultrapassar a janela definida.

### Testes e garantias

- Testar login, heartbeat, logout, expiração e sessão sem heartbeat.
- Testar múltiplas abas, múltiplos dispositivos e contagem distinta por participante.
- Testar exclusão de admins e participantes inativos.
- Testar concorrência na mesma amostra de minuto e preservação do maior valor observado.
- Testar cálculo do pico geral/diário, horário do pico, cadastrados naquele instante e virada de dia no timezone do evento.
- Testar dashboard, estados de atraso/erro e autorização dos endpoints.

Critério de aceite:
- Dashboard informa pessoas online agora com atraso máximo compatível com heartbeat de 60 segundos e janela de 2 minutos.
- Abas ou dispositivos adicionais não contam a mesma pessoa mais de uma vez.
- Pico simultâneo geral e diário permanece registrado com data, hora e total de cadastrados naquele instante.
- Cadastros por período e logins únicos excluem administradores.
- Reinício ou múltiplas instâncias da API não apagam nem duplicam resumos
  diários.
- Nenhum heartbeat individual é usado como log permanente de navegação.
- Unit tests, e2e, lint e builds passam sem regressões.

Fora deste marco:
- Rastreamento de páginas, cliques ou comportamento individual.
- Analytics avançado, funis, mapas de calor ou integração com ferramentas externas.
- Alertas por email/WhatsApp quando um pico ocorrer.

## Marco 12 — Operação em escala e exportações (em validação)

Objetivo: reduzir trabalho repetitivo quando o volume real de participantes e
códigos justificar automações em lote, mantendo os fluxos do evento dentro dos
limites de latência e privacidade.

Entregas do marco:

- Exportações de participantes, resgates de códigos, movimentações e pedidos
  reutilizam os filtros aplicados nas telas e os limites de 50.000 linhas/25 MiB.
- Lotes de Claim Codes, operações em massa e redownloads permanecem rastreáveis;
  PDF/ZIP reproduzem os códigos persistidos sem regeneração.
- PDFs/ZIPs e CSVs são derivados sob demanda, com no máximo uma geração QR e
  duas gerações CSV simultâneas por processo.
- O leitor de câmera exige gesto explícito, HTTPS hospedado e confirmação antes
  do resgate; a entrada manual permanece disponível.
- O ensaio Marco 12 executa 150 participantes em paralelo com um administrador
  gerando 500 Claim Codes, baixando CSV/PDF/ZIP, consultando métricas agregadas
  e verificando que o segundo QR simultâneo recebe `429`/`Retry-After`.
- O relatório registra latência, status, bytes/contagens de artefatos e apenas
  contadores agregados de `401`/`403`/`429`; códigos, PII, cookies e tokens não
  são serializados.
- CI executa o contrato de carga, a migration do Marco 12, os testes de QR/PDF/
  ZIP e constrói as imagens Docker com a tag `marco12`.

O Marco 12 só deve ser marcado como implementado depois que o gate automatizado
e o ensaio hospedado reduzido passarem. O check manual de câmera continua
dependente de dispositivos Android/iPhone em HTTPS.

## Marco 13 — Permissões administrativas especializadas

Objetivo: permitir que mais pessoas operem o evento sem conceder acesso total a
todas as áreas administrativas.

Documentos de execução:
- Especificação completa:
  `docs/superpowers/specs/2026-08-23-marco-13-specialized-admin-permissions-design.md`.
- Plano completo:
  `docs/superpowers/plans/2026-08-23-marco-13-specialized-admin-permissions.md`.

### Perfis e autorização

- Manter `UserRole.ADMIN` como identidade administrativa e adicionar os perfis
  fixos `GENERAL`, `SHOP` e `ACTIVITIES`.
- Definir uma matriz estática de capacidades: administrador geral tem acesso
  completo; lojinha acessa apenas catálogo e transições de resgates;
  atividades/códigos acessa apenas actions, códigos reutilizáveis e claim codes.
- Aplicar autorização por capacidade em todas as rotas administrativas do
  backend. Navegação filtrada e redirects no frontend são somente complemento
  visual e não substituem a validação da API.
- Restringir CPF, email, detalhe de participante, ajustes financeiros/pontos,
  reconciliação, auditoria, presença, segurança e exportações com PII ao
  administrador geral. Telas operacionais recebem apenas ID e nome necessários.

### Cadastro e ciclo de vida de operadores

- Permitir que um administrador geral cadastre outros administradores gerais,
  operadores da lojinha e operadores de atividades/códigos.
- Provisionar cada novo operador como pendente, com código de ativação de uso
  único, pelo menos 100 bits de entropia, validade de 1 hora, armazenamento
  somente do hash e exibição única, sem email e sem código na URL.
- Exigir que o operador informe código, CPF e email e defina a própria senha na
  página pública de ativação por HTTPS. A ativação não inicia sessão e o código
  nunca funciona como senha posterior.
- Permitir correção auditada de identidade/perfil, bloqueio, desbloqueio,
  desativação e reset administrativo. Bloqueio/desativação e mudança de perfil
  revogam sessões conforme o plano.
- Fazer o reset administrativo revogar sessões e códigos anteriores, invalidar
  a senha, voltar a conta para pendente e emitir uma nova ativação de 1 hora.
- Impedir, inclusive sob concorrência, que o último administrador geral ativo
  seja bloqueado, desativado, resetado ou movido para outro perfil.
- Manter o bootstrap via Session Manager como recuperação de emergência quando
  não existir administrador geral ativo; não criar recuperação por email.

### Reset administrativo de participante

- Permitir que somente o administrador geral gere senha temporária de
  participante com exibição única e validade de 24 horas, sempre com motivo.
- Revogar sessões e substituir a credencial anterior no reset. Enquanto a troca
  estiver pendente, a sessão temporária acessa somente CSRF, logout e a definição
  da senha definitiva.
- Exigir senha definitiva diferente da temporária, revogar novamente as sessões
  ao concluir e exigir novo login. Reset expirado ou substituído falha sem
  revelar detalhes da credencial.

### Auditoria, limites e testes

- Auditar cadastro, edição, status, ativação/reset de operador e reset de
  participante no log do Marco 10, sem código, senha temporária, senha
  definitiva ou hash em snapshots/metadata.
- Aplicar limites específicos para ativação, gestão de operadores, reset de
  participante, lojinha e atividades/códigos. Mutações autenticadas usam o ID do
  operador; ativação usa chave HMAC de CPF + email sem PII em claro.
- Criar testes unitários, de arquitetura e e2e para a matriz completa, chamadas
  diretas à API, ausência de PII, ativação expirada/reutilizada/concorrente,
  ciclo de vida, último administrador geral e reset obrigatório de participante.

Critério de aceite:
- Administrador geral cadastra qualquer um dos três perfis e recebe uma única
  exibição do código de ativação válido por 1 hora.
- Equipe da lojinha opera catálogo, entregas e cancelamentos sem acessar códigos,
  participantes, pontos, auditoria, segurança, exportações ou operadores.
- Equipe de atividades/códigos opera actions e códigos sem acessar lojinha,
  participantes, pontos, auditoria, segurança, exportações ou operadores.
- Administrador geral mantém acesso completo; todas as restrições são garantidas
  no backend e chamadas diretas negadas não alteram o banco.
- Novo operador só entra depois de ativação única por HTTPS; código expirado,
  substituído, reutilizado ou submetido concorrentemente falha, e bloqueio,
  desativação ou reset encerra as sessões previstas.
- O último administrador geral ativo permanece protegido sob concorrência.
- Reset de participante invalida senha/sessões anteriores, restringe a sessão
  temporária à troca obrigatória e exige novo login com a senha definitiva.
- Nenhum código, senha ou hash aparece em banco fora do campo de hash, logs,
  auditoria, métricas, URLs, toasts ou cache de consultas.
- Prisma, testes unitários/e2e, lint e builds da API e do frontend passam.

## Marco 14 — Preparação final e go-live

Objetivo: promover uma versão já validada em staging para produção somente depois
que integridade, presença e operação estiverem prontas para o evento real.

Tarefas:
- Criar ambiente e banco de produção separados de staging.
- Configurar domínio final, TLS, HSTS, cookies `Secure`/`HttpOnly`, CORS,
  secrets e Swagger para produção.
- Validar CSP em modo report-only no staging e promover uma política compatível
  para enforcement antes do go-live.
- Definir revogação de sessões e duração menor para sessões administrativas,
  preservando email + senha para participantes (com CPF somente no perfil) e
  CPF + email + senha para administradores.
- Somente depois de HTTPS estar validado, definir as senhas administrativas
  reais por bootstrap via Session Manager ou ativação de uso único. Nenhuma
  senha usada no ensaio HTTP pode ser promovida ou reutilizada.
- Se houver mais de uma instância da API, mover o estado do rate limiting para
  armazenamento compartilhado; uma única instância pode manter armazenamento
  em memória.
- Executar análise de dependências e imagens, corrigir vulnerabilidades
  altas/críticas exploráveis e registrar exceções aceitas.
- Definir e testar backup, restauração, rollback de aplicação e rollback/forward-fix de migration.
- Executar teste de carga representando login, heartbeat, resgate de código, ranking e dashboard no pico esperado.
- Validar limites de conexão do PostgreSQL, concorrência e comportamento sob indisponibilidade parcial.
- Preparar runbook do evento com responsáveis, diagnóstico, correções permitidas, contingência e contatos.
- Criar checklist de abertura/fechamento do evento e confirmar seed/admin inicial sem dados de staging.
- Executar ensaio completo em staging com participantes e operadores antes da promoção.

Critério de aceite:
- Backup e restauração foram demonstrados, não apenas configurados.
- Carga esperada não viola os limites definidos de erro e latência.
- Produção não compartilha banco, secrets ou dados com staging.
- Equipe consegue seguir o runbook para falhas de login, banco, códigos, lojinha e presença.
- Headers de produção, revogação de sessão, rate limiting e logs de abuso foram
  validados em staging sem exposição de PII.
- Fluxos administrativos de bootstrap, ativação, login, bloqueio e reset manual
  foram validados em HTTPS sem senha em claro em logs, parâmetros ou
  artefatos.
- Go-live exige checklist aprovado após ensaio completo, e não apenas build/deploy bem-sucedido.

## Fora do MVP imediato

Estes itens continuam planejados, mas não devem bloquear o primeiro MVP testável:

- Cálculo automático refinado de level.
- Código por email/WhatsApp.
- Dashboard avançado para TV do evento.
- Métricas sofisticadas e analytics.
- `xpDelta` em `PointEvent` não entra no Marco 8; fica para o Marco 10, junto dos ajustes manuais de XP.
- Exclusão física de histórico operacional, participantes, códigos ou pedidos.
