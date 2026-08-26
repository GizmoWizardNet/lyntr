import type { RequestHandler } from '@sveltejs/kit';
import { getLynt } from '$lib/server/lynt';
import sharp from 'sharp';

// ── Design tokens (light palette from DESIGN.md) ─────────────────────────
const C = {
  bg:          '#f0ebe0',       // warm surface
  grid:        '#c8b89a22',     // grid lines
  card:        '#f8f4ed',       // card surface
  cardBorder:  '#c8b89a55',
  primary:     '#3d1f00',       // deep brown
  primaryTop:  '#6b3a10',
  primaryDim:  '#2a1500',
  accent:      '#8B4513',
  mutedFg:     '#8c7b6b',
  fg:          '#1c1008',
  iqGold:      '#c8860a',
  iqGoldBg:    '#fef3d0',
  iqGoldBorder:'#e8a820',
  white:       '#ffffff',
  shadow:      'rgba(60,30,0,0.18)',
};

const W = 1200;
const H = 630;

function esc(s: string) {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wrap text into lines of maxChars, max maxLines lines
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (lines.length >= maxLines) break;
    if ((cur + ' ' + w).trim().length <= maxChars) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars - 1) + '…' : w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // ellipsis on last line if truncated
  if (lines.length === maxLines && text.split(/\s+/).length > words.indexOf(lines[maxLines-1].split(' ').at(-1)!) + 1) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\w+$/, '') + '…';
  }
  return lines;
}

function buildSvg(params: {
  username: string;
  handle: string;
  iq: number;
  content: string;
  avatarB64: string | null;
  likeCount: number;
  views: number;
  isReply: boolean;
  parentUsername?: string;
  parentHandle?: string;
  parentContent?: string;
}): string {
  const { username, handle, iq, content, avatarB64, likeCount, views, isReply, parentUsername, parentHandle, parentContent } = params;

  const contentLines = wrapText(content, 62, isReply ? 3 : 5);
  const parentLines  = isReply && parentContent ? wrapText(parentContent, 58, 2) : [];

  const avatarSize  = 72;
  const avatarX     = 64;
  const avatarY     = 64;
  const contentX    = avatarX + avatarSize + 20;
  const contentY    = avatarY + 4;
  const lineH       = 44;
  const cardPad     = 48;
  const cardW       = W - cardPad * 2;

  // IQ badge color
  const iqColor = iq >= 130 ? '#0a6b3d' : iq >= 110 ? C.iqGold : iq < 90 ? '#9c1c1c' : C.accent;
  const iqBg    = iq >= 130 ? '#d0f5e6' : iq >= 110 ? C.iqGoldBg : iq < 90 ? '#fde8e8' : '#fde6cc';

  const avatarImg = avatarB64
    ? `<image href="data:image/webp;base64,${avatarB64}" x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" rx="10" fill="${C.primaryTop}" opacity="0.3"/>
       <text x="${avatarX + avatarSize/2}" y="${avatarY + avatarSize/2 + 12}" text-anchor="middle" font-size="28" fill="${C.primary}" font-family="Georgia,serif">${esc(username.slice(0,1).toUpperCase())}</text>`;

  // Reply quote card
  const quoteCardY = contentY + contentLines.length * lineH + 16;
  const quoteCardH = parentLines.length * 34 + 48;
  const quoteCard  = isReply && parentLines.length ? `
    <rect x="${contentX - 2}" y="${quoteCardY}" width="${cardW - contentX + cardPad - 16}" height="${quoteCardH}" rx="8"
      fill="${C.card}" stroke="${C.cardBorder}" stroke-width="1.5"/>
    <rect x="${contentX - 2}" y="${quoteCardY}" width="3" height="${quoteCardH}" rx="2" fill="${C.primary}"/>
    <text x="${contentX + 14}" y="${quoteCardY + 22}" font-size="13" fill="${C.mutedFg}" font-family="'Work Sans',sans-serif" font-weight="600">
      Replying to @${esc(parentHandle ?? '')}
    </text>
    ${parentLines.map((l, i) => `<text x="${contentX + 14}" y="${quoteCardY + 46 + i * 32}" font-size="20" fill="${C.fg}" font-family="Georgia,serif" opacity="0.75">${esc(l)}</text>`).join('\n')}
  ` : '';

  // Stat bar
  const statY = H - 60;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="avatarClip">
      <rect x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" rx="10"/>
    </clipPath>
    <clipPath id="cardClip">
      <rect x="${cardPad}" y="${cardPad}" width="${cardW}" height="${H - cardPad * 2}" rx="16"/>
    </clipPath>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${C.bg}"/>
      <stop offset="100%" stop-color="#e8dfd0"/>
    </linearGradient>
    <linearGradient id="headerGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${C.primaryTop}"/>
      <stop offset="100%" stop-color="${C.primary}"/>
    </linearGradient>
    <linearGradient id="btnGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${C.primaryTop}"/>
      <stop offset="100%" stop-color="${C.primary}"/>
    </linearGradient>
    <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="${C.shadow}"/>
    </filter>
    <filter id="avatarShadow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="${C.shadow}"/>
    </filter>
  </defs>

  <!-- ── Background ── -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <!-- Grid texture -->
  <defs>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M 28 0 L 0 0 0 28" fill="none" stroke="${C.grid}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>

  <!-- ── Card ── -->
  <rect x="${cardPad}" y="${cardPad}" width="${cardW}" height="${H - cardPad * 2}" rx="16"
    fill="${C.card}" filter="url(#cardShadow)"/>
  <!-- bevel top highlight -->
  <rect x="${cardPad}" y="${cardPad}" width="${cardW}" height="2" rx="1" fill="rgba(255,245,225,0.85)"/>
  <!-- ghost border -->
  <rect x="${cardPad}" y="${cardPad}" width="${cardW}" height="${H - cardPad * 2}" rx="16"
    fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>

  <!-- ── Header ribbon ── -->
  <rect x="${cardPad}" y="${cardPad}" width="${cardW}" height="46" rx="16" fill="url(#headerGrad)"/>
  <rect x="${cardPad}" y="${cardPad + 30}" width="${cardW}" height="16" fill="url(#headerGrad)"/>
  <!-- bevel line on header -->
  <rect x="${cardPad + 1}" y="${cardPad + 1}" width="${cardW - 2}" height="1.5" rx="1" fill="rgba(255,240,210,0.6)"/>
  <!-- LYNTR wordmark -->
  <text x="${cardPad + 22}" y="${cardPad + 30}" font-size="18" font-weight="800"
    font-family="'Work Sans',Georgia,sans-serif" fill="rgba(255,240,210,0.95)"
    letter-spacing="3">LYNTR</text>
  <!-- "Post" label right -->
  <text x="${W - cardPad - 22}" y="${cardPad + 30}" font-size="13" font-weight="600"
    font-family="'Work Sans',sans-serif" fill="rgba(255,240,210,0.6)"
    text-anchor="end" letter-spacing="1">SOCIAL MEDIA FOR THE TOP IQ</text>

  <!-- ── Avatar ── -->
  <g filter="url(#avatarShadow)">
    ${avatarImg}
  </g>
  <!-- Avatar border -->
  <rect x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" rx="10"
    fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>

  <!-- ── Username + handle ── -->
  <text x="${contentX}" y="${contentY + 24}" font-size="26" font-weight="800"
    font-family="'Work Sans',Georgia,sans-serif" fill="${C.fg}">${esc(username)}</text>
  <text x="${contentX}" y="${contentY + 48}" font-size="18" font-weight="400"
    font-family="'Work Sans',sans-serif" fill="${C.mutedFg}">@${esc(handle)}</text>

  <!-- ── IQ badge ── -->
  <rect x="${W - cardPad - 100}" y="${avatarY}" width="88" height="32" rx="6"
    fill="${iqBg}" stroke="${iqColor}44" stroke-width="1.5"/>
  <text x="${W - cardPad - 56}" y="${avatarY + 21}" font-size="15" font-weight="700"
    font-family="'Work Sans',sans-serif" fill="${iqColor}" text-anchor="middle">IQ ${iq}</text>

  <!-- ── Post content ── -->
  ${contentLines.map((line, i) => `
  <text x="${contentX}" y="${contentY + 80 + i * lineH}" font-size="28"
    font-family="Georgia,'Times New Roman',serif" fill="${C.fg}" font-weight="400">${esc(line)}</text>`).join('')}

  <!-- ── Reply quote card ── -->
  ${quoteCard}

  <!-- ── Stat bar ── -->
  <rect x="${cardPad}" y="${statY - 1}" width="${cardW}" height="1" fill="${C.cardBorder}"/>

  <!-- Heart icon -->
  <text x="${cardPad + 22}" y="${statY + 32}" font-size="20" fill="${C.accent}">♥</text>
  <text x="${cardPad + 46}" y="${statY + 32}" font-size="18" font-weight="600"
    font-family="'Work Sans',sans-serif" fill="${C.mutedFg}">${likeCount.toLocaleString()}</text>

  <!-- Views icon -->
  <text x="${cardPad + 120}" y="${statY + 32}" font-size="18">👁</text>
  <text x="${cardPad + 146}" y="${statY + 32}" font-size="18" font-weight="600"
    font-family="'Work Sans',sans-serif" fill="${C.mutedFg}">${views.toLocaleString()}</text>

  <!-- lyntr.com watermark right -->
  <text x="${W - cardPad - 22}" y="${statY + 32}" font-size="16" font-weight="700"
    font-family="'Work Sans',sans-serif" fill="${C.primary}" text-anchor="end"
    opacity="0.5" letter-spacing="0.5">lyntr.com</text>
</svg>`;
}

export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const lynt = await getLynt(id);
  if (!lynt) return new Response('Not found', { status: 404 });

  // Fetch avatar and convert to base64 (best-effort, fail silently)
  let avatarB64: string | null = null;
  try {
    const avatarUrl = `https://lyntr-cdn.gizmowizard.tech/avatars/${lynt.userId}_medium.webp`;
    const avatarRes = await fetch(avatarUrl, { signal: AbortSignal.timeout(3000) });
    if (avatarRes.ok) {
      const buf = await avatarRes.arrayBuffer();
      avatarB64 = Buffer.from(buf).toString('base64');
    }
  } catch { /* silent */ }

  const isReply = !!lynt.parentUserHandle;

  const svg = buildSvg({
    username:       lynt.username     ?? 'Unknown',
    handle:         lynt.handle       ?? 'unknown',
    iq:             lynt.iq           ?? 100,
    content:        lynt.content      ?? '',
    avatarB64,
    likeCount:      Number(lynt.likeCount ?? 0),
    views:          Number(lynt.views     ?? 0),
    isReply,
    parentUsername: lynt.parentUserUsername ?? undefined,
    parentHandle:   lynt.parentUserHandle   ?? undefined,
    parentContent:  lynt.parentContent      ?? undefined,
  });

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(png, {
    headers: {
      'Content-Type':  'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
