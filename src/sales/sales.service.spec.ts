import {
  ConflictException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { SalesService } from './sales.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const occurredAt = new Date('2026-10-27T12:00:00.000Z');
const createdAt = new Date('2026-10-27T12:00:01.123Z');

const dto = {
  platform: 'hotmart',
  saleId: 'sale_123',
  amountCents: 19990,
  currency: 'BRL',
  occurredAt: '2026-10-27T12:00:00.000Z',
} as CreateSaleDto;

function storedSale(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sale-id',
    platform: 'hotmart',
    saleId: 'sale_123',
    amountCents: 19990,
    currency: 'BRL',
    occurredAt,
    createdAt,
    ...overrides,
  };
}

describe('SalesService', () => {
  const create = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const prisma = {
    client: {
      sale: {
        create,
        findUnique,
        update,
      },
    },
  } as unknown as PrismaService;
  const service = new SalesService(prisma);

  beforeEach(() => {
    create.mockReset();
    findUnique.mockReset();
    update.mockReset();
  });

  it('returns the created sale', async () => {
    create.mockResolvedValue(storedSale());

    await expect(service.register(dto)).resolves.toEqual({
      id: 'sale-id',
      platform: 'hotmart',
      saleId: 'sale_123',
      amountCents: 19990,
      currency: 'BRL',
      occurredAt: occurredAt.toISOString(),
      receivedAt: createdAt.toISOString(),
      idempotentReplay: false,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        platform: 'hotmart',
        saleId: 'sale_123',
        amountCents: 19990,
        currency: 'BRL',
        occurredAt: new Date(dto.occurredAt),
      },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('replays an equivalent notification', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue(storedSale());

    await expect(service.register(dto)).resolves.toMatchObject({
      id: 'sale-id',
      idempotentReplay: true,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a conflicting amount', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue(storedSale({ amountCents: 100 }));

    await expect(service.register(dto)).rejects.toThrow(
      new ConflictException('Venda já registrada com dados diferentes'),
    );
    expect(update).not.toHaveBeenCalled();
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
    expect(update).not.toHaveBeenCalled();
  });

  it('maps connection failures to 503', async () => {
    create.mockRejectedValue({ code: 'P1001' });

    await expect(service.register(dto)).rejects.toThrow(
      new ServiceUnavailableException('Banco de dados indisponível'),
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('maps unexpected failures to 500', async () => {
    create.mockRejectedValue(new Error('disco cheio'));

    await expect(service.register(dto)).rejects.toThrow(
      new InternalServerErrorException('Falha ao registrar a venda'),
    );
  });
});
