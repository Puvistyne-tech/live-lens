import Link from "next/link";

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
        <div className="flex flex-wrap gap-4">
          <Link href="/gallery" className="hover:text-white">
            Gallery
          </Link>
          <Link href="/upload" className="hover:text-white">
            Share
          </Link>
          <Link href="/live" className="hover:text-white">
            Live
          </Link>
        </div>
      )}
    </nav>
  );
}
