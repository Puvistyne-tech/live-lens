import { basename, extname } from "node:path";

/**
 * Parse camera-style filenames into a stem prefix + sequence number.
 * Examples: IMG_4891, DSC01234, _MG_1234, P1234567, IMG_4891_1
 */
export function parseCameraName(filePath) {
  const name = basename(String(filePath || ""));
  const stem = name.slice(0, name.length - (extname(name).length || 0));
  const lower = stem.toLowerCase();

  // Strip trailing burst suffixes like _1, -2, (3)
  const stripped = lower.replace(/([_-]\d{1,2}|\(\d{1,2}\))$/, "");

  // Prefix + digits (IMG_4891, DSC01234, _mg_1234, p1234567)
  const m = stripped.match(/^(.*?)(\d{2,})$/);
  if (m) {
    return {
      stem: stripped,
      prefix: m[1] || "",
      seq: Number(m[2]),
      normalized: stripped.replace(/[\s_-]+/g, "").replace(/\d+/g, "#"),
    };
  }

  return {
    stem: stripped,
    prefix: stripped,
    seq: null,
    normalized: stripped.replace(/[\s_-]+/g, "").replace(/\d+/g, "#"),
  };
}

function sameFamily(a, b, seqGap) {
  if (a.normalized && a.normalized === b.normalized && a.normalized.includes("#")) {
    if (a.seq != null && b.seq != null) {
      return Math.abs(a.seq - b.seq) <= seqGap;
    }
    return a.stem === b.stem;
  }
  if (a.prefix && a.prefix === b.prefix && a.seq != null && b.seq != null) {
    return Math.abs(a.seq - b.seq) <= seqGap;
  }
  // Orphans / unparseable: only group identical stems
  return a.stem === b.stem;
}

/**
 * Split a time-window batch into name families.
 * Only near-equal camera names compete in select_best; unrelated shots stay alone.
 */
export function groupBurstFamilies(filePaths, seqGap = 8) {
  const gap = Math.max(0, Number(seqGap) || 8);
  const items = (filePaths || []).map((path) => ({
    path,
    parsed: parseCameraName(path),
  }));

  const families = [];
  const used = new Set();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const members = [items[i]];
    used.add(i);
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < items.length; j++) {
        if (used.has(j)) continue;
        if (members.some((m) => sameFamily(m.parsed, items[j].parsed, gap))) {
          members.push(items[j]);
          used.add(j);
          grew = true;
        }
      }
    }
    families.push(members.map((m) => m.path));
  }

  return families;
}
