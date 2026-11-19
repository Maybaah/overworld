const SITE_NAME = 'Overworld';
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function normaliseBasePath(base) {
  let b = base && base.trim() !== '' ? base.trim() : '/';
  if (!b.startsWith('/')) b = `/${b}`;
  return b.endsWith('/') ? b : `${b}/`;
}

export function resolveSite(env = {}) {
  const raw = (env.SITE_URL ?? '').trim();
  let siteUrl = null;
  let sitePath = null;
  if (raw !== '') {
    try {
      const u = new URL(raw);
      siteUrl = `${u.origin}${normaliseBasePath(u.pathname)}`;
      sitePath = normaliseBasePath(u.pathname);
    } catch {
      siteUrl = null;
    }
  }
  const basePath = normaliseBasePath(env.VITE_BASE ?? sitePath ?? '/');
  return { siteUrl, basePath };
}

export function absoluteUrl(site, relative) {
  const rel = relative.replace(/^\/+/, '');
  return site.siteUrl ? `${site.siteUrl}${rel}` : `${site.basePath}${rel}`;
}

let regionNames;
export function countryName(code) {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function head({ title, description, canonical, image, redirect }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ];
  if (redirect) lines.push(redirect);
  return lines.join('\n');
}
