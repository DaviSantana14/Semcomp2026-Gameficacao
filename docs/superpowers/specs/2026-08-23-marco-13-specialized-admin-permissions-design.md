# Marco 13 — Permissões administrativas especializadas

## Objetivo

Permitir que mais pessoas operem o evento sem receber acesso administrativo
total. O administrador geral cadastra e gerencia outros administradores e
operadores. Como não haverá envio de email, ativações e recuperações são
manuais, com credenciais temporárias exibidas uma única vez.

Este documento é a fonte de verdade enxuta do Marco 13. Ele incorpora o reset
administrativo de participantes descrito anteriormente e substitui a versão
mais complexa deste mesmo documento.

## Princípios do corte

- Implementar apenas os três perfis necessários ao evento: `GENERAL`, `SHOP` e
  `ACTIVITIES`.
- Autorizar rotas diretamente por perfil, sem tabela ou matriz de capacidades.
- Usar os campos já existentes `isActive` e `passwordHash` para representar o
  ciclo de vida administrativo, sem criar um enum de quatro estados.
- Reutilizar o rate limit administrativo atual; criar limite específico apenas
  para a ativação pública.
- Testar uma rota representativa de cada domínio e todas as operações sensíveis,
  sem executar a combinação de todos os perfis contra todos os endpoints.
- Preservar as garantias que evitam perda de acesso, vazamento de credenciais e
  autorização somente visual.

## Perfis e acesso

`UserRole.ADMIN` continua separando administradores de participantes. `User`
recebe apenas `adminProfile AdminProfile?`, com os valores:

- `GENERAL`: acesso a todas as áreas administrativas, inclusive participantes,
  pontos, reconciliação, auditoria, presença, segurança, exportações e gestão de
  operadores.
- `SHOP`: acesso apenas ao catálogo da lojinha e às transições de resgates.
- `ACTIVITIES`: acesso apenas a atividades, códigos reutilizáveis e claim codes.

Participantes mantêm `adminProfile = null`. Todo usuário `ADMIN` deve ter um
perfil.

O backend usa `@AdminProfiles(...)` e `AdminProfilesGuard`. O perfil atual é
carregado do banco durante a validação da sessão, portanto inativação ou troca
de perfil vale na requisição seguinte. O JWT não armazena permissões.

O frontend recebe apenas `adminProfile`, filtra a navegação e escolhe a página
inicial apropriada:

- `GENERAL` → `/admin`;
- `SHOP` → `/admin/lojinha`;
- `ACTIVITIES` → `/admin/atividades`.

Links ocultos e redirects não substituem a autorização do backend.

## Estado administrativo sem enum adicional

O estado do operador é derivado de campos existentes:

- aguardando ativação: `isActive = true` e `passwordHash = null`;
- ativo: `isActive = true` e `passwordHash != null`;
- inativo: `isActive = false`, com ou sem senha armazenada.

Inativar revoga todas as sessões, mas mantém a senha. Reativar permite voltar a
usar a mesma senha. Reset administrativo revoga sessões, limpa a senha, ativa a
conta e exige uma nova ativação.

Não haverá distinção entre bloqueado e desativado, exclusão física de operador
ou estado administrativo configurável neste marco.

## Cadastro e gestão de operadores

Somente `GENERAL` acessa `/admin/operators`.

O administrador geral pode:

- listar e filtrar operadores;
- cadastrar `GENERAL`, `SHOP` ou `ACTIVITIES`;
- corrigir nome, CPF, email ou perfil;
- inativar ou reativar;
- emitir nova ativação para resetar a senha.

Toda mutação autenticada de gestão exige motivo de 10–500 caracteres e gera
auditoria. CPF e email continuam únicos. Conflitos retornam mensagem genérica
sem indicar qual campo já existe.

Alterar o perfil ou inativar revoga sessões. Alterar apenas nome, CPF ou email
também revoga sessões para que as novas informações sejam carregadas no próximo
login.

## Proteção do último administrador geral

Um administrador `GENERAL` conta como disponível quando está ativo e possui
senha. A API não permite inativar, resetar ou mudar o perfil do último general
disponível.

A verificação ocorre na mesma transação que a mutação. As linhas dos generals
disponíveis são bloqueadas em ordem estável antes da contagem, evitando que duas
requisições simultâneas removam os dois últimos administradores.

O bootstrap interativo via Session Manager continua sendo a recuperação de
emergência caso o banco chegue a um estado sem general disponível por intervenção
externa.

## Ativação administrativa

### Persistência

`AdminActivation` armazena:

- `id`;
- `adminUserId`;
- `codeHash` único;
- `expiresAt`;
- `usedAt`;
- `revokedAt`;
- `createdByAdminId`;
- `createdAt`.

O código possui 20 caracteres de um alfabeto sem caracteres ambíguos, pelo menos
100 bits de entropia e formatação em grupos para facilitar cópia. Apenas o hash
SHA-256 é persistido.

### Emissão

Ao cadastrar ou resetar um operador, a API:

1. revoga ativações pendentes anteriores;
2. cria uma ativação válida por 1 hora;
3. retorna o código em texto puro uma única vez.

O código nunca entra em email, URL, log, métrica, auditoria, toast ou cache do
TanStack Query. A interface guarda o resultado somente em estado local e o
remove ao fechar o diálogo.

### Consumo

`POST /auth/admin/activate` recebe código, CPF, email e nova senha. A rota é
pública, validada por origem e limitada a 5 tentativas por CPF+email a cada 15
minutos usando a chave HMAC já existente.

A senha administrativa mantém a política atual: 12–64 pontos de código Unicode
e no máximo 72 bytes UTF-8, com bcrypt assíncrono e custo 12.

A ativação usa transação e bloqueio da linha. Código desconhecido, expirado,
usado, revogado, identidade divergente ou conta inativa retorna o mesmo erro.
Sucesso grava a senha, marca o código como usado e retorna `204`; não inicia
sessão automaticamente.

## Rotas por perfil

As rotas existentes são agrupadas diretamente:

- somente `GENERAL`: dashboard geral, participantes, movimentações, ajustes,
  reconciliação, auditoria, presença, métricas de segurança, exportações com PII
  e operadores;
- `GENERAL` ou `SHOP`: catálogo administrativo da lojinha e entrega/cancelamento
  de resgates;
- `GENERAL` ou `ACTIVITIES`: activities, códigos reutilizáveis, claim codes,
  geração em lote e artefatos de códigos.

As respostas operacionais de lojinha e códigos retornam apenas ID e nome do
participante. CPF e email permanecem disponíveis somente nas áreas gerais de
participantes e exportações. Essa redução é aplicada ao contrato operacional
para todos os perfis, sem criar respostas condicionais por usuário.

## Reset administrativo de operador

Somente `GENERAL` pode resetar outro operador. O reset:

- verifica a proteção do último general;
- revoga todas as sessões;
- limpa `passwordHash`;
- mantém `isActive = true`;
- revoga códigos pendentes;
- emite uma nova ativação de 1 hora;
- registra auditoria sem código, senha ou hash.

O operador repete o fluxo de ativação e escolhe a nova senha.

## Reset administrativo de participante

Somente `GENERAL` pode gerar uma senha temporária para participante. O reset:

- exige motivo de 10–500 caracteres;
- gera uma senha aleatória de 20 caracteres exibida uma vez;
- substitui o hash atual;
- define `passwordResetRequired = true` e validade de 24 horas;
- revoga todas as sessões;
- registra auditoria sem senha ou hash.

Se já houver reset pendente, a API retorna conflito. O administrador pode
confirmar explicitamente a substituição, invalidando a senha temporária anterior.

### Sessão restrita

O participante consegue entrar com a senha temporária enquanto ela estiver
válida, mas a sessão permite apenas:

- `GET /auth/csrf`;
- `POST /auth/logout`;
- `POST /auth/password/change-required`.

Qualquer outra rota retorna `403 PASSWORD_CHANGE_REQUIRED`. Reset expirado ou
substituído invalida login e sessões temporárias.

A senha definitiva segue a política atual de participante, deve ser diferente
da temporária e é gravada em transação. A conclusão limpa o estado de reset,
revoga novamente todas as sessões e exige login normal com a senha definitiva.

## Auditoria

Adicionar somente as operações necessárias:

- `ADMIN_OPERATOR_CREATED`;
- `ADMIN_OPERATOR_UPDATED`;
- `ADMIN_OPERATOR_STATUS_CHANGED`;
- `ADMIN_OPERATOR_ACTIVATION_RESET`;
- `ADMIN_OPERATOR_ACTIVATED`;
- `PARTICIPANT_PASSWORD_RESET`.

Snapshots aceitam apenas identificador, nome de exibição, perfil, estado ativo e
datas relevantes. Senhas, códigos, hashes, CPF e email são descartados pelo
sanitizador e cobertos por testes de serialização.

## Interface

### Gestão de operadores

`/admin/operadores` oferece lista, cadastro, edição, ativação/inativação e reset.
Todos os diálogos de mutação solicitam motivo. Cadastro e reset abrem um diálogo
de resultado com código e expiração, removido do DOM ao fechar.

### Ativação

`/ativar-admin` possui campos para código, CPF, email, senha e confirmação. Não
lê código de query string. Após `204`, limpa o formulário e redireciona para
`/login/admin`.

### Participante

O detalhe do participante mostra o reset somente para `GENERAL`. O resultado
temporário usa estado local e exibição única. `/trocar-senha` valida a sessão,
define a senha definitiva e volta ao login.

## Testes essenciais

### Unitários

- mapeamento de perfis e comportamento fail-closed do guard;
- geração/hash/expiração/uso único do código;
- transições derivadas de `isActive` e `passwordHash`;
- proteção concorrente do último general;
- sanitização de auditoria;
- restrição e conclusão da senha temporária;
- navegação e diálogos de exibição única.

### E2E

- general cadastra e ativa um usuário de cada perfil;
- `SHOP` acessa uma rota da lojinha e recebe `403` em atividades e participantes;
- `ACTIVITIES` acessa uma rota de atividades/códigos e recebe `403` em lojinha e
  participantes;
- chamadas diretas negadas não alteram o banco;
- código expirado, reutilizado e submetido concorrentemente falha;
- inativação e reset revogam sessões;
- último general permanece protegido;
- respostas operacionais não contêm CPF/email;
- reset de participante cobre senha anterior, sessão restrita, substituição,
  expiração, troca definitiva e novo login;
- auditoria serializada não contém código, senha ou hash.

Não será criada uma matriz combinando todos os perfis com todos os endpoints.
Um teste de arquitetura garante que cada controller administrativo declare os
perfis permitidos, e os e2e acima cobrem os limites reais dos três domínios.

## Fora do escopo

- permissões customizadas ou múltiplos perfis por operador;
- enum separado para pendente, bloqueado e desativado;
- distinção entre bloqueio e desativação;
- rate limits diferentes para lojinha, atividades e gestão de operadores;
- exclusão física de operadores;
- recuperação por email, SMS ou WhatsApp;
- aprovação por dois administradores;
- matriz e2e de todos os perfis contra todos os endpoints.

## Critérios de aceite

- Um general cadastra qualquer perfil e recebe uma única exibição do código de
  ativação válido por 1 hora.
- O operador ativa uma vez por HTTPS e depois entra apenas com CPF, email e a
  senha escolhida.
- `SHOP` opera somente a lojinha; `ACTIVITIES` opera somente atividades/códigos;
  `GENERAL` mantém acesso completo.
- Restrições são garantidas no backend e chamadas diretas negadas não escrevem
  no banco.
- Inativação, troca de perfil e resets revogam as sessões previstas.
- O último general disponível permanece protegido sob concorrência.
- Operadores especializados não recebem CPF/email nas respostas operacionais.
- Reset de participante substitui credenciais/sessões, restringe o acesso à
  troca obrigatória e exige novo login com a senha definitiva.
- Código, senha e hash não aparecem em logs, auditoria, métricas, URLs, toasts ou
  cache de consultas.
- Prisma, testes essenciais, lint e builds passam.
