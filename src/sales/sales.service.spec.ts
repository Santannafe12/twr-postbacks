import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { SalesService } from './sales.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const dto = {
  platform: 'hotmart',
  saleId: 'sale_123',
  amountCents: 19990,
  currency: 'BRL',
  occurredAt: '2026-10-27T12:00:00.000Z',
} as CreateSaleDto;

describe('SalesService persistence errors', () => {
  const create = vi.fn();
  const findUnique = vi.fn();
  const prisma = {
    client: {
      sale: {
        create,
        findUnique,
      },
    },
  } as unknown as PrismaService;
  const service = new SalesService(prisma);

  beforeEach(() => {
    create.mockReset();
    findUnique.mockReset();
  });

  it('returns 503 when the conflicting row cannot be read', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue(null);

    await expect(service.register(dto)).rejects.toThrow(
      new ServiceUnavailableException('Banco de dados indisponível'),
    );
  });

  it('returns 503 when rereading after P2002 loses the connection', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockRejectedValue({ code: 'P1001' });

    await expect(service.register(dto)).rejects.toThrow(
      new ServiceUnavailableException('Banco de dados indisponível'),
    );
  });

  it('maps unexpected failures to 500', async () => {
    create.mockRejectedValue(new Error('disco cheio'));

    await expect(service.register(dto)).rejects.toThrow(
      new InternalServerErrorException('Falha ao registrar a venda'),
    );
  });
});
