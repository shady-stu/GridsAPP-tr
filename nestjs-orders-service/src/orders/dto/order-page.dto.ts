/**
 * Paginated order listing envelope.
 */
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import type { PaginatedResult } from '../../common/interfaces/pagination.interface.js';
import type { OrderRecord } from '../entities/order.entity.js';
import { OrderResponseDto } from './order-response.dto.js';

export class OrderPageDto extends PaginatedResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items!: OrderResponseDto[];

  static from(result: PaginatedResult<OrderRecord>): OrderPageDto {
    const page = new OrderPageDto();
    PaginatedResponseDto.copyMeta(page, result);
    page.items = result.items.map((record) => OrderResponseDto.from(record));
    return page;
  }
}
