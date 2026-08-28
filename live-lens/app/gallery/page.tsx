import { Suspense } from "react";
import { getApprovedMediaAction } from "@/app/actions";
import { GalleryClient } from "@/components/GalleryClient";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const media = await getApprovedMediaAction(200);

  return (
    <main className="min-h-[100dvh] bg-[#0d0f14] text-[#f2f0ea]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0d0f14]/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SiteHeader brandClassName="text-sm uppercase tracking-[0.22em] text-[#c4a574]" />
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-tight">
            Gallery
          </h1>
        </div>
      </header>
      <Suspense fallback={<p className="py-20 text-center text-white/45">Loading gallery…</p>}>
        <GalleryClient initialItems={media} />
      </Suspense>
    </main>
  );
}
