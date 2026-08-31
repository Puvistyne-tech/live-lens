import Link from "next/link";
import { getSettingsAction } from "@/app/actions";
import { GalleryIcon, ShareIcon, WishIcon } from "@/components/GuestNavIcons";
import { PromoLogo } from "@/components/PromoLogo";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteQr } from "@/components/SiteQr";
import { SocialLinksRow } from "@/components/SocialLinksRow";
import { normalizeSocialLinks } from "@/lib/social";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#0d0f14] text-[#f2f0ea]">
      <section className="relative flex min-h-[100dvh] flex-col">
        <div className="absolute inset-0">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(1200px_700px_at_20%_0%,#3a2f28,transparent_55%),radial-gradient(900px_500px_at_100%_20%,#1a2830,transparent_50%),linear-gradient(180deg,#1a1614,#0d0f14)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-[#0d0f14]" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
          <SiteHeader />

          <div className="mt-auto grid flex-1 items-end gap-10 pb-6 pt-16 lg:grid-cols-[1.2fr_auto]">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
                {couple}
              </h1>
              {title && <p className="mt-4 text-lg text-[#e8d5b5]">{title}</p>}
              <div className="mt-5 space-y-1 text-base text-white/75 sm:text-lg">
                {date && <p>{date}</p>}
                {venue && <p>{venue}</p>}
                {address && <p className="text-white/55">{address}</p>}
              </div>
              {welcome && (
                <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70">{welcome}</p>
              )}
              {eventSocial.length > 0 && (
                <SocialLinksRow links={eventSocial} className="mt-6" size="lg" />
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 rounded-full bg-[#c4a574] px-6 py-3 text-[#1a140c] transition hover:brightness-110"
                >
                  <ShareIcon className="h-[1.15rem] w-[1.15rem]" />
                  Share a moment
                </Link>
                <a
                  href="/wish"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-white/90 transition hover:border-white/50"
                >
                  <WishIcon className="h-[1.15rem] w-[1.15rem]" />
                  Send a wish
                </a>
                <Link
                  href="/gallery"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-white/90 transition hover:border-white/50"
                >
                  <GalleryIcon className="h-[1.15rem] w-[1.15rem]" />
                  View gallery
                </Link>
              </div>
            </div>

            <div className="justify-self-start lg:justify-self-end">
              <SiteQr size={168} label="Scan to open this site" />
            </div>
          </div>

          {(promoLogo || promoSocial.length > 0) && (
            <footer className="relative z-10 mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-6">
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
      </section>
    </main>
  );
}
