/**
 * HTTP surface for orders.
 *
 * Authorization matrix (enforced by `RolesGuard` + the ownership restriction in `OrdersService`):
 *
 * | Endpoint                     | ADMIN              | USER                    |
 * |------------------------------|--------------------|-------------------------|
 * | GET    /orders               | all in tenant      | own orders only         |
 * | GET    /orders/:id           | any in tenant      | own only (404 otherwise)|
 * | POST   /orders               | yes (any customer) | yes (any customer)      |
 * | PATCH  /orders/:id           | any in tenant      | own only                |
 * | PATCH  /orders/:id/status    | yes                | 403                     |
 * | DELETE /orders/:id           | yes (soft delete)  | 403                     |
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
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto.js';
import { OrderPageDto } from './dto/order-page.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrdersService } from './orders.service.js';

const UUID_PARAM = new ParseUUIDPipe({ version: '4' });

@ApiTags('orders')
@ApiBearerAuth('bearer')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an order',
    description:
      'Creates a `PENDING` order for an active customer of the caller’s tenant. The status ' +
      'history starts with a `null -> PENDING` entry.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({
    type: ApiErrorBodyDto,
    description: '`VALIDATION_FAILED` — see `details[].field`.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: '`NOT_FOUND` — unknown customer.' })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: '`CONFLICT` — the reference is already used by a live order in this tenant.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.orders.create(user, body));
  }

  @Get()
  @ApiOperation({
    summary: 'List orders',
    description:
      'Newest first, scoped to the caller’s tenant. `USER` callers only see orders they own; ' +
      '`ADMIN` callers may pass `includeDeleted=true`.',
  })
  @ApiOkResponse({ type: OrderPageDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: '`VALIDATION_FAILED`' })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrderPageDto> {
    return OrderPageDto.from(await this.orders.list(user, query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch an order by id, including its status history' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({
    type: ApiErrorBodyDto,
    description: '`NOT_FOUND` — unknown, soft-deleted, or not owned by the caller.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorBodyDto, description: '`UNAUTHENTICATED`' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UUID_PARAM) id: string,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.fromWithHistory(await this.orders.getById(user, id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an order’s reference or notes',
    description:
      'Customer and amount are immutable: changing the value of an already-paid order would ' +
      'invalidate the payment record. Cancel and re-create instead.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: '`VALIDATION_FAILED`' })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: '`NOT_FOUND`' })
  @ApiConflictResponse({ type: ApiErrorBodyDto, description: '`CONFLICT` — reference in use.' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() body: UpdateOrderDto,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.orders.update(user, id, body));
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Manually change an order status',
    description:
      'Requires `ADMIN`. Transitions must be legal for the current status, otherwise the ' +
      'response is `409 INVALID_STATUS_TRANSITION`. The usual path to `PAID` is a verified ' +
      'payment webhook.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorBodyDto, description: '`VALIDATION_FAILED`' })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: '`NOT_FOUND`' })
  @ApiForbiddenResponse({ type: ApiErrorBodyDto, description: '`FORBIDDEN` — not an `ADMIN`.' })
  @ApiConflictResponse({
    type: ApiErrorBodyDto,
    description: '`INVALID_STATUS_TRANSITION` or `CONFLICT` (concurrent change).',
  })
  async changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() body: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.orders.changeStatus(user, id, body));
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete an order',
    description:
      'Requires `ADMIN`. Sets `deletedAt`; the row and its status history are retained because ' +
      'payment webhooks may still reference the order.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Order soft-deleted.' })
  @ApiNotFoundResponse({ type: ApiErrorBodyDto, description: '`NOT_FOUND`' })
  @ApiForbiddenResponse({ type: ApiErrorBodyDto, description: '`FORBIDDEN`' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UUID_PARAM) id: string,
  ): Promise<void> {
    await this.orders.remove(user, id);
  }
}
