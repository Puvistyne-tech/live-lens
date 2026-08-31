import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { createServerAuthClient } from "@/lib/supabase/server-auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";
  const site = getSiteUrl() || origin;
  const safeNext = next.startsWith("/") ? next : "/admin";

  if (code) {
    const supabase = await createServerAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isAdminUser(user)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${site}/admin?error=unauthorized`);
      }
      return NextResponse.redirect(`${site}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${site}/admin?error=auth`);
}
