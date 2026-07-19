# Admin Flows Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar participantes, detalhe, atividades, códigos, lojinha administrativa e auditoria com a identidade SEMCOMP já aprovada, preservando integralmente o comportamento.

**Architecture:** Criar pequenos primitivos visuais administrativos baseados em Tailwind e aplicá-los aos clientes existentes. Os serviços, query keys, mutações e tipos não mudam; cada tela preserva seus próprios limites de dados e estados, mas compartilha cabeçalho, painéis, campos e linguagem de listas.

**Tech Stack:** Next.js 16.2.4, React 19.2.4, Tailwind CSS 4, TanStack Query 5, Vitest 4 e Testing Library.

## Global Constraints

- Usar `docs/identidade-visual-semcomp-game.md` como fonte de verdade.
- Não alterar API, permissões, regras de negócio ou query keys.
- Usar Tailwind; CSS global novo somente se uma assinatura não puder ser expressa por utilitários existentes.
- Preservar foco, labels, roles, estados de erro/vazio/loading e `prefers-reduced-motion`.
- Escrever toda a interface em português do Brasil com acentuação correta.

---

### Task 1: Primitivos administrativos compartilhados

**Files:**
- Create: `apps/web/src/app/admin/_components/admin-page.tsx`
- Create: `apps/web/src/app/admin/_components/admin-page.spec.tsx`
- Modify: `apps/web/src/app/admin/_components/pagination-controls.tsx`
- Modify: `apps/web/src/app/admin/_components/status-badge.tsx`

**Interfaces:**
- Produces: `AdminPageHeader`, `AdminPanel`, `AdminSectionHeader`, `adminSelectClassName`, `adminTextareaClassName`.
- Consumes: `cn`, tokens Tailwind e elementos React nativos.

- [ ] Escrever testes que exijam `h1`, descrição, região de ação opcional e classes de hierarquia da SEMCOMP.
- [ ] Rodar `npm --workspace web test -- admin-page.spec.tsx` e confirmar falha por componente inexistente.
- [ ] Implementar os primitivos com classes Tailwind estáticas, largura fluida e foco visível.
- [ ] Corrigir acentos de paginação e tornar badges mais consistentes sem mudar seus rótulos de domínio.
- [ ] Rodar o teste focado e a suíte de `_components`.

### Task 2: Participantes

**Files:**
- Modify: `apps/web/src/app/admin/participantes/participants-client.spec.tsx`
- Modify: `apps/web/src/app/admin/participantes/participants-client.tsx`

**Interfaces:**
- Consumes: `AdminPageHeader`, `AdminPanel`, `AdminSectionHeader`, `StatusBadge`, `PaginationControls`.
- Produces: busca/filtro e lista responsiva com o mesmo contrato atual.

- [ ] Adicionar teste para as regiões nomeadas “Filtros de participantes” e “Participantes cadastrados”.
- [ ] Rodar o teste e confirmar falha pela ausência das regiões.
- [ ] Implementar cabeçalho editorial, barra compacta e superfície contínua com cabeçalho de colunas no desktop.
- [ ] Preservar diálogo auditado, paginação e estados.
- [ ] Rodar `participants-client.spec.tsx` até ficar verde.

### Task 3: Detalhe do participante

**Files:**
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-detail-client.tsx`
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-reconciliation-panel.tsx`
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-point-events.tsx`
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-audit-timeline.tsx`
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-reward-history.tsx`
- Test: specs já existentes no mesmo diretório.

**Interfaces:**
- Consumes: dados e operações atuais do participante.
- Produces: resumo, conciliação, extrato, timeline e resgates na nova hierarquia.

- [ ] Estender os testes existentes para exigir títulos de seção e manter os controles auditados.
- [ ] Rodar os specs do diretório e confirmar as novas asserções em vermelho.
- [ ] Redesenhar cabeçalho, métricas, painéis e listas sem mover lógica de mutação.
- [ ] Aplicar checkpoint discreto na timeline e superfícies contínuas nos históricos.
- [ ] Rodar todos os specs do detalhe.

### Task 4: Atividades

**Files:**
- Modify: `apps/web/src/app/admin/atividades/actions-client.spec.tsx`
- Modify: `apps/web/src/app/admin/atividades/actions-client.tsx`

**Interfaces:**
- Consumes: CRUD e diálogo auditado atuais.
- Produces: painel de configuração e lista operacional contínua.

- [ ] Adicionar teste para “Configurar atividade” e “Atividades cadastradas”.
- [ ] Confirmar RED no teste focado.
- [ ] Aplicar o cabeçalho compartilhado, painel elevado e linhas densas com ações alinhadas.
- [ ] Preservar edição, busca, paginação e controles independentes de atividade/código.
- [ ] Confirmar GREEN no teste focado.

### Task 5: Códigos

**Files:**
- Modify: `apps/web/src/app/admin/codigos/codes-client.tsx`
- Modify: `apps/web/src/app/admin/codigos/claim-code-generator.tsx`
- Modify: `apps/web/src/app/admin/codigos/claim-code-history.tsx`
- Modify: `apps/web/src/app/admin/codigos/reusable-code-history.tsx`
- Test: specs de geração e históricos existentes.

**Interfaces:**
- Consumes: geração, download, cópia, filtros, tabs e histórico atuais.
- Produces: central com geração dominante e históricos densos.

- [ ] Estender teste do gerador para exigir a região “Gerar lote de códigos”.
- [ ] Confirmar RED.
- [ ] Redesenhar cabeçalho, gerador, tabs, filtros, listas e painel de usos.
- [ ] Manter roving tab index e retorno de foco existentes.
- [ ] Rodar todos os specs de códigos.

### Task 6: Lojinha administrativa

**Files:**
- Modify: `apps/web/src/app/admin/lojinha/shop-admin-client.tsx`
- Modify: `apps/web/src/app/admin/lojinha/reward-form.tsx`
- Modify: `apps/web/src/app/admin/lojinha/redemption-history.tsx`
- Test: specs existentes do diretório.

**Interfaces:**
- Consumes: catálogo, formulário, opções paginadas e pedidos atuais.
- Produces: criação, catálogo e retiradas visualmente separados.

- [ ] Adicionar teste para as regiões “Configurar recompensa”, “Catálogo” e “Retiradas”.
- [ ] Confirmar RED.
- [ ] Aplicar cabeçalho editorial, formulário elevado, catálogo contido e fila contínua.
- [ ] Reservar ação primária para criação/salvamento e entrega; separar cancelamento.
- [ ] Rodar todos os specs de lojinha.

### Task 7: Auditoria

**Files:**
- Modify: `apps/web/src/app/admin/auditoria/audit-client.spec.tsx`
- Modify: `apps/web/src/app/admin/auditoria/audit-client.tsx`
- Modify: `apps/web/src/app/admin/auditoria/audit-event-list.tsx`

**Interfaces:**
- Consumes: filtros em URL, consulta e snapshots seguros atuais.
- Produces: painel compacto, tabela densa, blocos mobile e detalhe selecionado.

- [ ] Adicionar teste para a região “Filtros de auditoria” e seleção visível do evento.
- [ ] Confirmar RED.
- [ ] Redesenhar cabeçalho, filtros, tabela, cards mobile e detalhe sem alterar sanitização.
- [ ] Manter canonicalização de página e navegação sem scroll.
- [ ] Rodar os specs de auditoria.

### Task 8: Verificação integrada e revisão visual

**Files:**
- Modify somente os arquivos necessários para correções encontradas.

**Interfaces:**
- Consumes: todas as rotas redesenhadas.
- Produces: implementação verificada em desktop e mobile.

- [ ] Rodar `npm --workspace web test`.
- [ ] Rodar `npm --workspace web run lint`.
- [ ] Rodar `npm --workspace web run build`.
- [ ] Abrir participantes, detalhe, atividades, códigos, lojinha e auditoria no navegador.
- [ ] Revisar 1440 px, 768 px e 320 px, teclado, overflow e contraste.
- [ ] Conferir `git diff --check` e o diff final por rota.

