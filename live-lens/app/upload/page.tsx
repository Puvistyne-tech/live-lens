import Link from "next/link";
import { getSettingsAction } from "@/app/actions";
import { MediaUploader } from "@/components/MediaUploader";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const settings = await getSettingsAction();

  return (
    <main className="min-h-[100dvh] bg-[#0d0f14] text-[#f2f0ea]">
      <div className="mx-auto max-w-lg px-5 py-8 sm:px-8">
        <SiteHeader brandClassName="text-sm uppercase tracking-[0.22em] text-[#c4a574]" />

        <h1 className="mt-10 font-[family-name:var(--font-display)] text-4xl tracking-tight">
          Share a moment
        </h1>
        <p className="mt-2 text-white/60">
          Add a photo from your camera roll, or open the wish camera for a short message to the
          couple.
        </p>

        <div className="mt-6">
          <a
            href="/wish"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-full border border-[#c4a574]/60 bg-[#c4a574]/15 px-6 py-3.5 text-[#e8d5b5] transition hover:bg-[#c4a574]/25"
          >
            Open wish camera
          </a>
        </div>

        <div className="mt-10 border-t border-white/10 pt-8">
          <h2 className="text-lg text-white/85">From your gallery</h2>
          <p className="mt-1 text-sm text-white/50">Photos and short videos from your library.</p>
          <div className="mt-6">
            {!settings?.guest_upload_enabled ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60">
                Guest upload is currently off. You can still{" "}
                <Link href="/gallery" className="text-[#e8d5b5] underline-offset-2 hover:underline">
                  browse the gallery
                </Link>
                .
              </div>
            ) : (
              <MediaUploader settings={settings} role="guest" fileOnly />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
