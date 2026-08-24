# Marco 14 — Preparação final e go-live

## Objetivo

Colocar o sistema de gamificação da SEMCOMP em produção até 24 de agosto de
2026 às 12h, no endereço `https://gameficacao.semcomp.com.br`, usando a conta
AWS já empregada no ensaio e preservando margem do saldo de créditos disponível.

O corte prioriza uma implantação curta, recuperável e compatível com a
infraestrutura já ensaiada. Não haverá staging separado: por restrição de prazo,
a aplicação irá diretamente para produção e passará por um smoke test de
20–30 minutos antes da abertura operacional.

## Decisões e restrições

- Região: `sa-east-1`.
- Conta AWS existente, com US$ 106,21 em créditos observados em 23 de agosto de
  2026 e expiração indicada para 28 de janeiro de 2027.
- Teto operacional do Marco 14: US$ 80, com alertas em 50%, 75% e 90% do
  orçamento.
- Uma única instância `m7i-flex.large`; não usar Spot.
- Não criar ALB, RDS, NAT Gateway, Redis, WAF ou segunda instância neste corte.
- Produção direta, sem staging separado e sem banco temporário.
- O código deve ser verificado localmente antes de qualquer publicação.
- Antes da abertura, somente o bootstrap administrativo e uma conta real de um
  organizador designado podem ser inseridos. Não haverá participante sintético
  ou dado descartável no banco de produção.
- O domínio principal `semcomp.com.br` e sua landing page não serão alterados.
- O responsável externo pelo DNS somente será acionado depois que o Elastic IP
  estiver alocado.
- Somente mudanças necessárias ao go-live entram no marco; melhorias de alta
  disponibilidade permanecem fora do corte.

## Arquitetura

Uma stack CloudFormation de produção cria VPC, subnet pública, Internet Gateway,
Security Group, Elastic IP, EC2, perfil IAM, bucket S3 de backups e orçamento.
A EC2 executa, por Docker Compose, PostgreSQL 16, NestJS, Next.js, Nginx e o
cliente ACME/Certbot.

O Nginx é o único serviço publicado. As portas `3000`, `3001`, `5432` e `22`
permanecem fechadas. A administração do host ocorre exclusivamente pelo AWS
Systems Manager Session Manager.

O PostgreSQL permanece em volume Docker sobre EBS `gp3` criptografado. A
produção usa banco, usuário, senha, JWT secret e chave de rate limiting próprios.
Backups lógicos criptografados são enviados ao bucket S3 de produção e precisam
ser restauráveis em um banco vazio.

O rate limiting continua em memória, pois haverá somente uma instância da API.
Reiniciar a API limpa os contadores; essa limitação é aceita para o evento.

## DNS e HTTPS

A stack aloca um Elastic IP estável. Quando ele existir, será enviada ao
responsável pelo DNS uma solicitação equivalente a:

```text
Tipo: A
Nome: gameficacao
Valor: usar exatamente o output `ProductionElasticIp` da stack
TTL: 300
```

Antes da propagação, o Nginx expõe somente health check e o caminho
`/.well-known/acme-challenge/`; o restante permanece em manutenção. Depois que
`gameficacao.semcomp.com.br` resolver para o Elastic IP, o Certbot emite um
certificado Let's Encrypt por HTTP-01 e o Nginx é promovido para a configuração
final.

Na configuração final:

- HTTP preserva o challenge ACME e redireciona todo o restante para HTTPS;
- HTTPS usa apenas TLS moderno e publica web e API na mesma origem;
- HSTS é emitido somente em HTTPS, sem `preload`;
- `X-Content-Type-Options`, `Referrer-Policy`, proteção de framing e
  `Permissions-Policy` são definidos explicitamente;
- câmera é permitida para a própria origem, pois o leitor QR depende dela;
- o certificado e o estado ACME persistem em volumes fora do filesystem
  somente-leitura do container Nginx;
- uma rotina de renovação é configurada e testada em dry-run, mesmo que o
  evento dure menos que o período do certificado.

Não será solicitado certificado ACM e não haverá registros CNAME de validação.

## Aplicação e sessões

Produção usa `NODE_ENV=production`, `FRONTEND_URL` e
`NEXT_PUBLIC_API_URL=/api`. Swagger permanece desabilitado. Como web e API usam
a mesma origem, CORS não precisa ser habilitado em produção; a validação de
`Origin` existente usa a URL final.

Cookies de autenticação usam `Secure`, `HttpOnly`, `SameSite=Lax` e `Path=/`.
Participantes mantêm sessão máxima de 8 horas. Sessões administrativas passam a
ter duração máxima de 4 horas, incluindo JWT, cookie e registro persistido. O
logout e as revogações existentes encerram a sessão no banco; inativação, troca
de perfil e resets continuam valendo na requisição seguinte.

Os secrets de produção são gerados aleatoriamente e armazenados como
SecureString no Systems Manager Parameter Store. Nenhuma senha, token, cookie,
hash ou secret entra em CloudFormation parameters em claro, argumento de
processo, log, relatório, repositório ou arquivo de release.

A identidade administrativa inicial é criada sem senha. Somente depois de o
HTTPS estar validado, a senha real é definida interativamente por stdin via
Session Manager. Nenhuma credencial usada no ensaio anterior pode ser
reutilizada.

## CSP e headers

A CSP pertence ao frontend e será aplicada pelo Nginx. Durante o smoke test, a
mesma política começa em `Content-Security-Policy-Report-Only`; as páginas
críticas são percorridas com o console do navegador aberto e um teste automatizado
confirma o header. Violações necessárias ao funcionamento são corrigidas na
política, não liberadas genericamente.

Antes da abertura, a política aprovada muda para
`Content-Security-Policy` em modo enforcement. O report-only não permanece como
substituto do enforcement. A configuração evita `unsafe-eval`; qualquer
necessidade de `unsafe-inline` deve ficar restrita à diretiva mínima compatível
com o build real do Next.js e ser registrada no smoke test.

## Publicação e rollback

As imagens são construídas a partir de commit limpo, identificadas pelo SHA do
commit e publicadas como artefatos imutáveis. Produção executa os mesmos digests
verificados localmente; tags móveis não determinam a versão publicada.

A publicação segue esta ordem:

1. validar lint, testes focados, builds, template e scripts localmente;
2. confirmar identidade da conta e região AWS;
3. criar a stack e registrar seus outputs;
4. configurar os parâmetros de produção sem senha administrativa;
5. publicar as imagens e executar `prisma migrate deploy`;
6. iniciar PostgreSQL, API, web e Nginx em modo de manutenção;
7. obter o Elastic IP e solicitar o registro DNS;
8. emitir o certificado e ativar HTTPS;
9. definir a senha administrativa via Session Manager;
10. executar smoke test, backup inicial e checklist de abertura;
11. retirar o modo de manutenção.

Rollback de aplicação volta ao digest anterior e não recompila no host. Migrations
são forward-only: antes de aplicar uma migration destrutiva, o deploy exige
backup; falhas são tratadas por correção adiante ou restauração completa quando
o contrato não for compatível com a versão anterior.

## Smoke test mínimo

Não haverá ensaio de carga hospedado nem repetição integral dos testes locais.
O smoke test de produção verifica somente riscos exclusivos do ambiente:

- DNS resolve para o Elastic IP;
- HTTP redireciona para HTTPS e o certificado corresponde ao hostname;
- HSTS, CSP, framing, MIME sniffing, referrer e permissions policy estão ativos;
- cookies de autenticação são `Secure`, `HttpOnly` e `SameSite=Lax`;
- `GET /api/health` confirma acesso ao PostgreSQL;
- login administrativo funciona e respeita o perfil;
- login e heartbeat funcionam com a conta real do organizador designado;
- câmera traseira, permissão, leitura QR, cancelamento e fallback manual abrem
  em pelo menos um celular real;
- Swagger está indisponível;
- portas `22`, `3000`, `3001` e `5432` não estão públicas;
- logs não contêm CPF, email, senha, código, cookie ou token;
- um backup é produzido no S3, restaurado em um PostgreSQL descartável isolado
  do banco de produção e verificado por health check e contagens essenciais.

Se um item crítico falhar, o sistema permanece em manutenção. Problemas de
aplicação voltam ao digest anterior; problemas de migration ou banco acionam a
restauração definida no runbook.

## Operação do evento

O runbook deve conter responsáveis e ações curtas para falhas de DNS/TLS,
login, banco, código, lojinha, presença e falta de espaço. Correções permitidas
durante o evento são reiniciar containers, voltar ao digest anterior, bloquear
temporariamente mutações e restaurar backup. Alterações de funcionalidade ficam
congeladas salvo incidente crítico.

O checklist de abertura confirma health, espaço em disco, backup, acesso
administrativo, relógio do host, certificado e fluxos críticos. O checklist de
fechamento bloqueia novas operações, produz backup final, valida o objeto no S3,
exporta evidências e só então autoriza destruir recursos.

## Riscos aceitos

- A EC2 e o PostgreSQL formam um ponto único de falha.
- Não existe failover automático de aplicação ou banco.
- O rate limiting reinicia com a API.
- Não haverá staging, ensaio hospedado completo ou teste de carga antes da
  abertura; os testes locais e o smoke test substituem esses gates por decisão
  explícita de prazo.
- A recuperação depende do Elastic IP, do release anterior e dos backups no S3.

Esses riscos são aceitos somente para a janela curta do evento. Uma operação
permanente exigiria ALB, banco gerenciado e ambiente de pré-produção.

## Fora do escopo

- ALB e certificado ACM;
- RDS, Multi-AZ ou réplica;
- múltiplas instâncias e armazenamento compartilhado de rate limiting;
- staging permanente ou temporário;
- teste de carga hospedado no go-live;
- WAF, CDN, NAT Gateway ou observabilidade avançada;
- refatorações não necessárias à publicação.

## Critérios de aceite

- `https://gameficacao.semcomp.com.br` abre o sistema sem alterar a landing page
  de `semcomp.com.br`.
- DNS aponta para um Elastic IP e a troca de instância não exige trocar o
  registro.
- HTTP redireciona para HTTPS; certificado, HSTS, CSP, cookies e headers passam
  no smoke test.
- Somente `80` e `443` estão públicas; o host é administrado por Session
  Manager.
- Produção usa secrets e credenciais novos; a senha administrativa é definida
  somente após HTTPS e não aparece em artefatos.
- Sessões administrativas duram no máximo 4 horas e participantes mantêm 8
  horas.
- Migration, health, login, heartbeat e câmera/QR passam no ambiente real.
- Um backup inicial é enviado ao S3 e restaurado com sucesso em um PostgreSQL
  descartável isolado.
- Existe rollback por digest e runbook para os incidentes críticos do evento.
- O sistema só sai de manutenção depois de todos os itens críticos do checklist
  de abertura passarem.
