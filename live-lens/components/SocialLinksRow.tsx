import { SOCIAL_BRAND_BUTTON, SocialPlatformIcon } from "@/components/SocialIcons";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social";
import type { SocialLink } from "@/lib/types";

type Props = {
  links: SocialLink[];
  className?: string;
  /** Icon size classes */
  iconClassName?: string;
  /** Button size: default guest, compact for footers / live CTA */
  size?: "md" | "sm" | "lg";
  /** Optional caption above the icons */
  label?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-12 w-12",
};

const ICON_SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-[1.15rem] w-[1.15rem]",
  lg: "h-5 w-5",
};

export function SocialLinksRow({
  links,
  className = "",
  iconClassName,
  size = "md",
  label,
}: Props) {
  if (!links.length) return null;

  return (
    <div className={className}>
      {label && <p className="mb-2.5 text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>}
      <ul className="flex flex-wrap items-center gap-3">
        {links.map((link) => (
          <li key={`${link.platform}-${link.url}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center justify-center rounded-full text-white transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8d5b5] ${SIZE[size]} ${SOCIAL_BRAND_BUTTON[link.platform]}`}
              aria-label={SOCIAL_PLATFORM_LABELS[link.platform]}
              title={SOCIAL_PLATFORM_LABELS[link.platform]}
            >
              <SocialPlatformIcon
                platform={link.platform}
                className={iconClassName ?? ICON_SIZE[size]}
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
