import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const UNAUTHORIZED_MESSAGE = 'Webhook não autorizado';

@Injectable()
export class WebhookSecretGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-webhook-secret'];
    const expected = process.env.WEBHOOK_SECRET;

    if (!expected) {
      this.logger.error('WEBHOOK_SECRET ausente');
    }

    if (
      typeof expected !== 'string' ||
      expected.length === 0 ||
      typeof provided !== 'string' ||
      provided.length === 0 ||
      !secretsMatch(provided, expected)
    ) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    return true;
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}
