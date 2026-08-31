import type { ReactElement } from "react";
import type { SocialPlatform } from "@/lib/types";

type IconProps = { className?: string };

/** Filled glyphs intended for brand-colored circular buttons (white on color). */
function InstagramIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2Zm0 7.9A3.1 3.1 0 1 1 12 8.9a3.1 3.1 0 0 1 0 6.2Z" />
      <circle cx="17.4" cy="6.7" r="1.15" />
      <path d="M16.5 2.5h-9A5 5 0 0 0 2.5 7.5v9a5 5 0 0 0 5 5h9a5 5 0 0 0 5-5v-9a5 5 0 0 0-5-5Zm3.3 14a3.3 3.3 0 0 1-3.3 3.3h-9A3.3 3.3 0 0 1 4.2 16.5v-9A3.3 3.3 0 0 1 7.5 4.2h9a3.3 3.3 0 0 1 3.3 3.3v9Z" />
    </svg>
  );
}

function FacebookIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14.2 8.6h2.3V5.4h-2.3c-2.8 0-4.7 1.7-4.7 4.6v2H7.2v3.2h2.3V21h3.4v-5.8h2.5l.5-3.2h-3V10c0-.8.4-1.4 1.3-1.4Z" />
    </svg>
  );
}

function TikTokIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.1 8.3a6.7 6.7 0 0 1-3.9-1.2v7.1a5.5 5.5 0 1 1-4.7-5.4v2.5a3.1 3.1 0 1 0 2.2 3v-9.8h2.4c.3 1.5 1.4 2.8 2.9 3.4l1.1.4Z" />
    </svg>
  );
}

function YouTubeIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.6 7.8a2.7 2.7 0 0 0-1.9-1.9C18 5.5 12 5.5 12 5.5s-6 0-7.7.4A2.7 2.7 0 0 0 2.4 7.8 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.2 2.7 2.7 0 0 0 1.9 1.9c1.7.4 7.7.4 7.7.4s6 0 7.7-.4a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.2ZM10 15.2V8.8l5.2 3.2L10 15.2Z" />
    </svg>
  );
}

function XIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 3.5h2.7l-5.9 6.7L22 20.5h-5.8l-4.5-5.9-5.2 5.9H3.8l6.3-7.2L2.4 3.5h6l4.1 5.4 5.1-5.4Zm-1 15.2h1.5L7.5 5.1H5.9l10.7 13.6Z" />
    </svg>
  );
}

function WebsiteIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm7.7 8.7h-3.2a14 14 0 0 0-1.2-5 7.7 7.7 0 0 1 4.4 5Zm-5 1.6h3.5a7.7 7.7 0 0 1-4.6 5.4c.6-1.5 1-3.4 1.1-5.4Zm-1.8 0c-.1 2.1-.5 4-.1 5.5A7.7 7.7 0 0 1 12 19.7a7.7 7.7 0 0 1-.8-.1c.7-1.5 1.1-3.4 1.2-5.5h1.5Zm-3.3 0c.1 2 .5 3.9 1.1 5.4a7.7 7.7 0 0 1-4.6-5.4h3.5Zm-3.7 0H4.3a7.7 7.7 0 0 1 4.4-5 14 14 0 0 0-1.2 5Zm5.5-6.6c-.6 1.5-1 3.3-1.1 5H9.2c.1-2 .5-3.8 1.1-5.3.4-.1.8-.2 1.2-.2.4 0 .8.1 1.2.2Zm2.1.1c.6 1.5 1 3.3 1.1 5.2h-3.5c.1-1.9.5-3.7 1.1-5.2.4-.1.9-.2 1.3-.2.4 0 .9.1 1.3.2Z" />
    </svg>
  );
}

function WhatsAppIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2.5A9.45 9.45 0 0 0 2.6 11.9c0 1.67.44 3.3 1.27 4.73L2.5 21.5l5.02-1.32A9.45 9.45 0 0 0 21.5 11.9 9.45 9.45 0 0 0 12.04 2.5Zm0 17.3a7.8 7.8 0 0 1-4-.1l-.28-.1-3 .79.8-2.9-.18-.3a7.8 7.8 0 1 1 6.66 2.61Zm4.28-5.84c-.23-.12-1.38-.68-1.6-.76-.21-.08-.37-.12-.52.12-.16.23-.6.76-.74.91-.13.16-.27.18-.5.06-.23-.12-.98-.36-1.86-1.15-.69-.61-1.15-1.37-1.29-1.6-.13-.23-.01-.36.1-.48.1-.1.23-.27.34-.4.12-.14.16-.23.23-.39.08-.15.04-.29-.02-.41-.06-.12-.52-1.26-.72-1.72-.19-.45-.38-.39-.52-.4h-.45c-.15 0-.4.06-.61.29-.21.23-.8.78-.8 1.9 0 1.12.82 2.2.93 2.35.12.16 1.62 2.47 3.92 3.46.55.24.98.38 1.31.48.55.18 1.05.15 1.45.09.44-.07 1.38-.56 1.57-1.11.19-.54.19-1.01.13-1.11-.06-.1-.21-.16-.44-.27Z" />
    </svg>
  );
}

const ICONS: Record<SocialPlatform, (props: IconProps) => ReactElement> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  x: XIcon,
  website: WebsiteIcon,
  whatsapp: WhatsAppIcon,
};

/** Brand button backgrounds for guest-facing social chips. */
export const SOCIAL_BRAND_BUTTON: Record<SocialPlatform, string> = {
  instagram:
    "bg-[linear-gradient(135deg,#f9ce34_0%,#ee2a7b_45%,#6228d7_100%)] shadow-[0_6px_18px_rgba(238,42,123,0.35)] hover:brightness-110 hover:shadow-[0_8px_22px_rgba(238,42,123,0.45)]",
  facebook:
    "bg-[#1877F2] shadow-[0_6px_18px_rgba(24,119,242,0.35)] hover:brightness-110 hover:shadow-[0_8px_22px_rgba(24,119,242,0.45)]",
  tiktok:
    "bg-[#111111] shadow-[0_6px_18px_rgba(0,0,0,0.4)] ring-1 ring-[#25F4EE]/50 hover:brightness-125 hover:shadow-[0_8px_22px_rgba(254,44,85,0.35)]",
  youtube:
    "bg-[#FF0000] shadow-[0_6px_18px_rgba(255,0,0,0.35)] hover:brightness-110 hover:shadow-[0_8px_22px_rgba(255,0,0,0.45)]",
  x: "bg-[#0f0f0f] shadow-[0_6px_18px_rgba(0,0,0,0.4)] ring-1 ring-white/15 hover:brightness-125",
  website:
    "bg-[#c4a574] shadow-[0_6px_18px_rgba(196,165,116,0.35)] hover:brightness-110 hover:shadow-[0_8px_22px_rgba(196,165,116,0.45)]",
  whatsapp:
    "bg-[#25D366] shadow-[0_6px_18px_rgba(37,211,102,0.35)] hover:brightness-110 hover:shadow-[0_8px_22px_rgba(37,211,102,0.45)]",
};

export function SocialPlatformIcon({
  platform,
  className,
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  const Icon = ICONS[platform];
  return <Icon className={className} />;
}
