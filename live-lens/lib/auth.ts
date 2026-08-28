import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_ADMIN = "ll_admin";
const COOKIE_STAFF = "ll_staff";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return createHmac("sha256", secret).update(value).digest("hex");
}

function tokenFor(role: "admin" | "staff") {
  const sig = sign(role);
  return `${role}.${sig}`;
}

function validToken(token: string | undefined, role: "admin" | "staff") {
  if (!token) return false;
  const expected = tokenFor(role);
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function setRoleCookie(role: "admin" | "staff") {
  const jar = await cookies();
  jar.set(role === "admin" ? COOKIE_ADMIN : COOKIE_STAFF, tokenFor(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearRoleCookies() {
  const jar = await cookies();
  jar.delete(COOKIE_ADMIN);
  jar.delete(COOKIE_STAFF);
}

export async function isAdmin() {
  const jar = await cookies();
  return validToken(jar.get(COOKIE_ADMIN)?.value, "admin");
}

export async function isStaff() {
  const jar = await cookies();
  return validToken(jar.get(COOKIE_STAFF)?.value, "staff") || (await isAdmin());
}

export function checkPassword(role: "admin" | "staff", password: string) {
  const expected =
    role === "admin" ? process.env.ADMIN_PASSWORD : process.env.STAFF_PASSWORD;
  if (!expected) return false;
  try {
    return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return password === expected;
  }
}
