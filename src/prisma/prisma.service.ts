import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private prisma: PrismaClient | undefined;

  get client(): PrismaClient {
    if (!this.prisma) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new ServiceUnavailableException('Banco de dados indisponível');
      }

      const adapter = new PrismaNeon({ connectionString, max: 1 });
      this.prisma = new PrismaClient({ adapter });
    }

    return this.prisma;
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma?.$disconnect();
  }
}
