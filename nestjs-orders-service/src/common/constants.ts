/**
 * Cross-cutting constants: dependency-injection tokens and metadata keys.
 *
 * Living in one place keeps the strings used with `@Inject()` and `Reflector` from being
 * duplicated (and typo-prone) across feature modules.
 */

/** DI tokens for the repository ports (interfaces) declared by feature modules. */
export const REPOSITORY_TOKENS = {
  CUSTOMER: Symbol('CUSTOMER_REPOSITORY'),
  ORDER: Symbol('ORDER_REPOSITORY'),
  USER: Symbol('USER_REPOSITORY'),
  WEBHOOK_EVENT: Symbol('WEBHOOK_EVENT_REPOSITORY'),
} as const;

/** Reflector metadata keys. */
export const METADATA_KEYS = {
  IS_PUBLIC: 'orders:is-public',
  REQUIRED_ROLES: 'orders:required-roles',
} as const;

/** Header used for request correlation. Accepted on input and always echoed back. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Webhook signature header, Stripe-style: `t=<unix-seconds>,v1=<hex-hmac-sha256>`. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

/** Provider identifier stored on persisted webhook events. */
export const PAYMENT_WEBHOOK_PROVIDER = 'payments';
