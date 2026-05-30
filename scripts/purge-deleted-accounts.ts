/**
 * purge-deleted-accounts.ts
 *
 * Hard-deletes accounts that have been soft-deleted longer than the 30-day
 * grace window. ON DELETE CASCADE wipes all child rows. Idempotent.
 *
 * Run on a daily cron in production:  npm run purge:accounts
 */

import { purgeExpiredAccountsDetailed } from "../src/lib/account/gdpr";

async function main() {
  const { purged, deletedIds } = await purgeExpiredAccountsDetailed(new Date());
  console.log(`[purge-accounts] Hard-deleted ${purged} expired account(s).`, deletedIds);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[purge-accounts] Fatal:", err);
    process.exit(1);
  });
