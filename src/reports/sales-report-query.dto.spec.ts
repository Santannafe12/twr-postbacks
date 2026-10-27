import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SalesReportQueryDto } from './dto/sales-report-query.dto.js';

async function transform(payload: object) {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  return pipe.transform(payload, {
    type: 'query',
    metatype: SalesReportQueryDto,
  });
}

describe('SalesReportQueryDto', () => {
  it('normalizes platform to a lowercase slug', async () => {
    await expect(transform({ platform: ' Hotmart ' })).resolves.toMatchObject({
      platform: 'hotmart',
    });
  });

  it('accepts from and to with Z and an explicit offset', async () => {
    await expect(
      transform({
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-27T12:00:00-03:00',
      }),
    ).resolves.toMatchObject({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-27T12:00:00-03:00',
    });
  });

  it.each(['2026-10-27', '2026-10-27T12:00:00', '2026-10-27T12:00:00.0000Z'])(
    'rejects occurredAt boundary %s',
    async (from) => {
      await expect(transform({ from })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it.each([
    '2026-02-30T12:00:00Z',
    '2026-10-27T24:00:00Z',
    '2026-10-27T12:00:00+24:00',
  ])('rejects impossible boundary %s', async (to) => {
    await expect(transform({ to })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a platform with an internal space', async () => {
    await expect(transform({ platform: 'hot mart' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty platform string', async () => {
    await expect(transform({ platform: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown query parameter', async () => {
    await expect(transform({ customer: 'ada' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an empty query', async () => {
    const result = await transform({});

    expect(result.platform).toBeUndefined();
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
  });
});
