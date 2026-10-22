/**
 * Translation of Prisma failure codes into domain errors.
 *
 * Repository adapters are the only place allowed to know about Prisma, so they call this
 * mapper and re-throw a `DomainError`. `AllExceptionsFilter` keeps a defensive call to it as
 * well: if an adapter ever forgets, an unexpected Prisma error still becomes a stable HTTP
 * response instead of a 500 with a stack trace.
 *
 * Duck typing (name + code) is used on purpose: it keeps this module free of a hard import on
 * the generated client path and makes it trivially unit-testable.
 */
import {
  ConflictError,
  DatabaseUnavailableError,
  ResourceNotFoundError,
  ValidationDomainError,
  type DomainError,
} from './domain-error.js';

interface PrismaLikeError {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  meta?: unknown;
}

function isPrismaLike(error: unknown): error is PrismaLikeError {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as PrismaLikeError).name;
  return typeof name === 'string' && name.startsWith('Prisma');
}

/**
 * Map a Prisma error to a `DomainError`, or return `undefined` when the error is not a
 * recognised Prisma failure.
 */
export function mapPrismaErrorToDomainError(error: unknown, entity = 'Record'): DomainError | undefined {
  if (!isPrismaLike(error)) return undefined;

  const code = typeof error.code === 'string' ? error.code : undefined;
  const rawMessage = typeof error.message === 'string' ? error.message : '';

  switch (code) {
    // Unique constraint violated.
    case 'P2002': {
      const target = extractConstraintTarget(error.meta);
      return new ConflictError(
        target.length > 0
          ? `${entity} already exists (unique constraint on: ${target.join(', ')})`
          : `${entity} already exists`,
        { cause: error },
      );
    }
    // Foreign key constraint violated (e.g. customerId from another tenant).
    case 'P2003':
    case 'P2014': {
      return new ValidationDomainError(
        `${entity} references a related record that does not exist in this tenant`,
        { cause: error },
      );
    }
    // Required record not found by a unique where clause.
    case 'P2025': {
      return new ResourceNotFoundError(entity, { cause: error });
    }
    // Nullable constraint / value too long.
    case 'P2011':
    case 'P2000': {
      return new ValidationDomainError(`${entity} contains an invalid value`, { cause: error });
    }
    // Connection / availability problems.
    case 'P1000':
    case 'P1001':
    case 'P1002':
    case 'P1008':
    case 'P1017': {
      return new DatabaseUnavailableError('The database is currently unavailable', { cause: error });
    }
    default: {
      if (code === undefined && /connection|ECONNREFUSED|ETIMEDOUT/i.test(rawMessage)) {
        return new DatabaseUnavailableError('The database is currently unavailable', {
          cause: error,
        });
      }
      return undefined;
    }
  }
}

function extractConstraintTarget(meta: unknown): string[] {
  if (typeof meta !== 'object' || meta === null) return [];
  const target = (meta as { target?: unknown }).target;
  if (Array.isArray(target)) return target.map((entry) => String(entry));
  if (typeof target === 'string') return [target];
  return [];
}
