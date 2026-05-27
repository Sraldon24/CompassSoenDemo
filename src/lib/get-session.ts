import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { cache } from "react";

/**
 * Cached per-request session lookup for Server Components.
 * Returns null if no valid session — let the middleware handle redirects.
 */
export const getSession = cache(async () => {
  const hdrs = await headers();
  return auth.api.getSession({ headers: hdrs });
});
