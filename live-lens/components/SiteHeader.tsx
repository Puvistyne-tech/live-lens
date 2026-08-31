import Link from "next/link";
import { GalleryIcon, LiveIcon, PersonIcon, ShareIcon } from "@/components/GuestNavIcons";

type Props = {
  /** Extra classes on the outer nav row */
  className?: string;
  /** Show Gallery / Share / Live links */
  links?: boolean;
  /** Accent color for the brand mark */
  brandClassName?: string;
};

export function SiteHeader({
  className = "",
  links = true,
  brandClassName = "tracking-[0.2em] uppercase text-[#e8d5b5]",
}: Props) {
  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-3 text-sm text-white/70 ${className}`}
    >
      <Link href="/" className={brandClassName}>
        LiveLens
      </Link>
      {links && (
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/gallery" className="inline-flex items-center gap-1.5 hover:text-white">
            <GalleryIcon className="h-4 w-4" />
            Gallery
          </Link>
          <Link href="/upload" className="inline-flex items-center gap-1.5 hover:text-white">
            <ShareIcon className="h-4 w-4" />
            Share
          </Link>
          <Link href="/live" className="inline-flex items-center gap-1.5 hover:text-white">
            <LiveIcon className="h-4 w-4" />
            Live
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center hover:text-white"
            aria-label="Admin sign in"
          >
            <PersonIcon className="h-4 w-4" />
          </Link>
        </div>
      )}
    </nav>
  );
}
