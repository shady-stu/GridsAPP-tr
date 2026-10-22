/**
 * Public projection of an identity. Deliberately omits `passwordHash` and any internal
 * counters — the DTO is the serialisation boundary, not the domain entity.
 */
import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, type UserRole } from '../../common/interfaces/authenticated-user.interface.js';
import type { UserRecord } from '../entities/user.entity.js';

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'Tenant this identity belongs to.' })
  tenantId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ example: 'Acme Administrator' })
  displayName!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'ADMIN' })
  role!: UserRole;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(record: UserRecord): UserProfileDto {
    return {
      id: record.id,
      tenantId: record.tenantId,
      email: record.email,
      displayName: record.displayName,
      role: record.role,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
