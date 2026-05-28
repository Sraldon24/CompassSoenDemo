/**
 * Vitest setup — runs once before any test file is imported.
 * Loads .env.local so integration tests can connect to Postgres.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
