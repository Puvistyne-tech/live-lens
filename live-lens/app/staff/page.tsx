import { getSettingsAction } from "@/app/actions";
import { isStaff } from "@/lib/auth";
import { StaffClient } from "@/components/StaffClient";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const [settings, authed] = await Promise.all([getSettingsAction(), isStaff()]);
  if (!settings) {
    return <main className="p-8 text-white">Settings not configured.</main>;
  }
  return <StaffClient settings={settings} initiallyAuthed={authed} />;
}
