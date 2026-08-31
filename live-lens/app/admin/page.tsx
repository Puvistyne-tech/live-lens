import {
  getSettingsAction,
  listAdminMediaAction,
  listUploadCodesAction,
} from "@/app/actions";
import { isAdmin } from "@/lib/auth";
import { AdminClient } from "@/components/AdminClient";
import type { UploadCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await isAdmin();
  const settings = await getSettingsAction();
  if (!settings) {
    return <main className="p-8 text-white">Settings missing.</main>;
  }

  let mediaPage: Awaited<ReturnType<typeof listAdminMediaAction>> = {
    items: [],
    nextCursor: null,
    pendingCount: 0,
  };
  let codes: UploadCode[] = [];
  if (authed) {
    const defaultStatus = "pending" as const;
    [mediaPage, codes] = await Promise.all([
      listAdminMediaAction({ status: defaultStatus, limit: 24 }),
      listUploadCodesAction() as Promise<UploadCode[]>,
    ]);
    // If nothing pending, seed with live so the panel isn't empty
    if (mediaPage.pendingCount === 0) {
      mediaPage = await listAdminMediaAction({ status: "live", limit: 24 });
    }
  }

  const initialStatus =
    authed && mediaPage.pendingCount > 0 ? ("pending" as const) : ("live" as const);

  return (
    <AdminClient
      initiallyAuthed={authed}
      settings={settings}
      initialMedia={mediaPage.items}
      initialNextCursor={mediaPage.nextCursor}
      initialPendingCount={mediaPage.pendingCount}
      initialStatus={initialStatus}
      codes={codes}
    />
  );
}
