import {
  getAllMediaAction,
  getSettingsAction,
  listUploadCodesAction,
} from "@/app/actions";
import { isAdmin } from "@/lib/auth";
import { AdminClient } from "@/components/AdminClient";
import type { UploadCode } from "@/lib/types";

export default async function AdminPage() {
  const authed = await isAdmin();
  const settings = await getSettingsAction();
  if (!settings) {
    return <main className="p-8 text-white">Settings missing.</main>;
  }

  let media: Awaited<ReturnType<typeof getAllMediaAction>> = [];
  let codes: UploadCode[] = [];
  if (authed) {
    [media, codes] = await Promise.all([
      getAllMediaAction(),
      listUploadCodesAction() as Promise<UploadCode[]>,
    ]);
  }

  return (
    <AdminClient
      initiallyAuthed={authed}
      settings={settings}
      media={media}
      codes={codes}
    />
  );
}
