import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

const OCCURRED_AT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/;

function isValidOccurredAt(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const match = OCCURRED_AT_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? '';
  const millis = Number(fraction.padEnd(3, '0'));
  const zone = match[8];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }

  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const offsetHour = Number(match[9]);
    const offsetMinute = Number(match[10]);
    if (offsetHour > 23 || offsetMinute > 59) {
      return false;
    }

    const sign = zone.startsWith('-') ? -1 : 1;
    offsetMinutes = sign * (offsetHour * 60 + offsetMinute);
  }

  const utcMillis =
    Date.UTC(year, month - 1, day, hour, minute, second, millis) -
    offsetMinutes * 60_000;
  const local = new Date(utcMillis + offsetMinutes * 60_000);

  return (
    local.getUTCFullYear() === year &&
    local.getUTCMonth() === month - 1 &&
    local.getUTCDate() === day &&
    local.getUTCHours() === hour &&
    local.getUTCMinutes() === minute &&
    local.getUTCSeconds() === second &&
    local.getUTCMilliseconds() === millis
  );
}

function IsValidOccurredAt(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidOccurredAt',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: isValidOccurredAt,
      },
    });
  };
}

const ISO_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

function isIso4217Currency(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    return false;
  }

  return ISO_CURRENCIES.has(value);
}

function IsIso4217Currency(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isIso4217Currency',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: isIso4217Currency,
      },
    });
  };
}

export class CreateSaleDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/)
  platform!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  saleId!: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  amountCents!: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsIso4217Currency()
  currency!: string;

  @IsString()
  @IsValidOccurredAt()
  occurredAt!: string;
}
