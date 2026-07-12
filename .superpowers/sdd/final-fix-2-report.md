# Final fix 2 report

Base: `d1106c7`

## Findings corrigidos

- `GET /rewards` e `GET /rewards/:id` agora exigem `PARTICIPANT`; metadata unitária e matriz e2e confirmam participante `200` e admin `403`.
- Estados de códigos reutilizáveis seguem a tabela exata: `DISABLED` quando `isCodeActive=false`; `BLOCKED_BY_ACTION` somente quando `isCodeActive=true` e `Action.isActive=false`; `ACTIVE` quando ambos são `true`. Filtros e derivação compartilham essa semântica, incluindo ação inativa com código desabilitado.
- O filtro de resgates do participante expõe apenas `all|pending|delivered|cancelled`; o service converte valores específicos ao enum Prisma e omite o filtro para `all`. Tipos, select e request web usam lowercase e não enviam `all`.

## TDD e verificação

- RED focado: 14 falhas esperadas, 50 testes já verdes (64 total).
- GREEN focado: 4 suites, 64 testes aprovados.
- E2E focado: 2 suites, 16 testes aprovados com `--runInBand --detectOpenHandles`.
- API lint: aprovado.
- API unit: 21 suites, 179 testes aprovados com `--runInBand --detectOpenHandles`.
- API e2e: 4 suites, 19 testes aprovados com `--runInBand --detectOpenHandles`.
- API build: aprovado.
- Web lint: aprovado.
- Web build: aprovado; a primeira tentativa no sandbox falhou ao baixar Geist/Geist Mono, e a repetição com acesso de rede compilou e gerou 14 páginas.
- `git diff --check`: aprovado.

## Auditoria de call sites

As ocorrências do endpoint e dos filtros foram revisadas em API e web. Os valores uppercase restantes são internos do Prisma ou contratos distintos da listagem administrativa global de resgates e não foram alterados.

## Preocupações

Nenhuma funcional. O build web continua dependendo de acesso ao Google Fonts por causa de `next/font`, condição preexistente fora do escopo destes findings.
