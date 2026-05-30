/**
 * GET /api/account/export — download all of the caller's data as JSON
 * (GDPR Article 20 data portability). Auth required.
 */

import { exportUserData } from "@/lib/account/gdpr";
import { authGuard } from "@/lib/api/route-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const data = await exportUserData(guard.session.user.id);
  const json = JSON.stringify(data, null, 2);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="soen-compass-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
