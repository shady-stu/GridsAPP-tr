/**
 * Public projection of an order, optionally including its status history.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../../generated/prisma/enums.js';
import type {
  OrderRecord,
  OrderStatusHistoryRecord,
  OrderWithHistory,
} from '../entities/order.entity.js';

const ORDER_STATUS_VALUES = Object.values(OrderStatus) as string[];

export class OrderStatusHistoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: [...ORDER_STATUS_VALUES, null], nullable: true })
  fromStatus!: string | null;

  @ApiProperty({ enum: ORDER_STATUS_VALUES })
  toStatus!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'User who caused the change.' })
  changedByUserId!: string | null;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({ format: 'date-time' })
  changedAt!: string;

  static from(record: OrderStatusHistoryRecord): OrderStatusHistoryDto {
    return {
      id: record.id,
      fromStatus: record.fromStatus,
      toStatus: record.toStatus,
      changedByUserId: record.changedByUserId,
      reason: record.reason,
      changedAt: record.changedAt.toISOString(),
    };
  }
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ format: 'uuid', description: 'Owning user; `USER` callers only see their own.' })
  userId!: string;

  @ApiProperty({ enum: ORDER_STATUS_VALUES, example: 'PENDING' })
  status!: string;

  @ApiProperty({
    example: '199.90',
    description: 'Decimal string with exactly two decimal places.',
  })
  totalAmount!: string;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ nullable: true })
  reference!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: [OrderStatusHistoryDto],
    description: 'Only present on the single-order endpoint.',
  })
  history?: OrderStatusHistoryDto[];

  static from(record: OrderRecord): OrderResponseDto {
    return {
      id: record.id,
      tenantId: record.tenantId,
      customerId: record.customerId,
      userId: record.userId,
      status: record.status,
      totalAmount: record.totalAmount,
      currency: record.currency,
      reference: record.reference,
      notes: record.notes,
      deletedAt: record.deletedAt ? record.deletedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  static fromWithHistory(record: OrderWithHistory): OrderResponseDto {
    return {
      ...OrderResponseDto.from(record),
      history: record.history.map((entry) => OrderStatusHistoryDto.from(entry)),
    };
  }
}
