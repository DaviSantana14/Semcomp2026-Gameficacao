# Reset administrativo de senha de participantes

> Substituído para a execução do Marco 13 por
> `2026-08-23-marco-13-specialized-admin-permissions-design.md` e
> `../plans/2026-08-23-marco-13-specialized-admin-permissions.md`. Os detalhes
> deste reset permanecem incorporados nos documentos completos.

## Contexto

Participantes autenticam com email e senha, sem envio de email e sem fluxo de
recuperação automática. Quando alguém esquecer a senha, um administrador geral
precisa conseguir iniciar um reset manual sem conhecer a senha definitiva do
participante.

O projeto já possui hash assíncrono com bcrypt, política de senha de
participantes, sessões persistidas e revogáveis, proteção CSRF e auditoria
transacional de mutações administrativas. O desenho reutiliza essas fundações.

## Objetivo

Permitir que um administrador redefina a credencial de um participante para
uma senha temporária gerada pelo servidor. Essa senha será exibida uma única
vez, expirará após 24 horas e dará acesso somente ao fluxo de definição de uma
nova senha. Depois da troca, todas as sessões serão encerradas e o participante
entrará novamente com a senha definitiva.

## Escopo

- Reset iniciado somente por administrador geral no detalhe do participante.
- Senha temporária aleatória gerada no backend e exibida uma única vez.
- Validade de 24 horas e troca obrigatória no primeiro acesso.
- Restrição garantida no backend enquanto a troca estiver pendente.
- Revogação das sessões no reset e após a definição da senha definitiva.
- Motivo obrigatório e auditoria transacional do reset administrativo.
- Estados de interface para reset pendente, senha expirada e regeneração.
- Atualização do Marco 13 em `docs/plan.md`.

## Fora do escopo

- Recuperação por email, WhatsApp ou SMS.
- Pergunta de segurança ou suporte baseado em CPF.
- Troca voluntária de senha pelo participante fora do fluxo obrigatório.
- Visualização ou recuperação posterior da senha temporária.
- Histórico de senhas ou bloqueio de reutilização da senha definitiva anterior.
- Reset de senha de administradores, que continua usando o fluxo administrativo
  próprio já planejado.

## Alternativas consideradas

### Administrador digita a senha temporária

É o menor fluxo, mas permite senhas fracas ou reutilizadas e faz o segredo
trafegar como entrada do formulário administrativo. Não será adotado.

### Código de recuperação de uso único

Separa totalmente a credencial temporária da senha, porém exige uma segunda
credencial, endpoints e estados específicos. Aproxima-se do provisionamento de
operadores do Marco 13 e amplia o escopo sem necessidade para o evento atual.

### Senha temporária gerada pelo servidor

É a opção adotada. Mantém o fluxo familiar de email e senha, elimina escolha de
senha temporária pelo administrador e permite reaproveitar a política e o hash
existentes.

## Modelo de dados

O modelo `User` receberá:

- `passwordResetRequired Boolean @default(false)`;
- `passwordResetExpiresAt DateTime?`.

`passwordHash` armazenará o hash da senha temporária enquanto o reset estiver
pendente. A senha anterior deixa de funcionar imediatamente. `passwordChangedAt`
será atualizado tanto no reset quanto na definição da senha definitiva.

Não haverá persistência da senha temporária em claro. Ela será gerada com fonte
criptograficamente segura a partir de 18 bytes aleatórios codificados em
Base64URL, terá 24 caracteres ASCII e respeitará os limites atuais de 8 a 64
pontos de código e 72 bytes UTF-8.

## Contratos da API

### Iniciar ou regenerar reset

`POST /admin/participants/:id/password-reset`

Body:

```json
{
  "reason": "Participante esqueceu a senha",
  "replacePending": false
}
```

Resposta de sucesso:

```json
{
  "temporaryPassword": "senha-gerada-exibida-uma-vez",
  "expiresAt": "2026-08-24T18:00:00.000Z"
}
```

O endpoint exige sessão administrativa, CSRF, origem permitida, perfil de
administrador geral, capacidade `participants.password.reset` e motivo válido.
Enquanto a matriz de capacidades não estiver implantada, o papel `ADMIN`
existente representa o administrador geral. Se já existir reset não expirado,
`replacePending: false` retorna `409 PASSWORD_RESET_ALREADY_PENDING`.
Regeneração exige confirmação visual e `replacePending: true`; ela invalida a
senha temporária anterior e revoga novamente as sessões abertas.

A senha temporária só entra na resposta após o commit da transação e não pode
ser recuperada depois. Se a resposta for perdida, o administrador precisará
regenerá-la explicitamente.

O reset não muda `isActive`: um participante inativo continua impedido de
entrar até que um administrador o reative pelo fluxo já existente.

### Consultar estado da sessão

`GET /auth/csrf` continuará retornando o token CSRF e passará a incluir
`passwordChangeRequired`. Assim, a página de troca consegue recuperar seu
estado após refresh sem liberar `/users/me` durante a restrição.

### Definir senha definitiva

`POST /auth/password/change-required`

Body:

```json
{
  "newPassword": "senha definitiva escolhida pelo participante"
}
```

O endpoint exige a sessão iniciada com a senha temporária, CSRF e origem
permitida. A nova senha usa a política atual de participantes e não pode ser
igual à temporária. Em sucesso, o backend atualiza o hash, remove o estado de
reset, define `passwordChangedAt`, revoga todas as sessões — incluindo a atual
—, limpa o cookie e retorna `204`. O participante é enviado ao login para
entrar com a senha definitiva.

## Fluxo administrativo

1. O administrador abre o detalhe de um participante e seleciona
   “Redefinir senha”.
2. A interface explica que as sessões atuais serão encerradas e solicita motivo
   obrigatório.
3. O backend gera e calcula o hash da senha temporária antes de abrir a
   transação, evitando manter lock de banco durante o bcrypt.
4. Dentro da transação, o repositório bloqueia a linha do participante, valida
   se existe reset pendente e atualiza credencial, expiração e estado.
5. A mesma transação revoga as sessões abertas e grava o evento de auditoria.
6. Após o commit, a interface mostra a senha temporária uma única vez, com ação
   de copiar e aviso de expiração.

Duas solicitações concorrentes sem autorização para substituição não podem
produzir duas senhas aparentemente válidas: a primeira confirma o reset e a
segunda recebe conflito ao observar o estado pendente sob lock. Regenerações
explícitas seguem a ordem de commit; a última invalida as anteriores.

## Login e restrição de acesso

O login continua retornando erro genérico para email ou senha inválidos. Se a
senha temporária estiver expirada, o login também retorna a mesma resposta
genérica e não cria sessão.

Quando a senha temporária for válida, o login cria uma sessão normal marcada
pelo estado atual do usuário e retorna `passwordChangeRequired: true`. O
frontend redireciona para `/trocar-senha`.

A restrição não dependerá do frontend. O `JwtAuthGuard` consultará metadados de
rota por `Reflector` e negará qualquer endpoint autenticado enquanto
`passwordResetRequired` estiver ativo, salvo rotas explicitamente permitidas:

- `GET /auth/csrf`;
- `POST /auth/heartbeat`;
- `POST /auth/logout`;
- `POST /auth/password/change-required`.

Chamadas proibidas retornam `403 PASSWORD_CHANGE_REQUIRED`. A estratégia JWT já
valida a sessão e carrega o usuário no banco a cada requisição, portanto o
estado não dependerá de uma flag desatualizada dentro do token.

## Interface

### Administração

O detalhe do participante ganhará uma seção de credencial com:

- estado normal ou “troca obrigatória pendente até …”;
- botão “Redefinir senha”;
- diálogo de confirmação com motivo obrigatório;
- confirmação adicional para substituir um reset ainda válido;
- resultado com senha temporária, validade, botão de copiar e aviso de exibição
  única.

A senha não será colocada em toast, URL, cache de consulta, telemetria ou estado
persistido do navegador.

### Participante

A rota `/trocar-senha` terá campos de nova senha e confirmação, requisitos da
política, estados de envio e mensagens para senha inválida, senha igual à
temporária, reset expirado e conflito causado por nova redefinição do admin.

Ao concluir, a interface limpa o estado local de autenticação e redireciona
para `/login` com mensagem para entrar usando a nova senha.

## Auditoria e proteção de segredo

Será acrescentada a operação `PARTICIPANT_PASSWORD_RESET` em
`AuditOperation`, usando `PARTICIPANT` como entidade e participante relacionado.
O evento contém administrador, participante, motivo, `requestId`, data,
expiração, indicação anterior/posterior de reset pendente e quantidade de
sessões revogadas.

Senha temporária, senha definitiva e hashes nunca entram em snapshots,
metadados, exceções públicas, logs ou métricas. A allowlist da auditoria e os
testes de material proibido serão atualizados para cobrir a nova operação.

A troca feita pelo próprio participante não será registrada como uma ação
administrativa; `passwordChangedAt` registra a conclusão. Uma trilha geral de
eventos de segurança poderá ser criada futuramente sem atribuir falsamente a
troca ao administrador ou ao ator `SYSTEM`.

## Erros e limites

- Participante inexistente: `404 PARTICIPANT_NOT_FOUND`.
- Reset já pendente sem substituição explícita:
  `409 PASSWORD_RESET_ALREADY_PENDING`.
- Sessão sem reset obrigatório: `409 PASSWORD_CHANGE_NOT_REQUIRED`.
- Reset expirado ou substituído: `401 PASSWORD_RESET_INVALID` e encerramento da
  sessão temporária quando aplicável.
- Nova senha fora da política: `400 INVALID_PARTICIPANT_PASSWORD`.
- Nova senha igual à temporária: `400 PASSWORD_MUST_CHANGE`.
- Tentativa de acessar outra área: `403 PASSWORD_CHANGE_REQUIRED`.

O reset administrativo terá limite de 20 tentativas por 10 minutos para cada ID
de operador. A troca obrigatória terá limite de 5 tentativas por 15 minutos para
cada ID de participante. Ambos usarão o mecanismo de rate limiting existente,
serão cobertos por teste e não usarão CPF ou email como chave em claro.

## Testes

### Backend unitário e integração

- Geração de senha temporária dentro da política e ausência de persistência em
  claro.
- DTOs, motivo obrigatório e `replacePending`.
- Reset apenas de `PARTICIPANT`, com hash atualizado e expiração de 24 horas.
- Revogação de todas as sessões abertas.
- Auditoria na mesma transação e rollback completo quando ela falhar.
- Snapshots de auditoria sem senha, hash, cookie, JWT ou CSRF.
- Conflito para reset pendente e concorrência de duas solicitações.
- Regeneração explícita invalidando a credencial anterior.
- Login normal, login temporário válido e rejeição genérica após expiração.
- Guard bloqueando chamada direta à API e liberando somente as rotas permitidas.
- Rejeição de senha fora da política ou igual à temporária.
- Troca bem-sucedida limpando o estado e revogando todas as sessões.
- Conflito quando um novo reset ocorre durante a definição da senha definitiva.

### Frontend

- Diálogo de reset, motivo obrigatório e confirmação de regeneração.
- Senha temporária exibida somente na resposta recém-recebida.
- Redirecionamento após login temporário e após refresh da página.
- Formulário de troca, confirmação de senha e mensagens de erro.
- Limpeza da autenticação e redirecionamento ao login em sucesso.

### E2E

- Admin redefine; sessão anterior do participante recebe `401`.
- Participante entra com senha temporária e recebe
  `passwordChangeRequired: true`.
- Participante não acessa `/users/me`, ranking, lojinha ou resgates por chamada
  direta.
- Participante define senha definitiva, perde a sessão temporária e entra
  novamente com a nova senha.
- Senha antiga e senha temporária deixam de funcionar.
- Usuário sem permissão administrativa recebe `403` ao tentar o reset.

## Critérios de aceite

- Somente administrador geral consegue iniciar ou regenerar o reset.
- A senha anterior é invalidada e todas as sessões são revogadas no reset.
- A senha temporária expira em 24 horas, aparece uma única vez e nunca é
  persistida ou registrada em claro.
- O participante só consegue acessar o fluxo de troca enquanto o reset estiver
  pendente, inclusive em chamadas diretas à API.
- A senha definitiva respeita a política atual, difere da temporária e exige
  novo login após a troca.
- O reset administrativo é atômico, auditado e não expõe segredos.
- Testes unitários, de integração, e2e, lint e builds passam sem regressões.
