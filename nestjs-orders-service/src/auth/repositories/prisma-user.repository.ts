/**
 * Prisma-backed implementation of the identity repository.
 *
 * Only two projections exist: `UserRecord` (safe, no hash) and `UserWithCredentials` (returned
 * by the single login lookup). Keeping the hash behind its own method means a future endpoint
 * cannot accidentally serialise it by reusing a general-purpose `find` method.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { mapPrismaErrorToDomainError } from '../../common/errors/prisma-error.mapper.js';
import type { User, UserRole as PrismaUserRole } from '../../generated/prisma/client.js';
import type {
  UserCredentialsWithTenant,
  UserRecord,
  UserWithCredentials,
} from '../entities/user.entity.js';
import type { CreateUserData, UserRepository } from './user.repository.js';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCredentialsByTenantSlug(
    tenantSlug: string,
    email: string,
  ): Promise<UserCredentialsWithTenant | null> {
    // One query resolves tenant and identity, so a wrong tenant slug behaves exactly like a
    // wrong e-mail (same latency, same "invalid credentials" response).
    const row = await this.prisma.user.findFirst({
      where: { email, tenant: { slug: tenantSlug } },
      include: { tenant: { select: { slug: true, name: true } } },
    });
    if (!row) return null;

    return {
      ...toUserRecord(row),
      passwordHash: row.passwordHash,
      tenantSlug: row.tenant.slug,
      tenantName: row.tenant.name,
    };
  }

  async findById(tenantId: string, id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({ where: { id, tenantId } });
    return row ? toUserRecord(row) : null;
  }

  async findByIdWithCredentials(tenantId: string, id: string): Promise<UserWithCredentials | null> {
    const row = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!row) return null;
    return { ...toUserRecord(row), passwordHash: row.passwordHash };
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    try {
      const row = await this.prisma.user.create({
        data: {
          tenantId: data.tenantId,
          email: data.email,
          displayName: data.displayName,
          passwordHash: data.passwordHash,
          role: (data.role ?? 'USER') as PrismaUserRole,
        },
      });
      return toUserRecord(row);
    } catch (error) {
      throw mapPrismaErrorToDomainError(error, 'User') ?? error;
    }
  }

  countByTenant(tenantId: string): Promise<number> {
    return this.prisma.user.count({ where: { tenantId } });
  }
}

function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    displayName: row.displayName,
    // The generated enum values are the same string literals as the domain union.
    role: row.role as UserRecord['role'],
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
