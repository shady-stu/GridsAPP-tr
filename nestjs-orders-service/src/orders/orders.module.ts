/**
 * Wires the orders feature.
 *
 * `CustomersModule` is imported because `OrdersService` must verify that the referenced
 * customer exists *and is active inside the caller's tenant* — that check goes through the
 * customer repository port, which `CustomersModule` exports.
 */
import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { ORDER_REPOSITORY } from './repositories/order.repository.js';
import { PrismaOrderRepository } from './repositories/prisma-order.repository.js';

@Module({
  imports: [CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersService, { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }],
  exports: [OrdersService, ORDER_REPOSITORY],
})
export class OrdersModule {}
