/**
 * `setupFiles` entry point: applied in every Vitest worker before the first import of the
 * application code, so anything that reads `process.env` at module scope already sees the test
 * configuration.
 */
import { applyTestEnv } from './test-env.js';

applyTestEnv();
