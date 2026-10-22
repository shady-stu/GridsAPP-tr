/**
 * Paginated customer listing envelope.
 */
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';
import type { PaginatedResult } from '../../common/interfaces/pagination.interface.js';
import type { CustomerRecord } from '../entities/customer.entity.js';
import { CustomerResponseDto } from './customer-response.dto.js';

export class CustomerPageDto extends PaginatedResponseDto {
  @ApiProperty({ type: [CustomerResponseDto] })
  items!: CustomerResponseDto[];

  static from(result: PaginatedResult<CustomerRecord>): CustomerPageDto {
    const page = new CustomerPageDto();
    PaginatedResponseDto.copyMeta(page, result);
    page.items = result.items.map((record) => CustomerResponseDto.from(record));
    return page;
  }
}
