import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SalesReportQueryDto } from './dto/sales-report-query.dto.js';

const UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1017']);

export type CurrencyTotal = {
  currency: string;
  saleCount: number;
  amountCents: number;
};

export type PlatformReport = {
  platform: string;
  saleCount: number;
  totalsByCurrency: CurrencyTotal[];
};

export type SalesReport = {
  filters: {
    platform: string | null;
    from: string | null;
    to: string | null;
  };
  summary: {
    saleCount: number;
    totalsByCurrency: CurrencyTotal[];
  };
  byPlatform: PlatformReport[];
};

type GroupedSale = {
  platform: string;
  currency: string;
  _count: { _all: number };
  _sum: { amountCents: number | null };
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async report(query: SalesReportQueryDto): Promise<SalesReport> {
    const platform = query.platform ?? null;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('from deve ser anterior ou igual a to');
    }

    const where: Prisma.SaleWhereInput = {
      ...(platform ? { platform } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    try {
      const rows = await this.prisma.client.sale.groupBy({
        by: ['platform', 'currency'],
        where,
        _count: { _all: true },
        _sum: { amountCents: true },
      });

      return toReport(platform, from, to, rows);
    } catch (error) {
      throw this.toQueryException(error);
    }
  }

  private toQueryException(
    error: unknown,
  ): ServiceUnavailableException | InternalServerErrorException {
    const code = readErrorCode(error);
    this.logger.error(
      `Falha ao consultar relatório code=${code ?? 'unknown'} message=${safeErrorMessage(error)}`,
    );

    if (isDatabaseUnavailable(error)) {
      return new ServiceUnavailableException('Banco de dados indisponível');
    }

    return new InternalServerErrorException('Falha ao consultar o relatório');
  }
}

function toReport(
  platform: string | null,
  from: Date | null,
  to: Date | null,
  rows: GroupedSale[],
): SalesReport {
  const byPlatform = groupByPlatform(rows);
  const totalsByCurrency = summarizeCurrencies(byPlatform);

  return {
    filters: {
      platform,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
    summary: {
      saleCount: totalsByCurrency.reduce(
        (sum, total) => sum + total.saleCount,
        0,
      ),
      totalsByCurrency,
    },
    byPlatform,
  };
}

function groupByPlatform(rows: GroupedSale[]): PlatformReport[] {
  const grouped = new Map<string, CurrencyTotal[]>();

  for (const row of rows) {
    const totals = grouped.get(row.platform) ?? [];
    totals.push({
      currency: row.currency,
      saleCount: row._count._all,
      amountCents: row._sum.amountCents ?? 0,
    });
    grouped.set(row.platform, totals);
  }

  return [...grouped.entries()]
    .map(([platform, totals]) => {
      const totalsByCurrency = [...totals].sort((left, right) =>
        compareText(left.currency, right.currency),
      );

      return {
        platform,
        saleCount: totalsByCurrency.reduce(
          (sum, total) => sum + total.saleCount,
          0,
        ),
        totalsByCurrency,
      };
    })
    .sort((left, right) => compareText(left.platform, right.platform));
}

function summarizeCurrencies(platforms: PlatformReport[]): CurrencyTotal[] {
  const grouped = new Map<string, CurrencyTotal>();

  for (const platform of platforms) {
    for (const total of platform.totalsByCurrency) {
      const current = grouped.get(total.currency) ?? {
        currency: total.currency,
        saleCount: 0,
        amountCents: 0,
      };
      current.saleCount += total.saleCount;
      current.amountCents += total.amountCents;
      grouped.set(total.currency, current);
    }
  }

  return [...grouped.values()].sort((left, right) =>
    compareText(left.currency, right.currency),
  );
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof ServiceUnavailableException) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  const code = readErrorCode(error);
  return code !== undefined && UNAVAILABLE_CODES.has(code);
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const code = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'erro desconhecido';
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]');
}
