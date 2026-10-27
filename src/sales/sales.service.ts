import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';

const UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1017']);

export type SaleResponse = {
  id: string;
  platform: string;
  saleId: string;
  amountCents: number;
  currency: string;
  occurredAt: string;
  receivedAt: string;
  idempotentReplay: boolean;
};

type StoredSale = {
  id: string;
  platform: string;
  saleId: string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  createdAt: Date;
};

type SaleData = {
  platform: string;
  saleId: string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
};

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(dto: CreateSaleDto): Promise<SaleResponse> {
    const data: SaleData = {
      platform: dto.platform,
      saleId: dto.saleId,
      amountCents: dto.amountCents,
      currency: dto.currency,
      occurredAt: new Date(dto.occurredAt),
    };

    try {
      const created = await this.prisma.client.sale.create({ data });
      return this.toResponse(created, false);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return this.resolveDuplicate(data);
      }

      throw this.toPersistenceException(error, data.platform, data.saleId);
    }
  }

  private async resolveDuplicate(data: SaleData): Promise<SaleResponse> {
    let existing: StoredSale | null;

    try {
      existing = await this.prisma.client.sale.findUnique({
        where: {
          platform_saleId: {
            platform: data.platform,
            saleId: data.saleId,
          },
        },
      });
    } catch (error) {
      throw this.toPersistenceException(error, data.platform, data.saleId);
    }

    if (!existing) {
      this.logger.error(
        `Venda não encontrada após conflito platform=${data.platform} saleId=${data.saleId}`,
      );
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }

    const sameSale =
      existing.amountCents === data.amountCents &&
      existing.currency === data.currency &&
      existing.occurredAt.getTime() === data.occurredAt.getTime();

    if (!sameSale) {
      throw new ConflictException('Venda já registrada com dados diferentes');
    }

    return this.toResponse(existing, true);
  }

  private toResponse(
    sale: StoredSale,
    idempotentReplay: boolean,
  ): SaleResponse {
    return {
      id: sale.id,
      platform: sale.platform,
      saleId: sale.saleId,
      amountCents: sale.amountCents,
      currency: sale.currency,
      occurredAt: sale.occurredAt.toISOString(),
      receivedAt: sale.createdAt.toISOString(),
      idempotentReplay,
    };
  }

  private toPersistenceException(
    error: unknown,
    platform: string,
    saleId: string,
  ): ServiceUnavailableException | InternalServerErrorException {
    const code = readErrorCode(error);
    this.logger.error(
      `Falha ao registrar venda platform=${platform} saleId=${saleId} code=${code ?? 'unknown'} message=${safeErrorMessage(error)}`,
    );

    if (isDatabaseUnavailable(error)) {
      return new ServiceUnavailableException('Banco de dados indisponível');
    }

    return new InternalServerErrorException('Falha ao registrar a venda');
  }
}

function isUniqueViolation(error: unknown): boolean {
  return readErrorCode(error) === 'P2002';
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
