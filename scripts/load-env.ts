// Pre-loaded via tsx --import for all script entrypoints.
// Loads .env.local BEFORE any `src/lib/db` (or other process.env consumer) is evaluated.
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
