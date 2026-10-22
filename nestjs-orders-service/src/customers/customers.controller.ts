/**
 * HTTP surface for customers.
 *
 * The controller only maps HTTP to use cases: validate the contract (via DTOs), read the
 * authenticated principal, delegate, and shape the response DTO. Tenant scoping comes from the
 * token, never from the request body or query string.
 *
 * Authorization matrix:
 *  * reads  — any authenticated role
 *  * writes — `ADMIN` only (creating, mutating and deleting customer records is administrative)
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorBodyDto } from '../common/dto/api-error.dto.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { CustomerPageDto } from './dto/customer-page.dto.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers.query.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';

@ApiTags('customers')
@ApiBearerAuth('bearer')
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a customer', description: 'Requires the `ADMIN` role.' })
  @ApiCreatedResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: '`VALIDATION_FAILED`' })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  @ApiForbiddenResponse({ type: ApiErrorBodyDto, description: '`FORBIDDEN` — missing `ADMIN` role.' })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: '`CONFLICT` — a customer with this e-mail already exists in the tenant.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return CustomerResponseDto.from(await this.customers.create(user, body));
  }

  @Get()
  @ApiOperation({
    summary: 'List customers',
    description: 'Newest first, scoped to the caller’s tenant. Supports search and active filter.',
  })
  @ApiOkResponse({ type: CustomerPageDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: '`VALIDATION_FAILED`' })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ListCustomersQueryDto,
  ): Promise<CustomerPageDto> {
    return CustomerPageDto.from(await this.customers.list(tenantId, query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a customer by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: '`NOT_FOUND`' })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<CustomerResponseDto> {
    return CustomerResponseDto.from(await this.customers.getById(tenantId, id));
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Update a customer',
    description:
      'Partial update. Requires `ADMIN`. Set `isActive: false` to deactivate a customer that ' +
      'still has orders (such a customer cannot be deleted).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: '`VALIDATION_FAILED`' })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: '`NOT_FOUND`' })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: '`CONFLICT` — e-mail already used.' })
  @ApiForbiddenResponse({ type: ApiErrorBodyDto, description: '`FORBIDDEN`' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return CustomerResponseDto.from(await this.customers.update(user, id, body));
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a customer',
    description:
      'Requires `ADMIN`. Refused with `409 CONFLICT` when the customer still has orders — ' +
      'deactivate them instead.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Customer deleted.' })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: '`NOT_FOUND`' })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: '`CONFLICT` — customer has orders.' })
  @ApiForbiddenResponse({ type: ApiErrorBodyDto, description: '`FORBIDDEN`' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.customers.remove(user, id);
  }
}
