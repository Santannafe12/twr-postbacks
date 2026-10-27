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
  it('rejects an impossible boundary', async () => {
    await expect(
      transform({ from: '2026-02-30T12:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
