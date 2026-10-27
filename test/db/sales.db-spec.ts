import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { assertDevDatabase } from './dev-database.js';

const SECRET = 'segredo-de-teste';
const runId = randomBytes(4).toString('hex');
const platforms = new Set<string>();

type SaleBody = {
  platform: string;
  saleId: string;
  amountCents: number;
  currency: string;
  occurredAt: string;
};

describe('sales on the dev database', () => {
  let app: INestApplication<App> | undefined;

  beforeAll(async () => {
    assertDevDatabase();
    process.env.WEBHOOK_SECRET = SECRET;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app && platforms.size > 0) {
        const prisma = app.get(PrismaService);
        await prisma.client.sale.deleteMany({
          where: { platform: { in: [...platforms] } },
        });
      }
    } finally {
      await app?.close();
    }
  });

  it('stores a valid sale', async () => {
    const platform = track('reg');
    const saleId = `sale-${runId}-reg`;
    const response = await postSale(sale(platform, saleId));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      platform,
      saleId,
      amountCents: 19990,
      currency: 'BRL',
      idempotentReplay: false,
    });
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const report = await getReport({ platform });
    expect(report.status).toBe(200);
    expect(report.body.summary).toEqual({
      saleCount: 1,
      totalsByCurrency: [{ currency: 'BRL', saleCount: 1, amountCents: 19990 }],
    });
  });

  it('replays the same instant without inserting another sale', async () => {
    const platform = track('replay');
    const saleId = `sale-${runId}-replay`;
    const first = await postSale(
      sale(platform, saleId, { occurredAt: '2099-03-15T10:00:00-03:00' }),
    );
    const second = await postSale(
      sale(platform, saleId, { occurredAt: '2099-03-15T13:00:00.000Z' }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      id: first.body.id,
      idempotentReplay: true,
      amountCents: 19990,
    });

    const report = await getReport({ platform });
    expect(report.body.summary.saleCount).toBe(1);
  });

  it('keeps the original sale when the payload conflicts', async () => {
    const platform = track('conflict');
    const saleId = `sale-${runId}-conflict`;
    const first = await postSale(sale(platform, saleId, { amountCents: 1000 }));
    const second = await postSale(
      sale(platform, saleId, { amountCents: 2000 }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.message).toBe(
      'Venda já registrada com dados diferentes',
    );
    expect(JSON.stringify(second.body)).not.toMatch(/postgres(?:ql)?:\/\//i);

    const report = await getReport({ platform });
    expect(report.body.summary).toEqual({
      saleCount: 1,
      totalsByCurrency: [{ currency: 'BRL', saleCount: 1, amountCents: 1000 }],
    });
  });

  it('collapses concurrent posts into one sale', async () => {
    const platform = track('race');
    const payload = sale(platform, `sale-${runId}-race`);
    const [left, right] = await Promise.all([
      postSale(payload),
      postSale(payload),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 201]);
    expect(left.body.id).toBe(right.body.id);
    expect(
      [left, right].find((response) => response.status === 201)?.body
        .idempotentReplay,
    ).toBe(false);
    expect(
      [left, right].find((response) => response.status === 200)?.body
        .idempotentReplay,
    ).toBe(true);

    const report = await getReport({ platform });
    expect(report.body.summary.saleCount).toBe(1);
  });

  it('aggregates platforms and currencies separately', async () => {
    const platformA = track('a');
    const platformB = track('b');
    const window = instantPair(Date.UTC(2099, 5, 1));
    await expectWindowEmpty(window.from, window.to);

    expect(
      (
        await postSale(
          sale(platformA, `sale-${runId}-brl`, {
            amountCents: 30000,
            occurredAt: window.from,
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postSale(
          sale(platformA, `sale-${runId}-usd`, {
            amountCents: 5000,
            currency: 'USD',
            occurredAt: window.to,
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postSale(
          sale(platformB, `sale-${runId}-brl`, {
            amountCents: 10000,
            occurredAt: window.from,
          }),
        )
      ).status,
    ).toBe(201);

    const report = await getReport({ from: window.from, to: window.to });
    expect(report.status).toBe(200);
    expect(report.body.summary).toEqual({
      saleCount: 3,
      totalsByCurrency: [
        { currency: 'BRL', saleCount: 2, amountCents: 40000 },
        { currency: 'USD', saleCount: 1, amountCents: 5000 },
      ],
    });
    expect(report.body.byPlatform).toEqual([
      {
        platform: platformA,
        saleCount: 2,
        totalsByCurrency: [
          { currency: 'BRL', saleCount: 1, amountCents: 30000 },
          { currency: 'USD', saleCount: 1, amountCents: 5000 },
        ],
      },
      {
        platform: platformB,
        saleCount: 1,
        totalsByCurrency: [
          { currency: 'BRL', saleCount: 1, amountCents: 10000 },
        ],
      },
    ]);

    const filtered = await getReport({ platform: platformA });
    expect(filtered.body.summary).toEqual({
      saleCount: 2,
      totalsByCurrency: [
        { currency: 'BRL', saleCount: 1, amountCents: 30000 },
        { currency: 'USD', saleCount: 1, amountCents: 5000 },
      ],
    });
    expect(filtered.body.byPlatform).toEqual([
      {
        platform: platformA,
        saleCount: 2,
        totalsByCurrency: [
          { currency: 'BRL', saleCount: 1, amountCents: 30000 },
          { currency: 'USD', saleCount: 1, amountCents: 5000 },
        ],
      },
    ]);

    const empty = await getReport({ platform: `twr${runId}empty` });
    expect(empty.status).toBe(200);
    expect(empty.body.summary).toEqual({ saleCount: 0, totalsByCurrency: [] });
    expect(empty.body.byPlatform).toEqual([]);
  });

  it('treats period bounds as inclusive', async () => {
    const platform = track('period');
    const window = periodWindow();
    await expectWindowEmpty(window.before, window.after);

    expect(
      (
        await postSale(
          sale(platform, `sale-${runId}-before`, {
            amountCents: 50,
            occurredAt: window.before,
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postSale(
          sale(platform, `sale-${runId}-from`, {
            amountCents: 100,
            occurredAt: window.from,
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postSale(
          sale(platform, `sale-${runId}-to`, {
            amountCents: 200,
            occurredAt: window.to,
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postSale(
          sale(platform, `sale-${runId}-after`, {
            amountCents: 400,
            occurredAt: window.after,
          }),
        )
      ).status,
    ).toBe(201);

    const inside = await getReport({
      platform,
      from: window.from,
      to: window.to,
    });
    expect(inside.body.summary).toEqual({
      saleCount: 2,
      totalsByCurrency: [{ currency: 'BRL', saleCount: 2, amountCents: 300 }],
    });

    const lowerBound = await getReport({
      platform,
      from: window.from,
      to: window.from,
    });
    expect(lowerBound.body.summary.saleCount).toBe(1);
    expect(lowerBound.body.summary.totalsByCurrency[0].amountCents).toBe(100);

    const upperBound = await getReport({
      platform,
      from: window.to,
      to: window.to,
    });
    expect(upperBound.body.summary.saleCount).toBe(1);
    expect(upperBound.body.summary.totalsByCurrency[0].amountCents).toBe(200);
  });

  function http() {
    if (!app) {
      throw new Error('Aplicação de teste indisponível.');
    }

    return app.getHttpServer();
  }

  function postSale(payload: SaleBody): Promise<Response> {
    return request(http())
      .post('/webhooks/sales')
      .set('x-webhook-secret', SECRET)
      .send(payload);
  }

  function getReport(query: Record<string, string>): Promise<Response> {
    return request(http()).get('/reports/sales').query(query);
  }

  async function expectWindowEmpty(from: string, to: string) {
    const response = await getReport({ from, to });
    expect(response.status).toBe(200);
    if (response.body.summary.saleCount !== 0) {
      throw new Error(
        `Janela de teste ocupada (${from} até ${to}). Nenhuma venda foi inserida.`,
      );
    }
  }
});

function track(suffix: string): string {
  const platform = `twr${runId}${suffix}`;
  platforms.add(platform);
  return platform;
}

function sale(
  platform: string,
  saleId: string,
  overrides: Partial<SaleBody> = {},
): SaleBody {
  return {
    platform,
    saleId,
    amountCents: 19990,
    currency: 'BRL',
    occurredAt: '2099-03-15T12:00:00.000Z',
    ...overrides,
  };
}

function instantPair(startMs: number) {
  const fromMs = startMs + Math.floor(Math.random() * 86_400_000);
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(fromMs + 1).toISOString(),
  };
}

function periodWindow() {
  const fromMs = Date.UTC(2099, 8, 1) + Math.floor(Math.random() * 86_400_000);
  return {
    before: new Date(fromMs - 1).toISOString(),
    from: new Date(fromMs).toISOString(),
    to: new Date(fromMs + 2).toISOString(),
    after: new Date(fromMs + 3).toISOString(),
  };
}
