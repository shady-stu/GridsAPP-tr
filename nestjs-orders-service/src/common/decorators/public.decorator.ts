/**
 * Marks a route as reachable without authentication.
 *
 * Read by `JwtAuthGuard`, which is registered globally: authentication is the default and
 * opting out is explicit, so a new controller cannot accidentally be public.
 */
import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '../constants.js';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(METADATA_KEYS.IS_PUBLIC, true);
