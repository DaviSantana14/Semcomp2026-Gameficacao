# Checklist de abertura — Marco 14

Preencher durante a abertura. Não registrar CPF, e-mail completo, senha,
cookie ou token; registrar somente status, horário, SHA, digest e URI.

## Identidade e evidências

- [ ] Responsável pela abertura: ____________________
- [ ] Data e horário oficial de abertura (BRT): ____________________
- [ ] Conta AWS e região confirmadas: `sa-east-1`
- [ ] Stack confirmada: `semcomp-production`
- [ ] SHA completo do release atual: ____________________
- [ ] Digest da imagem API: ____________________
- [ ] Digest da imagem web: ____________________
- [ ] EIP esperado: ____________________
- [ ] URI do backup inicial: ____________________
- [ ] Restore-check inicial concluído às: ____________________

## Edge e rede

- [ ] `semcomp.com.br` continua servindo a landing page anterior.
- [ ] `gameficacao.semcomp.com.br` resolve exatamente para o EIP registrado.
- [ ] HTTP retorna 301/308 para HTTPS.
- [ ] A rota ACME continua sem redirect.
- [ ] Certificado contém o hostname e não está expirado.
- [ ] HSTS está presente.
- [ ] CSP está em enforcement após a aprovação do smoke report-only.
- [ ] Framing está bloqueado.
- [ ] `nosniff`, Referrer-Policy e Permissions-Policy estão presentes.
- [ ] Portas 22, 3000, 3001 e 5432 não aceitam conexão pública.

## Aplicação

- [ ] `/api/health` retorna HTTP 200 com status saudável.
- [ ] `/api/docs` retorna 404.
- [ ] Smoke automatizado terminou apenas com linhas `PASS`.
- [ ] Logs passaram pelo scan de PII e credenciais sem exibir valores.
- [ ] Containers API, web, Nginx e PostgreSQL estão saudáveis.
- [ ] Relógio do host e sincronização NTP estão corretos.
- [ ] Nenhum dado descartável foi criado pelo smoke.

## Conta real do participante

- [ ] Login da conta real do participante concluído.
- [ ] Cookie de participante confirmou Secure, HttpOnly, SameSite=Lax e
  `Max-Age=28800` sem registrar seu conteúdo.
- [ ] Heartbeat retornou sucesso.
- [ ] Logout confirmado.

## Conta real do administrador/organizador

- [ ] Login com CPF, e-mail e senha reais concluído.
- [ ] Cookie administrativo confirmou Secure, HttpOnly, SameSite=Lax e
  `Max-Age=14400` sem registrar seu conteúdo.
- [ ] Dashboard abriu e carregou os dados esperados.
- [ ] Logout confirmado.

## Teste manual em celular real

- [ ] Dispositivo: ____________________  Sistema/navegador: ____________________
- [ ] Acesso feito em rede móvel ou Wi-Fi externo, não no host.
- [ ] Câmera traseira foi selecionada.
- [ ] Permissão de câmera foi solicitada e concedida.
- [ ] QR válido foi lido com sucesso.
- [ ] Cancelar a leitura não travou a tela nem criou mutação.
- [ ] Fallback manual foi exibido e funcionou.
- [ ] Nenhum código, ponto, recompensa ou atividade foi criado no teste.

## Decisão de abertura

- [ ] Todos os itens críticos acima estão verdes.
- [ ] Manutenção removida somente depois do enforcement confirmado.
- [ ] Horário de abertura/divulgação registrado: ____________________
- [ ] Responsável que autorizou a abertura: ____________________
- [ ] Incidentes ou ressalvas: ________________________________________
