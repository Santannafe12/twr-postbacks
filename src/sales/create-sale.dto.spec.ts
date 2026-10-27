import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateSaleDto } from './dto/create-sale.dto.js';

const validPayload = {
  platform: 'Hotmart',
  saleId: ' Sale_123 ',
  amountCents: 19990,
  currency: 'brl',
  occurredAt: '2026-10-27T12:00:00Z',
};

async function transform(payload: object) {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  return pipe.transform(payload, {
    type: 'body',
    metatype: CreateSaleDto,
  });
}

describe('CreateSaleDto', () => {
  it('normalizes platform, currency and saleId', async () => {
    await expect(transform(validPayload)).resolves.toMatchObject({
      platform: 'hotmart',
      saleId: 'Sale_123',
      amountCents: 19990,
      currency: 'BRL',
      occurredAt: '2026-10-27T12:00:00Z',
    });
  });

  it('rejects an unexpected field', async () => {
    await expect(
      transform({ ...validPayload, customer: 'ada' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([-1, 19990.5, '19990'])(
    'rejects amountCents %s',
    async (amountCents) => {
      await expect(
        transform({ ...validPayload, amountCents }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each(['BR', 'ZZZ'])('rejects currency %s', async (currency) => {
    await expect(
      transform({ ...validPayload, currency }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['2026-10-27T12:00:00', '2026-10-27', '2026-10-27T12:00:00.0000Z'])(
    'rejects occurredAt %s',
    async (occurredAt) => {
      await expect(
        transform({ ...validPayload, occurredAt }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each([
    '2026-02-30T12:00:00Z',
    '2026-04-31T00:00:00Z',
    '2025-02-29T12:00:00Z',
    '2026-13-01T12:00:00Z',
    '2026-00-10T12:00:00Z',
    '2026-10-27T24:00:00Z',
    '2026-10-27T12:60:00Z',
    '2026-10-27T12:00:60Z',
    '2026-10-27T12:00:00+24:00',
    '2026-10-27T12:00:00+00:60',
  ])('rejects impossible occurredAt %s', async (occurredAt) => {
    await expect(
      transform({ ...validPayload, occurredAt }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    '2024-02-29T23:59:59Z',
    '2026-10-27T12:00:00.5Z',
    '2026-10-27T12:00:00-03:00',
    '2026-10-27T12:00:00+14:00',
  ])('accepts occurredAt %s', async (occurredAt) => {
    await expect(
      transform({ ...validPayload, occurredAt }),
    ).resolves.toMatchObject({ occurredAt });
  });

  it.each(['', 'hot mart'])('rejects platform %s', async (platform) => {
    await expect(
      transform({ ...validPayload, platform }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
