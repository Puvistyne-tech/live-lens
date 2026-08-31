type Props = {
  url: string | null | undefined;
  className?: string;
  /** Optional link wrapping the logo (e.g. first promo social URL) */
  href?: string | null;
};

export function PromoLogo({ url, className = "", href }: Props) {
  const src = url?.trim();
  if (!src) return null;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Studio"
      className="max-h-10 max-w-[140px] object-contain opacity-90 sm:max-h-12 sm:max-w-[160px]"
    />
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block transition hover:opacity-100 ${className}`}
        aria-label="Studio"
      >
        {img}
      </a>
    );
  }

  return <div className={className}>{img}</div>;
}
