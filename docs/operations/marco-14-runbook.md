# Runbook operacional — Marco 14

Este runbook cobre a abertura, a contenção de incidentes e o encerramento do
evento em `gameficacao.semcomp.com.br`.

## Invariantes de segurança

- O único endereço público válido para o jogo é
  `https://gameficacao.semcomp.com.br`. `semcomp.com.br` e a landing page não
  fazem parte desta operação.
- A região AWS é `sa-east-1` e o projeto Compose de produção é
  `semcomp-production`.
- Em qualquer dúvida, manter o Nginx em manutenção. Nunca liberar HTTP puro,
  copiar chave privada para um release, apagar volumes ou executar limpeza
  destrutiva sem confirmação do responsável.
- O smoke não cadastra participante, não cria código, ponto, recompensa ou
  atividade. Ele usa somente contas reais já existentes e encerra as sessões.

## Comandos-base

Executar na Session Manager do host, sempre a partir do release atual:

```bash
cd /opt/semcomp/current
current_release="$(readlink -f /opt/semcomp/current)"
release_sha="${current_release##*/}"
printf 'release: %s\n' "$release_sha"
printf 'path: %s\n' "$current_release"
df -h /opt
docker system df
unset current_release release_sha
```

Para conferir o edge e os fluxos críticos:

```bash
read -r -p 'Elastic IP esperado: ' expected_eip
DEPLOY_ENV=production \
EXPECTED_ELASTIC_IP="$expected_eip" \
BASE_URL=https://gameficacao.semcomp.com.br \
bash deploy/aws/production/scripts/smoke-test.sh
unset expected_eip
```

O comando pede CPF, e-mails e senhas sem receber senha por variável de
ambiente. Um `FAIL` é bloqueante; corrigir a causa antes de repetir.

## Deploy automático da `main`

O job `deploy-production` roda somente depois dos jobs `deployment-artifacts`
e `build` ficarem verdes em um push na `main`. Ele assume a role indicada por
`AWS_DEPLOY_ROLE_ARN` no ambiente GitHub `production`; não existem access keys
persistentes no repositório.

Para conferir o release ativo sem exibir segredos:

```bash
current_release="$(readlink -f /opt/semcomp/current)"
printf 'release: %s\n' "${current_release##*/}"
curl --fail --silent --show-error https://gameficacao.semcomp.com.br/api/health
unset current_release
```

Se a CI falhar, não iniciar publicação manual para contornar o gate. Se o job
de CD falhar, preservar o release atual, consultar a etapa com erro e seguir a
seção "Falha de release" para qualquer rollback.

## Diagnóstico e decisões

### DNS não propagado ou apontando para outro endereço

Consultar a stack e o DNS sem alterar recursos:

```bash
aws cloudformation describe-stacks \
  --stack-name semcomp-production \
  --query "Stacks[0].Outputs[?OutputKey=='ProductionElasticIp'].OutputValue | [0]" \
  --output text \
  --region sa-east-1
dig +short A gameficacao.semcomp.com.br
```

Se o resultado estiver vazio ou diferente do `ProductionElasticIp`, manter
manutenção, registrar o horário e os dois valores e contatar o responsável pelo
DNS. Não emitir certificado novamente e não ativar o edge.

### Falha TLS ou certificado

Manter somente a rota ACME e a manutenção:

```bash
cd /opt/semcomp/current
sudo install -m 0644 \
  deploy/aws/production/nginx-maintenance.conf \
  /opt/semcomp/shared/nginx/active.conf
docker compose \
  --project-directory /opt/semcomp/current/deploy/aws/production \
  --project-name semcomp-production \
  --file /opt/semcomp/current/deploy/aws/production/compose.yml \
  --env-file /opt/semcomp/shared/production.env \
  up -d --no-deps --force-recreate nginx
```

Somente depois de o DNS coincidir com o EIP, repetir a emissão. O script pede
o e-mail ACME no prompt:

```bash
read -r -p 'Elastic IP confirmado: ' expected_eip
DEPLOY_ENV=production \
PRODUCTION_ELASTIC_IP="$expected_eip" \
bash deploy/aws/production/scripts/request-certificate.sh
unset expected_eip
```

Confirmar sem divulgar conteúdo do certificado:

```bash
curl --silent --show-error --head https://gameficacao.semcomp.com.br/
```

Nunca substituir o TLS por HTTP. Se a emissão continuar falhando, manter
manutenção e escalar para o responsável por DNS/ACME.

### Falha de login, heartbeat ou dashboard

Verificar primeiro dependências e relógio:

```bash
curl --fail --silent --show-error https://gameficacao.semcomp.com.br/api/health
timedatectl show --property=NTPSynchronized --value
docker compose \
  --project-directory /opt/semcomp/current/deploy/aws/production \
  --project-name semcomp-production \
  --file /opt/semcomp/current/deploy/aws/production/compose.yml \
  --env-file /opt/semcomp/shared/production.env \
  ps
```

Confirmar que a conta está ativa, que o CPF e o e-mail pertencem ao mesmo
perfil e que não há troca de senha pendente. Para diagnóstico restrito do
operador, emitir somente logs mascarados:

```bash
docker compose \
  --project-directory /opt/semcomp/current/deploy/aws/production \
  --project-name semcomp-production \
  --file /opt/semcomp/current/deploy/aws/production/compose.yml \
  --env-file /opt/semcomp/shared/production.env \
  logs --no-color --since 15m api web nginx |
  sed -E \
    -e 's/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}/[redacted-email]/g' \
    -e 's/[0-9]{3}[.-]?[0-9]{3}[.-]?[0-9]{3}-?[0-9]{2}/[redacted-cpf]/g' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._~+\/=-]+/Bearer [redacted-token]/g' \
    -e 's/([Cc]ookie|[Ss]et-[Cc]ookie|access_token)[[:space:]]*[:=][[:space:]]*[^,;[:space:]]+/\1=[redacted-cookie]/g' \
    -e 's/([\"'\"']?(password|passwd|senha)[\"'\"']?[[:space:]]*[:=][[:space:]]*)[^,}[:space:]]+/\1[redacted]/gi'
```

### Falha de banco

Bloquear mutações colocando o edge em manutenção, capturar o resultado do
health e reiniciar o PostgreSQL uma única vez:

```bash
cd /opt/semcomp/current
sudo install -m 0644 \
  deploy/aws/production/nginx-maintenance.conf \
  /opt/semcomp/shared/nginx/active.conf
docker compose \
  --project-directory /opt/semcomp/current/deploy/aws/production \
  --project-name semcomp-production \
  --file /opt/semcomp/current/deploy/aws/production/compose.yml \
  --env-file /opt/semcomp/shared/production.env \
  up -d --no-deps --force-recreate nginx
docker compose \
  --project-directory /opt/semcomp/current/deploy/aws/production \
  --project-name semcomp-production \
  --file /opt/semcomp/current/deploy/aws/production/compose.yml \
  --env-file /opt/semcomp/shared/production.env \
  restart postgres
curl --silent --show-error https://gameficacao.semcomp.com.br/api/health
```

Se o health continuar falhando, não repetir o restart. Com confirmação
explícita do responsável, produzir um backup e executar o restore-check
isolado; a verificação nunca monta o volume PostgreSQL de produção:

```bash
cd /opt/semcomp/current
backup_uri="$(DEPLOY_ENV=production bash deploy/aws/production/scripts/backup-postgres.sh)"
release_sha="$(basename "$(readlink -f /opt/semcomp/current)")"
DEPLOY_ENV=production \
BACKUP_S3_URI="$backup_uri" \
RELEASE_SHA="$release_sha" \
bash deploy/aws/production/scripts/verify-backup.sh
unset backup_uri release_sha
```

Não apagar banco, não renomear banco e não executar `down --volumes` no
projeto `semcomp-production`.

### Falha de release

Colocar manutenção, identificar o SHA anterior publicado e executar rollback
somente com o manifesto correspondente. O script valida conta, região,
manifesto, digest das imagens, backup pré-rollback e health:

```bash
cd /opt/semcomp/current
read -r -p 'ID da conta AWS confirmado: ' expected_account
read -r -p 'SHA completo do release anterior: ' previous_sha
read -r -p 'Bucket de artefatos confirmado: ' release_bucket
DEPLOY_ENV=production \
AWS_REGION=sa-east-1 \
EXPECTED_AWS_ACCOUNT_ID="$expected_account" \
RELEASE_SHA="$previous_sha" \
RELEASE_BUCKET="$release_bucket" \
bash deploy/aws/production/scripts/rollback-release.sh
unset expected_account previous_sha release_bucket
```

Se o rollback falhar, manter manutenção, preservar o estado e escalar. Não
apontar `current` manualmente nem usar tag móvel de imagem.

### Lojinha ou presença com comportamento incorreto

Este release não possui um kill switch seguro por domínio funcional. Portanto,
não inventar bloqueio via banco ou editar endpoints em produção. Congelar
somente a operação afetada por procedimento:

1. avisar os operadores para não submeter novas mutações da lojinha ou da
   presença;
2. preservar a leitura e o dashboard, se estiverem saudáveis;
3. coletar o horário, a tela, o request-id e o resultado do smoke sem expor
   dados pessoais;
4. se houver risco de duplicação ou perda, aplicar a manutenção global usando
   o comando da seção de banco e escalar para correção do release.

O health e a leitura podem ser conferidos sem mutação:

```bash
curl --fail --silent --show-error https://gameficacao.semcomp.com.br/api/health
curl --silent --show-error --head https://gameficacao.semcomp.com.br/
```

### Disco acima de 80%

Primeiro medir e listar; não remover volumes:

```bash
df -h /opt
docker system df
find /opt/semcomp/releases \
  -mindepth 1 -maxdepth 1 -type d \
  -regextype posix-extended \
  -regex '.*/[0-9a-f]{40}' \
  -printf '%T@ %p\n' |
  sort -nr
```

Limpar somente imagens sem referência:

```bash
docker image prune -a --force
```

Para releases, revisar a lista anterior e manter o atual mais os dois
anteriores. O bloco abaixo só continua após confirmação literal e valida cada
alvo antes de remover:

```bash
mapfile -t old_releases < <(
  find /opt/semcomp/releases \
    -mindepth 1 -maxdepth 1 -type d \
    -regextype posix-extended \
    -regex '.*/[0-9a-f]{40}' \
    -printf '%T@ %p\n' |
    sort -nr |
    tail -n +4 |
    cut -d' ' -f2-
)
printf '%s\n' "${old_releases[@]}"
read -r -p 'Digite REMOVER_RELEASES_ANTIGOS para confirmar: ' confirmation
[[ "$confirmation" == 'REMOVER_RELEASES_ANTIGOS' ]] || exit 1
current_release="$(readlink -f /opt/semcomp/current)"
for release in "${old_releases[@]}"; do
  [[ "$release" =~ ^/opt/semcomp/releases/[0-9a-f]{40}$ ]] || exit 1
  [[ "$release" != "$current_release" ]] || exit 1
  rm -rf -- "$release"
done
unset old_releases confirmation current_release
```

Nunca usar `docker system prune --volumes`, nunca remover `postgres_data`,
`certbot_etc` ou `certbot_webroot` e nunca apagar os dois releases anteriores.

## Ativação do edge

Após o smoke em manutenção e o certificado válido, ativar primeiro o
report-only:

```bash
cd /opt/semcomp/current
DEPLOY_ENV=production \
EDGE_MODE=report-only \
bash deploy/aws/production/scripts/activate-edge.sh
```

Percorrer o smoke e o teste manual de câmera. Só com aprovação registrada,
ativar enforcement:

```bash
cd /opt/semcomp/current
DEPLOY_ENV=production \
EDGE_MODE=enforcement \
SEMCOMP_CSP_ENFORCEMENT=approved \
bash deploy/aws/production/scripts/activate-edge.sh
```

Depois, confirmar:

```bash
curl --silent --show-error --head https://gameficacao.semcomp.com.br/
curl --fail --silent --show-error https://gameficacao.semcomp.com.br/api/health
```

Repetir o smoke completo já em enforcement; sem esse resultado não remover a
manutenção:

```bash
read -r -p 'Elastic IP esperado: ' expected_eip
DEPLOY_ENV=production \
CSP_EXPECTED_MODE=enforcement \
EXPECTED_ELASTIC_IP="$expected_eip" \
BASE_URL=https://gameficacao.semcomp.com.br \
bash deploy/aws/production/scripts/smoke-test.sh
unset expected_eip
```

## Encerramento seguro

1. avisar o encerramento e colocar o Nginx em manutenção;
2. bloquear novas mutações por procedimento e preservar a leitura necessária;
3. gerar o backup final;
4. executar o restore-check isolado;
5. registrar URI do backup, SHA e digests do release, horário e evidências do
   smoke;
6. somente depois de autorização separada, discutir destruição da stack.

Destruição de AWS, remoção do registro DNS, bucket, backups e snapshot retido
não faz parte deste runbook automático. Cada recurso exige inventário e
autorização própria.
