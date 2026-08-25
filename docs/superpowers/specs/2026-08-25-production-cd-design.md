# CD automático de produção

## Objetivo

Publicar automaticamente em `https://gameficacao.semcomp.com.br` cada commit
integrado à branch `main`, desde que todos os gates atuais da CI tenham passado.
Uma falha de CI ou de publicação não pode substituir o release saudável atual.

## Arquitetura

O workflow existente `.github/workflows/ci.yml` receberá um job
`deploy-production`. Ele será executado apenas em eventos `push` na `main` e
dependerá dos jobs `deployment-artifacts` e `build`. O job usará o ambiente
GitHub `production`, associado à URL pública, e uma chave de concorrência
exclusiva que não cancela uma publicação já iniciada.

O GitHub Actions obterá credenciais AWS temporárias por OIDC. Uma stack
CloudFormation isolada, `semcomp-production-cd`, declarará somente o provedor
OIDC do GitHub e uma role de publicação cuja relação de confiança aceitará somente o repositório
`DaviSantana14/Semcomp2026-Gameficacao` no ambiente `production`. Como o claim
OIDC de um job com ambiente identifica o ambiente em vez da branch, a `main`
será exigida tanto pelo gatilho do workflow quanto pela regra de deployment
branches do ambiente `production`. Não serão armazenadas chaves AWS
permanentes em GitHub Secrets.

A stack de runtime `semcomp-production` não será atualizada pelo trabalho de
CD. A stack IAM-only receberá o ID da instância e o nome do bucket existentes
como parâmetros usados exclusivamente para restringir ARNs na policy. Ela não
terá recursos EC2, EBS, EIP, S3, ECR ou banco e, portanto, não poderá substituir
nem excluir esses recursos.

## Fluxo da publicação

1. A CI instala dependências, testa os contratos de implantação, executa lint,
   testes e builds.
2. Com os dois jobs verdes, o job de CD recebe um token OIDC e assume a role
   de produção em `sa-east-1`.
3. O job executa `deploy/aws/production/scripts/publish.ps1` para o SHA exato do
   evento.
4. O script reutiliza ou constrói as imagens da API e do frontend, testa as
   imagens, publica referências imutáveis no ECR, envia o arquivo e o manifesto
   do release ao S3 e despacha a ativação pelo Systems Manager.
5. A EC2 baixa o release e, quando já existe um release ativo, cria e verifica
   `backups/production/pre-deploy-<SHA>.dump` antes de executar
   `prisma migrate deploy`. Só então sobe os serviços, aguarda o health check e
   move o link `current` após a validação.

## Permissões AWS

A role do GitHub terá apenas as ações necessárias para:

- validar a identidade da conta;
- ler outputs da stack `semcomp-production`;
- autenticar e publicar imagens nos dois repositórios ECR da stack;
- gravar somente em `releases/*` no bucket de artefatos;
- enviar e acompanhar o comando SSM somente na instância de produção.

A role não poderá alterar a infraestrutura, ler parâmetros secretos de
produção, acessar backups, abrir uma sessão interativa na instância nem executar
em outra região.

## Falhas e concorrência

Se qualquer job de CI falhar, o job de deploy será ignorado. Se a publicação
falhar antes da ativação, o release atual não será alterado. Se o runtime novo
falhar antes da troca do link, `deploy-release.sh` interromperá a ativação e
tentará manter ou reiniciar o release anterior conforme a lógica já testada.

Somente uma publicação de produção poderá executar por vez. A concorrência usa
`queue: max`, preservando até 100 pushes pendentes em ordem, sem cancelar o
deploy em andamento. O job terá limite de tempo para impedir execução
indefinida. Se o backup pré-deploy falhar ou estiver vazio, a migração não
começa.

## Verificação

Antes de habilitar o CD serão verificados:

- contratos do CloudFormation e dos artefatos de produção;
- sintaxe e contrato estrutural do workflow;
- suíte completa `test:production-deployment`;
- resolução do Compose de produção;
- validade do template CloudFormation;
- criação da stack IAM-only `semcomp-production-cd` e da role OIDC;
- execução real do workflow em um commit da `main`;
- SHA atual da EC2, health HTTPS e estado do workflow após o deploy.

## Fora do escopo

- aprovação manual antes do deploy;
- staging;
- chaves AWS permanentes no GitHub;
- deploy de branches diferentes da `main`;
- mudanças na aplicação, domínio, banco ou infraestrutura de runtime além da
  autenticação e das permissões necessárias ao CD.
- atualização da stack de runtime `semcomp-production`.

## Critérios de aceite

- Um push na `main` só publica depois de todos os jobs de CI passarem.
- Uma CI vermelha não dispara publicação.
- O GitHub autentica na AWS por OIDC sem access key persistente.
- Deploys concorrentes são serializados e um deploy em andamento não é
  cancelado.
- Um release com banco existente só migra depois de criar e verificar o backup
  pré-deploy identificado pelo SHA.
- O release ativo na EC2 termina com o mesmo SHA do commit publicado.
- `https://gameficacao.semcomp.com.br/api/health` permanece saudável.
