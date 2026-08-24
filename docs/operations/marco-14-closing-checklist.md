# Checklist de fechamento — Marco 14

Preencher antes de qualquer destruição autorizada. Não registrar CPF, e-mail
completo, senha, cookie ou token.

## Identidade do fechamento

- [ ] Responsável pelo fechamento: ____________________
- [ ] Data e horário de encerramento (BRT): ____________________
- [ ] Motivo/encerramento comunicado às: ____________________
- [ ] SHA completo do release que encerrou o evento: ____________________
- [ ] Digest da imagem API: ____________________
- [ ] Digest da imagem web: ____________________

## Contenção e evidências

- [ ] Novas mutações foram bloqueadas por procedimento.
- [ ] Nginx está em manutenção.
- [ ] Leitura necessária foi preservada até a coleta das evidências.
- [ ] Smoke final executado antes da manutenção ou resultado registrado.
- [ ] Health final registrado.
- [ ] CPU, memória, disco e reinícios dos containers registrados.
- [ ] Logs passaram pelo scan de PII e credenciais sem exibir valores.
- [ ] Alarmes de custo e status do orçamento registrados sem expor e-mail.

## Backup final

- [ ] Backup final produzido em: ____________________
- [ ] URI S3 completa: ____________________
- [ ] Prefixo confirmado como `backups/production/`.
- [ ] Criptografia SSE-S3 confirmada.
- [ ] Restore-check executado em projeto Compose descartável.
- [ ] Restore-check concluído às: ____________________
- [ ] Contagens agregadas registradas sem dados pessoais.
- [ ] Projeto descartável removido.
- [ ] `semcomp-production` permaneceu intacto durante a verificação.

## Recursos e retenção

- [ ] Release atual e os dois anteriores identificados.
- [ ] Imagens sem referência revisadas; nenhum volume removido.
- [ ] Volume PostgreSQL preservado.
- [ ] `certbot_etc` e `certbot_webroot` preservados até a autorização final.
- [ ] Bucket e todos os backups preservados.
- [ ] Snapshot retido identificado.
- [ ] Registro DNS ainda não removido sem decisão separada.

## Autorização de destruição

- [ ] Inventário da stack, EIP, volume, snapshot, bucket e backups anexado.
- [ ] Autorização explícita para destruir recursos: ____________________
- [ ] Responsável pela autorização: ____________________
- [ ] Horário da autorização: ____________________
- [ ] Recursos destruídos, se autorizados: ____________________
- [ ] Recursos preservados: ____________________
- [ ] DevOps informado sobre quando o registro A poderá ser removido.

## Fechamento concluído

- [ ] URI, digest e horário foram enviados ao registro operacional.
- [ ] Nenhum segredo foi persistido em checklist, terminal compartilhado ou
  chat.
- [ ] Observações e incidentes: ________________________________________
