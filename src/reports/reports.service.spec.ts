import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SalesReportQueryDto } from './dto/sales-report-query.dto.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  const groupBy = vi.fn();
  const prisma = {
    client: {
      sale: {
        groupBy,
      },
    },
  } as unknown as PrismaService;
  const service = new ReportsService(prisma);

  beforeEach(() => {
    groupBy.mockReset();
  });

  it('rejects an inverted period before querying', async () => {
    await expect(
      service.report({
        from: '2026-10-27T12:00:01.000Z',
        to: '2026-10-27T12:00:00.000Z',
      } as SalesReportQueryDto),
    ).rejects.toThrow(
      new BadRequestException('from deve ser anterior ou igual a to'),
    );
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('maps connection failures to 503', async () => {
    groupBy.mockRejectedValue({ code: 'P1001' });

    await expect(service.report({} as SalesReportQueryDto)).rejects.toThrow(
      new ServiceUnavailableException('Banco de dados indisponível'),
    );
  });

  it('maps unexpected failures to 500', async () => {
    groupBy.mockRejectedValue(new Error('disco cheio'));

    await expect(service.report({} as SalesReportQueryDto)).rejects.toThrow(
      new InternalServerErrorException('Falha ao consultar o relatório'),
    );
  });
});
