import { assertDevDatabase } from './dev-database.js';

const DEV_URL =
  'postgresql://user:secret-password@ep-long-grass-b6wyaus4-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require';
const DIRECT_DEV_URL =
  'postgresql://user:secret-password@ep-long-grass-b6wyaus4.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require';
const PRODUCTION_URL =
  'postgresql://user:secret-password@ep-royal-thunder-b6axo5pn.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require';

describe('assertDevDatabase', () => {
  const originalFlag = process.env.RUN_DB_TESTS;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    restore('RUN_DB_TESTS', originalFlag);
    restore('DATABASE_URL', originalDatabaseUrl);
  });

  it('requires the explicit flag', () => {
    delete process.env.RUN_DB_TESTS;
    process.env.DATABASE_URL = DEV_URL;

    expect(() => assertDevDatabase()).toThrow(
      'RUN_DB_TESTS=1 é obrigatório para testes com banco.',
    );
  });

  it('accepts the dev branch pooler and the direct host', () => {
    process.env.RUN_DB_TESTS = '1';
    process.env.DATABASE_URL = DEV_URL;
    expect(() => assertDevDatabase()).not.toThrow();

    process.env.DATABASE_URL = DIRECT_DEV_URL;
    expect(() => assertDevDatabase()).not.toThrow();
  });

  it('rejects production without revealing credentials', () => {
    process.env.RUN_DB_TESTS = '1';
    process.env.DATABASE_URL = PRODUCTION_URL;

    expect(() => assertDevDatabase()).toThrow(
      /Recusado: DATABASE_URL aponta para produção \(ep-royal-thunder-b6axo5pn/,
    );

    try {
      assertDevDatabase();
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain('secret-password');
      expect(message).not.toContain('postgresql://');
    }
  });

  it('rejects a host that is not the dev branch', () => {
    process.env.RUN_DB_TESTS = '1';
    process.env.DATABASE_URL =
      'postgresql://user:secret-password@ep-other-host.example/neondb';

    expect(() => assertDevDatabase()).toThrow(/não é a branch dev/);
    try {
      assertDevDatabase();
    } catch (error) {
      expect(String(error)).not.toContain('secret-password');
    }
  });
});

function restore(
  name: 'RUN_DB_TESTS' | 'DATABASE_URL',
  value: string | undefined,
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
