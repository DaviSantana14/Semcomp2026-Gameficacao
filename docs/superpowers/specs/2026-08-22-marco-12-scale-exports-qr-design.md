# Marco 12 — Operação em escala, exportações e QR Codes

**Data:** 2026-08-22

**Status:** aprovado para planejamento

**Timezone operacional:** `America/Sao_Paulo`

## Objetivo

Reduzir trabalho administrativo repetitivo, tornar lotes de Claim Codes
reutilizáveis operacionalmente e disponibilizar exportações individuais sem
prejudicar login, resgate, ranking ou presença durante o evento.

O marco também incorpora QR Codes como representação dos códigos existentes.
O QR não cria um novo tipo de resgate: códigos reutilizáveis continuam
reutilizáveis, Claim Codes continuam globais e de uso único, e todas as regras
permanecem no backend.

## Decisões aprovadas

- Exportações e arquivos de QR são gerados sob demanda e não são armazenados.
- Novos lotes de Claim Codes passam a ser entidades persistidas e rastreáveis.
- Baixar novamente um lote sempre usa os valores persistidos e nunca gera novos
  códigos.
- Operações em lote usam seleção explícita, com atalho para selecionar a página,
  e aceitam no máximo 500 códigos.
- Operações em lote exigem justificativa e confirmação digitada.
- QR Codes ficam disponíveis em PDF A4 e ZIP com um PNG por código.
- Cada PNG é um cartão completo com QR, código textual, atividade e lote.
- JPEG fica fora do escopo porque a compressão com perdas reduz a confiabilidade
  de leitura sem trazer vantagem relevante para esse material.
- O leitor usa a câmera traseira quando disponível, encerra a câmera depois da
  detecção e exige confirmação antes do resgate.
- A digitação manual permanece sempre disponível.
- O QR contém apenas o código textual canônico, sem URL, identificador de
  participante ou metadados de negócio.
- A abordagem não adiciona fila, worker separado, Redis, S3 ou armazenamento
  persistente de artefatos.

## Escopo

- CSV de participantes conforme os filtros da tela.
- CSV de resgates por código com filtros de atividade, método, participante e
  período.
- Lista administrativa global e CSV de movimentações de pontos/XP.
- CSV de pedidos da lojinha conforme os filtros da tela.
- Persistência, consulta e redownload de lotes de Claim Codes.
- Download textual do lote para preservar a capacidade atual.
- PDF A4 com cartões de QR para lotes de Claim Codes.
- ZIP com um cartão PNG por Claim Code.
- Cartão QR individual em PNG e PDF para código reutilizável de Action.
- Ativação e desativação em lote somente de Claim Codes ainda não usados.
- Relatório persistido e exportável de cada operação em lote.
- Leitor de QR no fluxo participante com confirmação.
- Revisão dos rate limits atuais e políticas próprias para exportações.
- Métricas agregadas de respostas `401`, `403` e `429`.
- Dashboard administrativo com volumes e estado dos limiares.

## Fora do escopo

- QR contendo link profundo, URL de produção ou resgate automático por abertura
  de link.
- QR personalizado com logo, cores decorativas ou múltiplos temas.
- JPEG, SVG avulso ou pacote de imagens de códigos reutilizáveis.
- Regeneração ou rotação do valor de um Claim Code existente.
- Importação de participantes, códigos, pontos ou pedidos por CSV.
- Operações em lote sobre códigos já usados.
- Seleção implícita de todos os itens de todos os resultados filtrados.
- Jobs assíncronos, fila externa, armazenamento de arquivos ou notificações de
  conclusão.
- Alertas externos por email, WhatsApp, PagerDuty ou serviço equivalente.
- Métricas por rota, IP, usuário, credencial ou identificador individual.
- Alteração da semântica de pontos, XP, rewards ou ranking.

## Arquitetura

O backend continuará modular e síncrono, com limites explícitos. Consultas de
lista e exportação compartilharão o mesmo construtor de filtros para impedir que
o CSV divirja da tela. A paginação só será aplicada às listas; a exportação
reutilizará o mesmo `where` sem `page` ou `limit`.

O `ClaimCodesModule` será responsável por lotes, operações em massa e suas
consultas. Funções puras separarão serialização CSV, criação da matriz de cartões
e nomes seguros de arquivos. A geração de QR usará `qrcode`, o PDF usará
`pdfkit`, o ZIP usará `archiver` e a composição do cartão PNG usará `sharp`.

O frontend continuará usando os componentes administrativos atuais e o helper
de download autenticado. O leitor será um componente cliente carregado somente
quando o participante escolher usar a câmera. A decodificação usará
`@zxing/browser`, sem depender do `BarcodeDetector` experimental do navegador.

## Modelo de dados

### `ClaimCodeBatch`

```prisma
model ClaimCodeBatch {
  id                String      @id @default(uuid())
  actionId          String
  createdByAdminId  String
  requestedQuantity Int
  createdQuantity   Int
  reason            String
  requestId         String      @unique
  action             Action      @relation(fields: [actionId], references: [id], onDelete: Restrict)
  createdByAdmin     User        @relation("ClaimCodeBatchCreatedBy", fields: [createdByAdminId], references: [id], onDelete: Restrict)
  claimCodes         ClaimCode[]
  createdAt          DateTime    @default(now())

  @@index([actionId, createdAt])
  @@index([createdByAdminId, createdAt])
}
```

`ClaimCode` recebe `batchId String?`, relação opcional e índice
`(batchId, createdAt)`. A coluna é nullable apenas para preservar códigos
anteriores à migration. Todo código criado depois da migration deve pertencer a
um lote.

`Action` e `User` recebem as relações inversas. O lote guarda quantidade pedida
e efetivamente criada para tornar qualquer divergência explícita, embora a
operação normal continue fazendo rollback se não conseguir criar a quantidade
completa.

### `ClaimCodeBulkOperation`

```prisma
enum ClaimCodeBulkOutcome {
  CHANGED
  ALREADY_IN_STATE
  ALREADY_USED
  NOT_FOUND
}

model ClaimCodeBulkOperation {
  id             String                       @id @default(uuid())
  actorAdminId   String
  targetIsActive Boolean
  reason         String
  requestId      String                       @unique
  selectedCount  Int
  changedCount   Int
  unchangedCount Int
  usedCount      Int
  notFoundCount  Int
  actorAdmin     User                         @relation("ClaimCodeBulkOperationActor", fields: [actorAdminId], references: [id], onDelete: Restrict)
  items          ClaimCodeBulkOperationItem[]
  createdAt      DateTime                     @default(now())

  @@index([actorAdminId, createdAt])
  @@index([createdAt])
}

model ClaimCodeBulkOperationItem {
  operationId         String
  requestedClaimCodeId String
  claimCodeId          String?
  maskedCode           String?
  outcome              ClaimCodeBulkOutcome
  operation            ClaimCodeBulkOperation @relation(fields: [operationId], references: [id], onDelete: Restrict)
  claimCode             ClaimCode?              @relation(fields: [claimCodeId], references: [id], onDelete: Restrict)

  @@id([operationId, requestedClaimCodeId])
  @@index([claimCodeId])
}
```

Os itens armazenam IDs e código mascarado, nunca duplicam o valor bruto. Os
registros são append-only nos fluxos da aplicação e recebem a mesma proteção de
banco contra `UPDATE`/`DELETE` usada pelo histórico auditável.

### `SecurityHttpMetricMinute`

```prisma
model SecurityHttpMetricMinute {
  minuteStart       DateTime @id
  unauthorizedCount Int      @default(0)
  forbiddenCount    Int      @default(0)
  rateLimitedCount  Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([minuteStart])
}
```

Cada linha representa um minuto UTC. Nenhuma dimensão por rota, IP, usuário ou
credencial será persistida.

## Geração e redownload de lotes

`POST /admin/actions/:id/claim-codes/generate` continuará aceitando quantidade
de 1 a 500 e justificativa de 10 a 500 caracteres. O fluxo passa a:

1. Capturar `batchId`, administrador e `requestId`.
2. Criar `ClaimCodeBatch` na mesma transação dos códigos.
3. Associar cada código inserido ao lote.
4. Gravar `AdminAuditEvent` usando o mesmo `batchId` como entidade.
5. Retornar metadados do lote e os códigos gerados.

Falha na geração completa, persistência do lote ou auditoria reverte tudo.

Novos endpoints administrativos:

- `GET /admin/claim-code-batches` com atividade, administrador, período e
  paginação.
- `GET /admin/claim-code-batches/:id` com metadados e resumo de estados.
- `GET /admin/claim-code-batches/:id/download.txt`.
- `GET /admin/claim-code-batches/:id/qr.pdf`.
- `GET /admin/claim-code-batches/:id/qr-images.zip`.
- `GET /admin/reusable-codes/:actionId/qr.png`.
- `GET /admin/reusable-codes/:actionId/qr.pdf`.

Um lote legado sem `batchId` não aparece como lote reconstruído. Seus códigos
continuam utilizáveis e consultáveis individualmente.

## Formatos de QR

### Conteúdo

O payload é exatamente o código canônico já aceito por
`POST /actions/redeem-code`. Não contém JSON, URL ou assinatura adicional. O
backend continua decidindo se o valor representa código reutilizável ou Claim
Code.

### PNG

- Formato final: PNG, 1200 × 1500 px, fundo branco.
- QR em preto com correção de erro `H` e quiet zone de quatro módulos.
- Texto abaixo do QR: código, atividade, tipo `Uso único` ou `Reutilizável` e
  identificador curto do lote quando aplicável.
- Nome no ZIP: sequência de três dígitos mais código sanitizado, por exemplo
  `001-ABCD-EFGH.png`.
- Entradas do ZIP são ordenadas pelo valor do código.

### PDF

- A4 retrato com margens de 12 mm.
- Duas colunas e quatro linhas, totalizando oito cartões por página.
- Cada cartão contém o mesmo QR e os mesmos textos do PNG.
- Cabeçalho discreto identifica atividade, lote e data de geração do arquivo.
- O PDF é derivado sob demanda e não é salvo em disco ou banco.

`qrcode.toBuffer()` produz o QR base. `sharp` compõe o cartão PNG. `PDFKit`
recebe buffers PNG e transmite o PDF. `Archiver` transmite o ZIP e inclui um
`manifesto.csv` com sequência, código, atividade, lote e tipo.

## Leitor participante

O diálogo de resgate passa a ter as opções `Digitar código` e `Usar câmera`.
Escolher câmera faz import dinâmico do leitor e solicita vídeo com
`facingMode: { ideal: "environment" }`.

Estados explícitos:

- solicitando permissão;
- procurando QR;
- QR reconhecido aguardando confirmação;
- permissão negada;
- câmera indisponível;
- ambiente sem suporte ou sem HTTPS;
- conteúdo de QR inválido;
- resgatando;
- erro de negócio retornado pela API.

Ao reconhecer um valor, o leitor valida o mesmo formato aceito pelo campo
manual, chama `controls.stop()`, encerra todas as tracks e mostra o código. O
participante confirma ou volta a escanear. Somente a confirmação executa a
mutation existente.

Fechar o diálogo, alternar para digitação, desmontar o componente ou concluir a
leitura sempre encerra controls, tracks e callbacks. Uma mutation pendente não
pode ser disparada duas vezes. Em falha de câmera, o campo manual permanece
funcional.

A câmera funciona em `localhost` durante desenvolvimento e exige HTTPS no
ambiente hospedado. O ensaio HTTP do Marco 9 não é critério para câmera; a
validação em dispositivo real por HTTPS permanece também no checklist do Marco
14.

## Operações em lote

`POST /admin/claim-codes/bulk-status` recebe:

```ts
type BulkClaimCodeStatusRequest = {
  ids: string[];       // 1..500 IDs únicos
  isActive: boolean;
  reason: string;      // 10..500 caracteres após trim
  confirmation: "ATIVAR" | "DESATIVAR";
};
```

A palavra deve corresponder ao estado solicitado. O backend não aceita filtros
como alvo implícito e não confia no estado exibido no frontend.

Dentro de uma transação PostgreSQL, o service bloqueia as linhas existentes,
classifica cada ID, altera apenas linhas com `isUsed = false` e estado diferente
do solicitado, persiste operação/itens e grava um único `AdminAuditEvent`
resumido. A auditoria usa a nova operação
`CLAIM_CODE_BULK_STATUS_CHANGED` e entidade
`CLAIM_CODE_BULK_OPERATION`.

Uma corrida com resgate é serializada pelo lock da linha:

- se o resgate vencer, a operação classifica o código como `ALREADY_USED`;
- se a desativação vencer, o resgate falha porque o código não está ativo;
- nunca existe código usado que seja alterado pela operação em lote.

Resultados de negócio podem ser mistos. Falha técnica de banco ou auditoria
faz rollback integral e não cria relatório de sucesso parcial.

Endpoints de consulta:

- `GET /admin/claim-code-bulk-operations` paginado.
- `GET /admin/claim-code-bulk-operations/:id` com itens.
- `GET /admin/claim-code-bulk-operations/:id/report.csv`.

## Exportações CSV

Todos os arquivos usam:

- UTF-8 com BOM;
- delimitador `;`;
- CRLF;
- timestamps com offset de `America/Sao_Paulo`;
- escaping de aspas, delimitador e quebras de linha;
- prefixo de apóstrofo para campos textuais iniciados por `=`, `+`, `-`, `@`,
  tab ou carriage return, evitando fórmulas em planilhas;
- `Content-Disposition` com nome determinístico;
- ausência de hashes, cookies, tokens, IDs de sessão e snapshots de auditoria.

Cada lista e sua exportação usam uma função única para montar o
`Prisma.*WhereInput`. Testes contratuais compararão IDs encontrados pela lista
paginizada com as linhas do CSV para o mesmo conjunto de filtros.

### Participantes

`GET /admin/participants/export.csv` aceita `search` e `status`, iguais à tela.
Colunas:

```text
nome;email;cpf;status;pontos;xp;nivel;cadastrado_em
```

CPF é incluído somente nesta exportação administrativa explícita. IDs internos,
senha/hash, sessão e timestamps de credencial não são exportados.

### Resgates de códigos

`GET /admin/code-redemptions/export.csv` aceita `actionId`,
`method=reusable|claim`, busca de participante e intervalo operacional
`[from,to)`. Colunas:

```text
participante;email;atividade;metodo;codigo_mascarado;pontos;xp;resgatado_em
```

O valor bruto do código não é necessário para o histórico de uso e permanece
mascarado.

### Movimentações de pontos e XP

Uma nova rota `/admin/movimentacoes` lista `PointEvent` globalmente. Lista e
`GET /admin/point-events/export.csv` aceitam participante, `source`, `kind` e
intervalo `[from,to)`. Colunas:

```text
participante;email;tipo;origem;pontos_delta;xp_delta;referencia;descricao;ator;criado_em
```

O filtro e a apresentação preservam `LEGACY_UNKNOWN` como origem desconhecida.

### Pedidos da lojinha

`GET /admin/redemptions/export.csv` reutiliza `status`, `rewardId`, `search` e
adiciona intervalo `[from,to)` à listagem existente. Colunas:

```text
participante;email;recompensa;pontos_gastos;status;solicitado_em;entregue_em;cancelado_em;responsavel
```

## Limites e concorrência

- Cada CSV aceita no máximo 50.000 registros e 25 MiB codificados.
- Repositories leem em blocos determinísticos de 1.000 registros.
- O processo aceita no máximo duas exportações CSV simultâneas.
- O processo aceita uma geração de PDF ou ZIP simultânea.
- Lote, operação em massa, PDF e ZIP aceitam no máximo 500 códigos.
- Exceder contagem ou tamanho retorna `422` antes de iniciar o download.
- Exceder concorrência retorna `429` com `Retry-After: 30`.
- Cada administrador pode iniciar cinco exportações por minuto.
- Cada administrador pode iniciar duas operações em lote por minuto.
- Desconexão do cliente cancela consultas e finaliza os streams sem continuar
  trabalho inútil.

Os artefatos são montados em buffers limitados antes de enviar headers: até 25
MiB para CSV e um cartão por vez para PDF/ZIP. PDFKit e Archiver transmitem o
resultado com backpressure. Nenhum arquivo temporário persistente é criado.

## Revisão de rate limiting

As políticas atuais permanecem como baseline:

- login participante: 5 tentativas por 15 minutos por credencial HMAC;
- login administrativo: 5 por 15 minutos por credencial HMAC;
- cadastro: 3 por hora por credencial HMAC;
- leitura autenticada: 120 por minuto por usuário;
- mutação participante: 10 por minuto por usuário;
- mutação administrativa comum: 30 por minuto por usuário.

Exportações e bulk recebem políticas próprias descritas acima. Usuários
autenticados continuam usando `userId`, e credenciais usam HMAC. IP é apenas
fallback para requisição anônima sem credencial utilizável. Participantes atrás
do mesmo NAT não compartilham contador depois da autenticação.

O ensaio de carga deve confirmar que 150 participantes válidos não recebem
`429`. A política só será alterada se o relatório mostrar necessidade, com novo
valor explícito em configuração e teste correspondente.

## Métricas de `401`, `403` e `429`

Um middleware observa apenas o status final da resposta. Para os três status de
interesse, incrementa um buffer em memória indexado pelo minuto UTC. Não lê nem
retém rota, IP, usuário, body, header, cookie ou token.

Um scheduler troca o buffer ativo e faz upsert aditivo por minuto. Em múltiplas
instâncias, cada processo soma sua contribuição à mesma linha de forma atômica.
Se o flush falhar, os valores retornam ao buffer para nova tentativa. O atraso
normal de visualização é inferior a dois minutos.

Retenção: 30 dias, com limpeza diária idempotente.

`GET /admin/security-metrics/overview` retorna contagens dos últimos 5 minutos,
uma hora e 24 horas, última coleta e estado por status. Limiar inicial de
atenção:

- `401 >= 20` em 5 minutos;
- `403 >= 10` em 5 minutos;
- `429 >= 5` em 5 minutos.

O dashboard mostra os valores e um estado `NORMAL`, `ATTENTION` ou `DEGRADED`.
`DEGRADED` significa ausência de flush recente, não ausência de erros. Não há
alerta externo neste marco.

## Experiência administrativa

### Exportações

Cada listagem exibe `Exportar CSV`. O botão usa somente os filtros aplicados,
não valores ainda digitados e não submetidos. Antes do download, um diálogo
resume os filtros, consulta a contagem e avisa quando o arquivo contém dados
individuais. Loading, erro, limite excedido e retry são independentes da lista.

### Lotes

A tela de códigos recebe histórico paginado de lotes. Cada lote mostra
atividade, administrador, data, quantidade total, usados, disponíveis e
desativados, com ações para TXT, PDF e ZIP/PNG.

### Bulk

Checkboxes aparecem somente em Claim Codes não usados. `Selecionar página`
nunca inclui código usado. A confirmação mostra a quantidade, exige motivo e a
palavra `ATIVAR` ou `DESATIVAR`. Depois da execução, a tela mostra contagens e
itens por resultado, oferece o CSV e permite abrir o registro novamente.

### Segurança

O dashboard recebe cards de `401`, `403` e `429`, limiar, período e última
atualização. Falha dessa consulta não remove os cards de presença ou operação já
existentes.

## Privacidade e segurança

- QR e manifesto contêm o código porque são artefatos administrativos cujo
  objetivo é distribuir o segredo de resgate; nunca entram em logs ou métricas.
- O backend não registra payload de QR, lista bruta de códigos, conteúdo do ZIP
  ou filtros com CPF/email em logs.
- Relatórios de bulk persistem IDs e máscaras, não valores brutos duplicados.
- CSV de participantes é a única nova exportação com CPF completo.
- Demais CSVs não incluem CPF e mascaram códigos.
- Métricas de segurança contêm somente minuto e três contadores.
- Todos os endpoints exigem sessão administrativa e role no backend.
- Downloads `GET` não exigem CSRF conforme a política atual; geração de lote e
  bulk continuam exigindo CSRF.
- Leitor de câmera é iniciado somente por gesto explícito do participante.
- Nenhuma imagem ou frame da câmera é enviado ao backend ou persistido.

## Tratamento de erros

- Lote inexistente ou legado sem lote: `404` com mensagem específica.
- Lote acima de 500: `400` na geração.
- Exportação acima de contagem/tamanho: `422` com limite e contagem conhecida.
- Gerador ocupado: `429` com `Retry-After: 30`.
- Falha antes dos headers: resposta JSON padrão sem arquivo parcial.
- Falha de stream depois dos headers: stream é encerrado e o erro é registrado
  apenas com tipo, `requestId` e formato, sem códigos ou PII.
- Bulk inválido: `400`; IDs repetidos, confirmação divergente e motivo inválido
  são rejeitados antes da transação.
- Falha técnica de bulk: rollback integral; nenhum relatório de sucesso é
  criado.
- Conteúdo de QR fora do formato: erro local e opção de tentar novamente.
- `NotAllowedError`: instrução de permissão e fallback manual.
- câmera ausente ou sem HTTPS: explicação específica e fallback manual.

## Estratégia de testes

### Backend unitário e repository

- migration preserva Claim Codes legados e exige lote em novas gerações;
- criação de lote, códigos e auditoria é atômica;
- redownload retorna exatamente os códigos persistidos em ordem determinística;
- QR PNG decodifica para o texto original;
- cartão contém código e metadados aprovados;
- PDF tem A4, oito cartões por página e número correto de páginas;
- ZIP contém um PNG por código e um único manifesto;
- filtros de lista e exportação produzem o mesmo conjunto;
- CSV protege fórmulas e aplica BOM, `;`, CRLF e timezone;
- row/byte caps e gates de concorrência;
- bulk rejeita duplicatas e confirmação incorreta;
- bulk classifica todos os resultados e nunca altera código usado;
- corrida resgate/bulk preserva as invariantes;
- falha de auditoria ou persistência reverte a operação;
- middleware não captura campos da requisição;
- flush concorrente soma contadores sem perder incrementos;
- retenção e limiares de métricas.

### Backend E2E

- participante não acessa listas, CSV, lote, QR, bulk ou métricas;
- admin baixa TXT, PDF e ZIP do lote original;
- código reutilizável produz QR sem criar Claim Code;
- CSV respeita cada combinação de filtros;
- bulk misto retorna relatório exato e consultável;
- resgate concorrente nunca resulta em código usado alterado;
- limites retornam `422`/`429` e `Retry-After`;
- respostas `401`, `403` e `429` aparecem somente como contagens agregadas;
- nenhuma resposta administrativa expõe hash, sessão ou token.

### Frontend

- exportação usa filtros aplicados, não rascunhos;
- diálogo mostra contagem, limite, loading, erro e retry;
- seleção de página ignora usados e respeita 500;
- confirmação digitada e motivo são obrigatórios;
- relatório misto continua acessível e exportável;
- downloads de lote têm nomes e formatos corretos;
- leitor só pede câmera após clique;
- leitor prefere câmera traseira, para após detecção e limpa tudo no unmount;
- QR válido preenche confirmação sem resgatar automaticamente;
- cancelar permite nova leitura;
- permissão negada, ausência de câmera e ambiente inseguro mantêm entrada manual;
- confirmação usa a mutation existente e impede duplo envio.

### Carga e regressão

- 150 participantes mantêm login, heartbeat, resgate, ranking e presença sem
  `429` legítimo enquanto um admin exporta CSV;
- PDF e ZIP de 500 códigos não ultrapassam os limites de memória/CPU do Marco 9
  nem elevam mutações válidas acima de p95 de um segundo;
- exportações excedentes recebem limite sem degradar endpoints comuns;
- o relatório registra contagens agregadas de `401`, `403` e `429` sem PII;
- Prisma, lint, unitários, repository, E2E, frontend, typecheck, builds, contratos
  de carga e `git diff --check` passam.

## Critérios de aceite

- Novos lotes podem ser localizados e baixados novamente sem regenerar códigos.
- PDF e ZIP/PNG reproduzem exatamente o mesmo conjunto de códigos do lote.
- QR de Claim Code e de código reutilizável chama o fluxo existente e preserva
  todas as regras de uso.
- A câmera nunca resgata sem confirmação e sempre oferece digitação manual.
- Operações em lote usam seleção explícita, no máximo 500 IDs e nunca alteram
  código usado.
- Cada operação informa exatamente alterados, inalterados, usados e não
  encontrados e permanece consultável.
- CSVs reproduzem filtros ativos, respeitam limites e incluem somente os campos
  aprovados.
- A operação individual existente continua funcionando sem regressões.
- Exportação ou QR pesado não impede login, heartbeat, resgate ou ranking.
- Rate limits continuam separados por credencial/usuário e funcionam atrás do
  mesmo NAT.
- Dashboard expõe `401`, `403` e `429` agregados com limiares e sem PII.
- Todos os testes e builds passam e o ensaio de 150 participantes permanece
  dentro dos limites do Marco 9.
