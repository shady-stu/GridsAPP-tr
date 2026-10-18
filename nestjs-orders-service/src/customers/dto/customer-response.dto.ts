/**
 * Public projection of a customer. This class *is* the serialisation boundary: the domain
 * record never reaches a client, so adding an internal field to the entity cannot leak.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { CustomerRecord } from '../entities/customer.entity.js';

export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'Tenant that owns this record.' })
  tenantId!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ example: '+44 20 7946 0958', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'Prefers e-mail contact.', nullable: true })
  notes!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(record: CustomerRecord): CustomerResponseDto {
    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      email: record.email,
      phone: record.phone,
      notes: record.notes,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
