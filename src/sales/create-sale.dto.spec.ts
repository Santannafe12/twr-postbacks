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

  it('rejects a negative amount', async () => {
    await expect(
      transform({ ...validPayload, amountCents: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a currency outside ISO 4217', async () => {
    await expect(
      transform({ ...validPayload, currency: 'ZZZ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    '2026-10-27T12:00:00',
    '2026-02-30T12:00:00Z',
    '2026-10-27T24:00:00Z',
    '2026-10-27T12:00:00+24:00',
  ])('rejects occurredAt %s', async (occurredAt) => {
    await expect(
      transform({ ...validPayload, occurredAt }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
