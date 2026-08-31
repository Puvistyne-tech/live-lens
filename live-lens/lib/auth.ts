import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { createServerAuthClient } from "@/lib/supabase/server-auth";

const COOKIE_ADMIN = "ll_admin";
const COOKIE_STAFF = "ll_staff";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return createHmac("sha256", secret).update(value).digest("hex");
}

function tokenFor(role: "staff") {
  const sig = sign(role);
  return `${role}.${sig}`;
}

function validStaffToken(token: string | undefined) {
  if (!token) return false;
  const expected = tokenFor("staff");
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isAdminUser(user: {
  app_metadata?: Record<string, unknown> | null;
} | null | undefined) {
  return user?.app_metadata?.role === "admin";
}

export async function setStaffCookie() {
  const jar = await cookies();
  jar.set(COOKIE_STAFF, tokenFor("staff"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

/** @deprecated Prefer setStaffCookie — admin uses Supabase Auth. */
export async function setRoleCookie(role: "admin" | "staff") {
  if (role === "admin") return;
  await setStaffCookie();
}

export async function clearRoleCookies() {
  const jar = await cookies();
  jar.delete(COOKIE_ADMIN);
  jar.delete(COOKIE_STAFF);
}

export async function isAdmin() {
  const supabase = await createServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminUser(user);
}

export async function isStaff() {
  const jar = await cookies();
  if (validStaffToken(jar.get(COOKIE_STAFF)?.value)) return true;
  return isAdmin();
}

export function checkPassword(role: "admin" | "staff", password: string) {
  // Admin password login removed — use Supabase Auth.
  if (role === "admin") return false;
  const expected = process.env.STAFF_PASSWORD;
  if (!expected) return false;
  try {
    return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return password === expected;
  }
}
