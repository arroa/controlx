import "server-only";

import { isDevBypassEnabled } from "@/lib/dev-flags";
import { getDevSessionUserId } from "@/lib/dev-session";

export type CurrentUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
};

export function getSuperAdminEmail(): string {
  return (
    process.env.SUPER_ADMIN_EMAIL ?? "la.carrasco@gmail.com"
  ).toLowerCase();
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDevBypassEnabled()) {
    const userId = await getDevSessionUserId();
    if (!userId?.startsWith("dev:")) {
      return null;
    }

    const email = userId.slice(4).toLowerCase();
    return {
      id: userId,
      email,
      isSuperAdmin: email === getSuperAdminEmail(),
    };
  }

  const { currentUser } = await import("@clerk/nextjs/server");
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress.toLowerCase() ?? null;

  if (!clerkUser || !email) {
    return null;
  }

  return {
    id: clerkUser.id,
    email,
    isSuperAdmin: email === getSuperAdminEmail(),
  };
}
