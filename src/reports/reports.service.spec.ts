import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SalesReportQueryDto } from './dto/sales-report-query.dto.js';
import { ReportsService } from './reports.service.js';

const groupedRows = [
  {
    platform: 'kiwify',
    currency: 'BRL',
    _count: { _all: 1 },
    _sum: { amountCents: 10000 },
  },
  {
    platform: 'hotmart',
    currency: 'USD',
    _count: { _all: 1 },
    _sum: { amountCents: 5000 },
  },
  {
    platform: 'hotmart',
    currency: 'BRL',
    _count: { _all: 2 },
    _sum: { amountCents: 30000 },
  },
];

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
    groupBy.mockResolvedValue([]);
  });

  it('queries without a where filter', async () => {
    await service.report({} as SalesReportQueryDto);

    expect(groupBy).toHaveBeenCalledWith({
      by: ['platform', 'currency'],
      where: {},
      _count: { _all: true },
      _sum: { amountCents: true },
    });
  });

  it('filters by platform', async () => {
    await service.report({ platform: 'hotmart' } as SalesReportQueryDto);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform: 'hotmart' },
      }),
    );
  });

  it('uses an inclusive lower bound', async () => {
    const from = '2026-10-01T00:00:00.000Z';

    await expect(
      service.report({ from } as SalesReportQueryDto),
    ).resolves.toMatchObject({
      filters: { platform: null, from, to: null },
    });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { occurredAt: { gte: new Date(from) } },
      }),
    );
  });

  it('uses an inclusive upper bound', async () => {
    const to = '2026-10-27T23:59:59.999Z';

    await service.report({ to } as SalesReportQueryDto);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { occurredAt: { lte: new Date(to) } },
      }),
    );
  });

  it('converts an offset to the same UTC instant', async () => {
    const from = '2026-10-27T12:00:00-03:00';
    const to = '2026-10-27T15:00:00.000Z';

    await expect(
      service.report({ from, to } as SalesReportQueryDto),
    ).resolves.toMatchObject({
      filters: {
        platform: null,
        from: '2026-10-27T15:00:00.000Z',
        to,
      },
    });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          occurredAt: {
            gte: new Date(from),
            lte: new Date(to),
          },
        },
      }),
    );
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

  it('accepts the same instant as both bounds', async () => {
    const instant = '2026-10-27T12:00:00.000Z';

    await service.report({
      from: instant,
      to: instant,
    } as SalesReportQueryDto);

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          occurredAt: {
            gte: new Date(instant),
            lte: new Date(instant),
          },
        },
      }),
    );
  });

  it('aggregates currencies without mixing them', async () => {
    groupBy.mockResolvedValue(groupedRows);

    const report = await service.report({} as SalesReportQueryDto);

    expect(report).toEqual({
      filters: { platform: null, from: null, to: null },
      summary: {
        saleCount: 4,
        totalsByCurrency: [
          { currency: 'BRL', saleCount: 3, amountCents: 40000 },
          { currency: 'USD', saleCount: 1, amountCents: 5000 },
        ],
      },
      byPlatform: [
        {
          platform: 'hotmart',
          saleCount: 3,
          totalsByCurrency: [
            { currency: 'BRL', saleCount: 2, amountCents: 30000 },
            { currency: 'USD', saleCount: 1, amountCents: 5000 },
          ],
        },
        {
          platform: 'kiwify',
          saleCount: 1,
          totalsByCurrency: [
            { currency: 'BRL', saleCount: 1, amountCents: 10000 },
          ],
        },
      ],
    });
    expect(Object.keys(report.summary)).toEqual([
      'saleCount',
      'totalsByCurrency',
    ]);
  });

  it('treats a null sum as zero cents', async () => {
    groupBy.mockResolvedValue([
      {
        platform: 'hotmart',
        currency: 'BRL',
        _count: { _all: 2 },
        _sum: { amountCents: null },
      },
    ]);

    await expect(
      service.report({} as SalesReportQueryDto),
    ).resolves.toMatchObject({
      summary: {
        totalsByCurrency: [{ currency: 'BRL', saleCount: 2, amountCents: 0 }],
      },
    });
  });

  it('returns an empty report', async () => {
    await expect(service.report({} as SalesReportQueryDto)).resolves.toEqual({
      filters: { platform: null, from: null, to: null },
      summary: { saleCount: 0, totalsByCurrency: [] },
      byPlatform: [],
    });
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
