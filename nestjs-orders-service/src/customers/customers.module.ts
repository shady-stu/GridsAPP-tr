/**
 * Wires the customers feature: controller + service, and binds the repository *port* to its
 * Prisma adapter. The `provide`/`useClass` pair is the only place that knows which storage
 * engine backs customers, which is what keeps `CustomersService` unit-testable.
 *
 * Both the service and the repository token are exported: `OrdersModule` validates that the
 * customer of a new order exists in the tenant, and it does that through the port (not through
 * `CustomersService`) so no business rules leak across feature boundaries.
 */
import { Module } from '@nestjs/common';
import { CUSTOMER_REPOSITORY } from './repositories/customer.repository.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { PrismaCustomerRepository } from './repositories/prisma-customer.repository.js';

@Module({
  controllers: [CustomersController],
  providers: [
    CustomersService,
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
  ],
  exports: [CustomersService, CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
