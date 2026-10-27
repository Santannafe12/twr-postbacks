const DEV_HOST_PREFIX = 'ep-long-grass-b6wyaus4';
const PRODUCTION_HOST_MARKER = 'ep-royal-thunder';

export function assertDevDatabase(): void {
  if (process.env.RUN_DB_TESTS !== '1') {
    throw new Error('RUN_DB_TESTS=1 é obrigatório para testes com banco.');
  }

  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error('DATABASE_URL ausente.');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL não é uma URL válida.');
  }

  const host = url.hostname;
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`Recusado: DATABASE_URL não é PostgreSQL (${host}).`);
  }

  if (host.includes(PRODUCTION_HOST_MARKER)) {
    throw new Error(`Recusado: DATABASE_URL aponta para produção (${host}).`);
  }

  if (!host.startsWith(DEV_HOST_PREFIX)) {
    throw new Error(`Recusado: DATABASE_URL não é a branch dev (${host}).`);
  }
}
