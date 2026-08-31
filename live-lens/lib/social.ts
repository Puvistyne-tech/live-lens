import type { SocialLink, SocialPlatform } from "@/lib/types";

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "website",
  "whatsapp",
] as const;

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  website: "Website",
  whatsapp: "WhatsApp",
};

const MAX_SOCIAL_LINKS = 8;

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normalize jsonb / unknown input into a clean SocialLink[]. */
export function normalizeSocialLinks(raw: unknown, opts?: { draft?: boolean }): SocialLink[] {
  if (!Array.isArray(raw)) return [];
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const platform = (entry as { platform?: unknown }).platform;
    const urlRaw = (entry as { url?: unknown }).url;
    if (!isSocialPlatform(platform) || typeof urlRaw !== "string") continue;
    const url = urlRaw.trim();
    if (!url) continue;
    if (!opts?.draft && !isHttpUrl(url)) continue;
    const key = `${platform}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform, url });
    if (out.length >= MAX_SOCIAL_LINKS) break;
  }
  return out;
}

export function canAddSocialLink(links: SocialLink[]): boolean {
  return links.length < MAX_SOCIAL_LINKS;
}

export function defaultSocialPlatform(links: SocialLink[]): SocialPlatform {
  const used = new Set(links.map((l) => l.platform));
  return SOCIAL_PLATFORMS.find((p) => !used.has(p)) ?? "instagram";
}
