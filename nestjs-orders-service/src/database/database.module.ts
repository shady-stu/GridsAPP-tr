/**
 * Exposes `PrismaService` application-wide.
 *
 * Marked `@Global()` on purpose: every feature module needs the client, and requiring each of
 * them to import `DatabaseModule` would add noise without adding safety. There is still exactly
 * one instance, and only repositories inject it — services depend on repository *interfaces*.
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
