# twr-postbacks

API do desafio técnico de desenvolvimento backend da The White Rabbit. Este repositório entrega o bootstrap de uma API NestJS com TypeScript, pronta para publicação na Vercel.

## Requisitos

- Node.js 20 ou superior
- npm

## Instalação

```bash
npm install
```

Copie `.env.example` para `.env` se quiser definir a porta local. O valor padrão é `3000`.

## Execução local

```bash
npm run start:dev
```

A API escuta em `http://localhost:3000`, ou na porta definida pela variável `PORT`.

## Verificação

```bash
curl http://localhost:3000/health
```

Resposta esperada:

```json
{ "status": "ok" }
```

## Scripts

- `npm run start:dev` — desenvolvimento com recarregamento
- `npm run build` — compilação
- `npm run start:prod` — execução do build
- `npm run lint` — análise estática
- `npm test` — testes unitários
- `npm run test:e2e` — testes de ponta a ponta

## Publicação

A Vercel detecta NestJS a partir de `src/main.ts` e não exige `vercel.json`. Publique este repositório no GitHub e importe o projeto na Vercel com o preset NestJS.
