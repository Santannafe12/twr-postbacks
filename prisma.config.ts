import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const DATABASE_COMMANDS = new Set(['migrate', 'db', 'studio']);

const directUrl = process.env.DIRECT_URL?.trim();
const commandNeedsDatabase = process.argv.some((arg) =>
  DATABASE_COMMANDS.has(arg),
);

if (commandNeedsDatabase) {
  assertDirectUrl(directUrl);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: directUrl ? { url: directUrl } : undefined,
});

function assertDirectUrl(value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error(
      'DIRECT_URL é obrigatória para migrations e operações de banco.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DIRECT_URL não é uma URL válida.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DIRECT_URL precisa ser uma URL PostgreSQL.');
  }
}
