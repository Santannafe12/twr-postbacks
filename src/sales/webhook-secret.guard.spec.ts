import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebhookSecretGuard } from './webhook-secret.guard.js';

const MESSAGE = 'Webhook não autorizado';

function contextWithHeader(
  value: string | string[] | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: value === undefined ? {} : { 'x-webhook-secret': value },
      }),
    }),
  } as ExecutionContext;
}

describe('WebhookSecretGuard', () => {
  const guard = new WebhookSecretGuard();
  const previous = process.env.WEBHOOK_SECRET;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.WEBHOOK_SECRET;
      return;
    }

    process.env.WEBHOOK_SECRET = previous;
  });

  it('rejects a missing header', () => {
    process.env.WEBHOOK_SECRET = 'segredo';

    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(
      new UnauthorizedException(MESSAGE),
    );
  });

  it('rejects a wrong secret', () => {
    process.env.WEBHOOK_SECRET = 'segredo';

    expect(() => guard.canActivate(contextWithHeader('outro'))).toThrow(
      new UnauthorizedException(MESSAGE),
    );
  });

  it('rejects a secret with a different length', () => {
    process.env.WEBHOOK_SECRET = 'segredo';

    expect(() => guard.canActivate(contextWithHeader('segredo-maior'))).toThrow(
      new UnauthorizedException(MESSAGE),
    );
  });

  it('rejects when WEBHOOK_SECRET is missing', () => {
    delete process.env.WEBHOOK_SECRET;

    expect(() => guard.canActivate(contextWithHeader('segredo'))).toThrow(
      new UnauthorizedException(MESSAGE),
    );
  });

  it('accepts the matching secret', () => {
    process.env.WEBHOOK_SECRET = 'segredo';

    expect(guard.canActivate(contextWithHeader('segredo'))).toBe(true);
  });
});
