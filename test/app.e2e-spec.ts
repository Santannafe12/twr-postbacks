import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

const SECRET = 'segredo-de-teste';

const validSale = {
  platform: 'hotmart',
  saleId: 'sale_123',
  amountCents: 19990,
  currency: 'BRL',
  occurredAt: '2026-10-27T12:00:00.000Z',
};

function assertNoSensitiveData(body: unknown, ...secrets: string[]) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/postgres(?:ql)?:\/\//i);
  for (const secret of secrets) {
    if (secret) {
      expect(serialized).not.toContain(secret);
    }
  }
}

describe('HTTP contracts without a database', () => {
  let app: INestApplication<App>;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalSecret = process.env.WEBHOOK_SECRET;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    process.env.WEBHOOK_SECRET = SECRET;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(() => {
    process.env.WEBHOOK_SECRET = SECRET;
  });

  afterAll(async () => {
    await app.close();

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalSecret === undefined) {
      delete process.env.WEBHOOK_SECRET;
    } else {
      process.env.WEBHOOK_SECRET = originalSecret;
    }
  });

  it('keeps health available when the database is absent', async () => {
    const health = await request(app.getHttpServer()).get('/health');
    const created = await request(app.getHttpServer())
      .post('/webhooks/sales')
      .set('x-webhook-secret', SECRET)
      .send(validSale);
    const report = await request(app.getHttpServer()).get('/reports/sales');
    const healthAfter = await request(app.getHttpServer()).get('/health');

    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
    expect(created.status).toBe(503);
    expect(created.body.message).toBe('Banco de dados indisponível');
    expect(report.status).toBe(503);
    expect(report.body.message).toBe('Banco de dados indisponível');
    expect(healthAfter.status).toBe(200);
    expect(healthAfter.body).toEqual({ status: 'ok' });
    assertNoSensitiveData(created.body, SECRET);
    assertNoSensitiveData(report.body, SECRET);
  });

  it('rejects a missing webhook secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks/sales')
      .send(validSale);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Webhook não autorizado');
    assertNoSensitiveData(response.body, SECRET);
  });

  it('rejects a wrong webhook secret', async () => {
    const provided = 'outro-segredo';
    const response = await request(app.getHttpServer())
      .post('/webhooks/sales')
      .set('x-webhook-secret', provided)
      .send(validSale);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Webhook não autorizado');
    assertNoSensitiveData(response.body, SECRET, provided);
  });

  it('rejects an empty webhook secret', async () => {
    process.env.WEBHOOK_SECRET = '';

    const response = await request(app.getHttpServer())
      .post('/webhooks/sales')
      .set('x-webhook-secret', SECRET)
      .send(validSale);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Webhook não autorizado');
    assertNoSensitiveData(response.body, SECRET);
  });

  it('rejects an impossible sale date', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks/sales')
      .set('x-webhook-secret', SECRET)
      .send({ ...validSale, occurredAt: '2026-02-30T12:00:00Z' });

    expect(response.status).toBe(400);
    assertNoSensitiveData(response.body, SECRET);
  });
});
