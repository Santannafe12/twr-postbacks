# TWR — Receptor de Postbacks

API em TypeScript que recebe a notificação de uma venda concluída e devolve um relatório agregado. A aplicação publicada está em [https://twr-postbacks.vercel.app](https://twr-postbacks.vercel.app).

## Objetivo e funcionalidades

Plataformas de checkout avisam cada venda por webhook. Este serviço faz duas coisas:

- `POST /webhooks/sales` registra a venda, sem duplicar uma notificação repetida.
- `GET /reports/sales` informa a quantidade de vendas e o total em centavos, separado por moeda e por plataforma.
- `GET /health` responde que o processo está no ar, sem consultar o banco.

Não há cadastro de comprador, documento nem e-mail.

## Tecnologias

- NestJS 12 e TypeScript
- Node.js 24
- Prisma ORM 7
- PostgreSQL no Neon
- Vitest e Supertest

## Estrutura

- `src/sales` recebe o webhook, valida o corpo e aplica a idempotência.
- `src/reports` agrega as vendas no PostgreSQL.
- `src/prisma` abre o client só na primeira consulta.
- `prisma` guarda o schema e a migration versionada.

## Variáveis de ambiente

Copie `.env.example` para `.env`.

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão pooled do Neon, usada pela API. |
| `DIRECT_URL` | Conexão direta, usada só pelo Prisma na migration. |
| `WEBHOOK_SECRET` | Segredo compartilhado do header `x-webhook-secret`. |
| `RUN_DB_TESTS` | Deixe vazio. O valor `1` libera apenas `npm run test:db` na branch de desenvolvimento. |
| `PORT` | Porta local. O padrão é `3000`. |

Não commite o `.env`. Os exemplos abaixo usam `SEU_SEGREDO` no lugar do valor real.

## Execução local

```bash
npm install
npm run start:dev
```

A API fica em `http://localhost:3000`. `npm install` gera o Prisma Client. O client gerado não entra no Git.

## PostgreSQL

O banco é o Neon, em PostgreSQL 18. Não há Docker.

Use uma connection string pooled em `DATABASE_URL` e a connection string direta, sem `-pooler`, em `DIRECT_URL`. As duas devem apontar para a mesma branch.

## Migrations

A migration é aplicada manualmente. A API não migra o banco ao iniciar.

```bash
npx prisma migrate deploy
```

Esse comando usa `DIRECT_URL`. Não use `migrate dev`, `migrate reset` nem `db push` na branch de produção.

## Testes

`npm test` executa os testes unitários. Eles cobrem validação e ramos de erro que não precisam de banco.

`npm run test:e2e` executa os contratos HTTP com Supertest, sem Neon. Health, `401`, `400` e `503` entram aqui.

`npm run test:db` grava na branch `dev` do Neon. Ele só roda com `RUN_DB_TESTS=1` e recusa o host de produção. O `npm test` não dispara essa suíte.

```bash
npm test
npm run test:e2e
```

```bash
$env:RUN_DB_TESTS = '1'
npm run test:db
```

## Contrato

### POST /webhooks/sales

Exige o header `x-webhook-secret`. O corpo é JSON:

| Campo | Regra |
| --- | --- |
| `platform` | Slug de 1 a 64 caracteres. Espaços das pontas saem e o valor fica minúsculo. |
| `saleId` | Identificador externo, de 1 a 128 caracteres, sem mudar maiúsculas. |
| `amountCents` | Inteiro de `0` a `2147483647`. |
| `currency` | Código ISO 4217. `brl` vira `BRL`. |
| `occurredAt` | Data ISO-8601 com offset. Data impossível é rejeitada. |

A identidade da venda é `(platform, saleId)`.

```bash
curl -sS -X POST https://twr-postbacks.vercel.app/webhooks/sales \
  -H "content-type: application/json" \
  -H "x-webhook-secret: SEU_SEGREDO" \
  -d "{\"platform\":\"hotmart\",\"saleId\":\"sale_123\",\"amountCents\":19990,\"currency\":\"BRL\",\"occurredAt\":\"2026-10-27T12:00:00.000Z\"}"
```

A primeira notificação válida responde `201`:

```json
{
  "id": "37a59a40-8674-428f-a1b2-f0aa60dfba82",
  "platform": "hotmart",
  "saleId": "sale_123",
  "amountCents": 19990,
  "currency": "BRL",
  "occurredAt": "2026-10-27T12:00:00.000Z",
  "receivedAt": "2026-10-27T12:00:01.118Z",
  "idempotentReplay": false
}
```

O mesmo par `(platform, saleId)`, com o mesmo valor, a mesma moeda e o mesmo instante, responde `200` e `idempotentReplay: true`. O `id` não muda. Um offset diferente que represente o mesmo instante também é reenvio.

O mesmo par com valor, moeda ou instante diferente responde `409`:

```json
{
  "message": "Venda já registrada com dados diferentes",
  "error": "Conflict",
  "statusCode": 409
}
```

Segredo ausente, vazio ou errado responde `401` e `Webhook não autorizado`. Payload inválido responde `400`. Banco indisponível responde `503` e `Banco de dados indisponível`. Outra falha de persistência responde `500` e `Falha ao registrar a venda`.

### GET /reports/sales

Rota pública. Os filtros `platform`, `from` e `to` são opcionais. `from` e `to` usam o mesmo formato de `occurredAt` e entram na consulta como limites inclusivos, em UTC.

```bash
curl -sS "https://twr-postbacks.vercel.app/reports/sales?platform=hotmart&from=2026-10-27T00:00:00.000Z&to=2026-10-27T23:59:59.999Z"
```

```json
{
  "filters": {
    "platform": "hotmart",
    "from": "2026-10-27T00:00:00.000Z",
    "to": "2026-10-27T23:59:59.999Z"
  },
  "summary": {
    "saleCount": 2,
    "totalsByCurrency": [
      { "currency": "BRL", "saleCount": 1, "amountCents": 19990 },
      { "currency": "USD", "saleCount": 1, "amountCents": 5000 }
    ]
  },
  "byPlatform": [
    {
      "platform": "hotmart",
      "saleCount": 2,
      "totalsByCurrency": [
        { "currency": "BRL", "saleCount": 1, "amountCents": 19990 },
        { "currency": "USD", "saleCount": 1, "amountCents": 5000 }
      ]
    }
  ]
}
```

Sem vendas, a resposta continua `200`, com `saleCount` `0` e as listas vazias. Filtro inválido responde `400`. `from` posterior a `to` responde `400` e `from deve ser anterior ou igual a to`. Banco indisponível responde `503` e `Banco de dados indisponível`. Outra falha de consulta responde `500` e `Falha ao consultar o relatório`.

### GET /health

```bash
curl -sS https://twr-postbacks.vercel.app/health
```

```json
{ "status": "ok" }
```

## Premissas

Cada webhook representa uma venda já concluída. A plataforma de origem identifica essa venda por `platform` e `saleId`. Uma nova tentativa com os mesmos dados é a mesma venda. Uma tentativa com dados diferentes é um conflito e não substitui o registro.

O valor fica em centavos inteiros. BRL e USD não entram na mesma soma. O relatório não expõe comprador nem credencial, então a leitura é pública. O POST é que exige o segredo compartilhado.

## Decisões técnicas

A unicidade fica no índice `(platform, sale_id)` do PostgreSQL. Duas requisições simultâneas disputam essa constraint. Quem perde a corrida relê a linha e responde `200` se os dados forem os mesmos.

O segredo é comparado pelo hash SHA-256, com `timingSafeEqual`. A mensagem de erro é sempre `Webhook não autorizado`.

A data exige offset explícito. `2026-02-30` é rejeitada, em vez de ser corrigida pelo JavaScript.

O relatório usa `groupBy` no banco. A API só ordena plataformas e moedas. O client Prisma abre uma conexão quando a primeira consulta acontece. O health não passa por esse caminho.

A migration cria o default `gen_random_uuid()` e um check para `amount_cents` não negativo. Ela roda com `prisma migrate deploy`, fora do processo da API.

## Fora de escopo

Cancelamento e reembolso ficaram de fora porque o webhook deste desafio representa uma venda concluída. Passar a aceitar estorno mudaria o significado do registro.

Histórico de eventos e vários status pediriam outro modelo, para guardar a sequência em vez de uma linha por venda. Fila, Redis e microsserviço atenderiam um volume e uma operação que esta entrega não tem.

Rate limit e a assinatura HMAC de cada provedor fazem sentido num receptor ligado a várias plataformas, cada uma com o próprio esquema. Swagger e frontend não ajudam a avaliar o recebimento do webhook.

Essas escolhas cabem no tamanho do desafio. Num produto em produção, elas podem ser revistas.

## Limitações

O client usa uma conexão por instância. O relatório não lista nem pagina vendas individuais. O teste de integração não aponta para a branch de produção.

## URL pública

[https://twr-postbacks.vercel.app](https://twr-postbacks.vercel.app)
