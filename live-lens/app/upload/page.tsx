import Link from "next/link";
import { getSettingsAction } from "@/app/actions";
import { WishIcon } from "@/components/GuestNavIcons";
import { MediaUploader } from "@/components/MediaUploader";
import { PromoLogo } from "@/components/PromoLogo";
import { SiteHeader } from "@/components/SiteHeader";
import { SocialLinksRow } from "@/components/SocialLinksRow";
import { normalizeSocialLinks } from "@/lib/social";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const settings = await getSettingsAction();
  const couple = settings?.couple_names?.trim() || "LiveLens";
  const title = settings?.event_title?.trim();
  const date = settings?.event_date?.trim();
  const venue = settings?.venue_name?.trim();
  const address = settings?.venue_address?.trim();
  const welcome = settings?.welcome_message?.trim();
  const hero = settings?.hero_image_url?.trim();
  const promoLogo = settings?.promo_logo_url?.trim();
  const eventSocial = normalizeSocialLinks(settings?.event_social_links);
  const promoSocial = normalizeSocialLinks(settings?.promo_social_links);
  const promoHref = promoSocial[0]?.url ?? null;
  const guestOpen = settings?.guest_upload_enabled ?? false;

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#0d0f14] text-[#f2f0ea]">
      <section className="relative flex min-h-[48dvh] flex-col sm:min-h-[52dvh]">
        <div className="absolute inset-0">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(1200px_700px_at_20%_0%,#3a2f28,transparent_55%),radial-gradient(900px_500px_at_100%_20%,#1a2830,transparent_50%),linear-gradient(180deg,#1a1614,#0d0f14)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-[#0d0f14]" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-8 pt-8 sm:px-8">
          <SiteHeader brandClassName="text-sm uppercase tracking-[0.22em] text-[#c4a574]" />

          <div className="mt-auto pt-12">
            <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[0.95] tracking-tight sm:text-5xl">
              {couple}
            </h1>
            {title && <p className="mt-3 text-base text-[#e8d5b5] sm:text-lg">{title}</p>}
            <div className="mt-4 space-y-1 text-sm text-white/75 sm:text-base">
              {date && <p>{date}</p>}
              {venue && <p>{venue}</p>}
              {address && <p className="text-white/55">{address}</p>}
            </div>
            {welcome && (
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                {welcome}
              </p>
            )}
            {eventSocial.length > 0 && (
              <SocialLinksRow links={eventSocial} className="mt-5" />
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-lg px-5 pb-10 pt-2 sm:px-8">
        <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Share a moment
        </h2>

        {!guestOpen ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
            <p>Guest sharing is turned off right now.</p>
            <p className="mt-3 text-sm text-white/50">
              You can still{" "}
              <Link href="/gallery" className="text-[#e8d5b5] underline-offset-2 hover:underline">
                browse the gallery
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-white/60">
              Add a photo from your camera roll, or open the wish camera for a short message to the
              couple.
            </p>

            <div className="mt-6">
              <a
                href="/wish"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#c4a574]/60 bg-[#c4a574]/15 px-6 py-3.5 text-[#e8d5b5] transition hover:bg-[#c4a574]/25"
              >
                <WishIcon className="h-[1.15rem] w-[1.15rem]" />
                Open wish camera
              </a>
            </div>

            <div className="mt-10 border-t border-white/10 pt-8">
              <h3 className="text-lg text-white/85">From your gallery</h3>
              <p className="mt-1 text-sm text-white/50">Photos and short videos from your library.</p>
              <div className="mt-6">
                {settings ? (
                  <MediaUploader settings={settings} role="guest" fileOnly />
                ) : null}
              </div>
            </div>
          </>
        )}

        {(promoLogo || promoSocial.length > 0) && (
          <footer className="mt-12 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-6">
            <PromoLogo url={promoLogo} href={promoHref} />
            {promoSocial.length > 0 && (
              <SocialLinksRow
                links={promoSocial}
                label="Follow the studio"
                className="ml-auto"
                size="sm"
              />
            )}
          </footer>
        )}
      </div>
    </main>
  );
}
