import coverHeavenlyDemonImg from '../assets/images/cover_heavenly_demon_blade_1793108846501.jpg';
import coverIsekaiArchitectImg from '../assets/images/cover_isekai_architect_1793108848967.jpg';
import coverOrbitalDrifterImg from '../assets/images/cover_orbital_drifter_1793108851726.jpg';
import coverVelvetCrownImg from '../assets/images/cover_velvet_crown_villainess_1793108850705.jpg';
import heroBackdropImg from '../assets/images/hero_featured_backdrop_1793108852779.jpg';
import { Chapter, Series } from '../types';

export const HERO_BACKDROP_ASSET = heroBackdropImg;

/**
 * Generates a high-contrast illustrated SVG cover data URI for series without external image files.
 */
function buildIllustratedCoverDataUri(
  title: string,
  subtitle: string,
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  motif: 'spire' | 'tower'
): string {
  const art =
    motif === 'spire'
      ? `
      <circle cx="460" cy="210" r="110" fill="${accentHex}" fill-opacity="0.16" />
      <circle cx="460" cy="210" r="78" fill="#E2E8F0" fill-opacity="0.92" />
      <polygon points="300,320 420,800 160,800" fill="#0F172A" stroke="${accentHex}" stroke-width="2" />
      <polygon points="300,320 355,800 245,800" fill="#1E293B" />
      <path d="M270 340 L300 215 L330 340 Z" fill="#020617" stroke="${accentHex}" stroke-width="2.5"/>
      <path d="M180 540 Q310 380 490 290" stroke="${accentHex}" stroke-width="5" fill="none" opacity="0.85" />
      <path d="M195 555 Q320 410 470 315" stroke="#93C5FD" stroke-width="2" fill="none" opacity="0.9" />
      `
      : `
      <rect x="110" y="150" width="380" height="520" rx="14" fill="#0F172A" fill-opacity="0.78" stroke="${accentHex}" stroke-width="2"/>
      <line x1="110" y1="260" x2="490" y2="260" stroke="${accentHex}" stroke-opacity="0.35" stroke-width="1.5"/>
      <line x1="110" y1="420" x2="490" y2="420" stroke="${accentHex}" stroke-opacity="0.35" stroke-width="1.5"/>
      <polygon points="300,210 380,350 220,350" fill="none" stroke="${accentHex}" stroke-width="4"/>
      <circle cx="300" cy="305" r="34" fill="${accentHex}" fill-opacity="0.3" stroke="#F8FAFC" stroke-width="2.5"/>
      <rect x="200" y="465" width="200" height="44" rx="6" fill="${accentHex}" fill-opacity="0.2" stroke="${accentHex}" stroke-width="1.5"/>
      `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${primaryHex}"/>
        <stop offset="55%" stop-color="${secondaryHex}"/>
        <stop offset="100%" stop-color="#05070B"/>
      </linearGradient>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05070B" stop-opacity="0.1"/>
        <stop offset="65%" stop-color="#05070B" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#05070B" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    <rect width="600" height="800" fill="url(#bg)"/>
    ${art}
    <rect width="600" height="800" fill="url(#scrim)"/>
    <text x="44" y="690" fill="#94A3B8" font-family="sans-serif" font-size="18" font-weight="600" letter-spacing="2">${subtitle}</text>
    <text x="44" y="738" fill="#F8FAFC" font-family="sans-serif" font-size="34" font-weight="700">${title}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SHADOW_SOVEREIGN_COVER = buildIllustratedCoverDataUri(
  'Shadow Sovereign',
  'MGEKO ORIGINAL MANHWA',
  '#0B132B',
  '#1C2541',
  '#3B82F6',
  'spire'
);

const SYSTEM_TOWER_COVER = buildIllustratedCoverDataUri(
  'Zero-Floor Ascendant',
  'SYSTEM ACTION MANHUA',
  '#1A1025',
  '#0F172A',
  '#38BDF8',
  'tower'
);

const now = Date.now();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const SEED_SERIES: Series[] = [
  {
    id: 'blade-of-plum-blossom-demon',
    visibility: 'public',
    title: 'Blade of the Plum Blossom Demon',
    altTitles: ['Cheonma Maehwa Geom', 'Return of the Crimson Cliff'],
    synopsis:
      'Betrayed atop Mount Hua at the peak of the Martial Alliance war, sword saint Baek Cheon-Woo awakens eighty years later in the body of a disgraced outer-sect disciple. Armed with the lost Plum Blossom Nine-Sky Scripture and a tempered jade katana, he carves his way back toward the Central Plains.',
    author: 'Han Jin-Seok',
    artist: 'Studio Geom',
    coverUrl: coverHeavenlyDemonImg,
    heroBackdropUrl: HERO_BACKDROP_ASSET,
    status: 'Ongoing',
    type: 'Manhwa',
    releaseYear: 2025,
    genres: ['Martial Arts', 'Action', 'Adventure', 'Manhwa', 'Fantasy'],
    views: 184290,
    ratingSum: 1470,
    ratingCount: 300,
    ratingAvg: 4.9,
    latestChapterNum: 22,
    latestChapterTitle: 'Plum Petals Over Iron Gate',
    chapterCount: 22,
    isFeatured: true,
    createdBy: 'system_seed',
    createdAtMs: now - 30 * DAY,
    updatedAtMs: now - 8 * MIN,
    isSeedOnly: true,
  },
  {
    id: 'citadel-grand-architect',
    visibility: 'public',
    title: 'Grand Architect of the Sky Citadel',
    altTitles: ['Tenkuu Joukaku no Sekkeishi', 'Blueprint of Aether'],
    synopsis:
      'Structural engineer Renji Kurosawa wakes inside a collapsing floating continent where mana arrays obey civil engineering laws. By rewriting ancient runic load-bearing matrices, he rebuilds a forsaken border fortress into an impregnable sky metropolis.',
    author: 'Makoto Takahara',
    artist: 'Aoi Shirogane',
    coverUrl: coverIsekaiArchitectImg,
    heroBackdropUrl: HERO_BACKDROP_ASSET,
    status: 'Ongoing',
    type: 'Manga',
    releaseYear: 2024,
    genres: ['Isekai', 'Fantasy', 'Adventure', 'System'],
    views: 142650,
    ratingSum: 1152,
    ratingCount: 240,
    ratingAvg: 4.8,
    latestChapterNum: 22,
    latestChapterTitle: 'Golden Matrix Calibration',
    chapterCount: 22,
    isFeatured: true,
    createdBy: 'system_seed',
    createdAtMs: now - 45 * DAY,
    updatedAtMs: now - 34 * MIN,
    isSeedOnly: true,
  },
  {
    id: 'velvet-crown-conservatory',
    visibility: 'public',
    title: 'The Winter Duchess of White Roses',
    altTitles: ['La Couronne de Velours', 'Conservatory of the Silver Heir'],
    synopsis:
      'Sentenced to exile in the frozen northern duchy for a treason she never committed, Lady Celestine turns back the imperial hourglass by three winters. Behind the glass walls of her sunlit rose conservatory, she dismantles court conspiracies one contract at a time.',
    author: 'Yoon Seo-A',
    artist: 'Lumen Atelier',
    coverUrl: coverVelvetCrownImg,
    heroBackdropUrl: HERO_BACKDROP_ASSET,
    status: 'Ongoing',
    type: 'Manhwa',
    releaseYear: 2025,
    genres: ['Romance', 'Shoujo', 'Fantasy', 'Drama', 'Manhwa'],
    views: 129410,
    ratingSum: 1034,
    ratingCount: 215,
    ratingAvg: 4.81,
    latestChapterNum: 22,
    latestChapterTitle: 'Invitation Under Glass',
    chapterCount: 22,
    isFeatured: true,
    createdBy: 'system_seed',
    createdAtMs: now - 25 * DAY,
    updatedAtMs: now - 2 * HOUR,
    isSeedOnly: true,
  },
  {
    id: 'orbital-drifter-cassini',
    visibility: 'public',
    title: 'Orbital Drifter: Rings of Cassini',
    altTitles: ['Kidou Hyouryuu Cassini', 'Lagrange Salvage Crew 09'],
    synopsis:
      'Two centuries after Earth went silent, deep-space salvage pilot Kajiwara boards a derelict colony hull caught inside Saturn’s B-ring. Inside its pressurized observation deck lies a navigation log pointing to a living star.',
    author: 'Kenjirou Mori',
    artist: 'Kenjirou Mori',
    coverUrl: coverOrbitalDrifterImg,
    heroBackdropUrl: HERO_BACKDROP_ASSET,
    status: 'Completed',
    type: 'Manga',
    releaseYear: 2023,
    genres: ['Sci-Fi', 'Seinen', 'Mystery', 'Adventure'],
    views: 98320,
    ratingSum: 891,
    ratingCount: 185,
    ratingAvg: 4.82,
    latestChapterNum: 22,
    latestChapterTitle: 'Perigee Burn',
    chapterCount: 22,
    isFeatured: false,
    createdBy: 'system_seed',
    createdAtMs: now - 90 * DAY,
    updatedAtMs: now - 5 * HOUR,
    isSeedOnly: true,
  },
  {
    id: 'shadow-sovereign-obsidian',
    visibility: 'public',
    title: 'Shadow Sovereign of the Obsidian Spire',
    altTitles: ['Heukseok-ui Gunju', 'Monarch of Silent Thunder'],
    synopsis:
      'When Category-S dimensional rifts fracture Seoul’s coastline, vanguard hunter Kang Tae-Hyun is left behind inside an unmapped monolith. Seven days later he emerges wielding the Azure Rune Blade and command over storm shadows.',
    author: 'Park Do-Hyun',
    artist: 'RedLine Works',
    coverUrl: SHADOW_SOVEREIGN_COVER,
    heroBackdropUrl: HERO_BACKDROP_ASSET,
    status: 'Ongoing',
    type: 'Manhwa',
    releaseYear: 2026,
    genres: ['Action', 'System', 'Fantasy', 'Manhwa'],
    views: 215800,
    ratingSum: 1940,
    ratingCount: 395,
    ratingAvg: 4.91,
    latestChapterNum: 22,
    latestChapterTitle: 'Spire Awakening',
    chapterCount: 22,
    isFeatured: true,
    createdBy: 'system_seed',
    createdAtMs: now - 18 * DAY,
    updatedAtMs: now - 19 * MIN,
    isSeedOnly: true,
  },
  {
    id: 'zero-floor-ascendant',
    visibility: 'public',
    title: 'Zero-Floor Ascendant',
    altTitles: ['Ling Ceng Dengshen', 'Sub-Basement Tutorial'],
    synopsis:
      'While ten thousand climbers race up the Celestial Trial Tower, Lin Chen discovers a hidden staircase leading downward beneath Floor 1—unlocking administrative debug privileges over the tower’s guardian constructs.',
    author: 'Gu Ming',
    artist: 'CloudInk Studio',
    coverUrl: SYSTEM_TOWER_COVER,
    heroBackdropUrl: HERO_BACKDROP_ASSET,
    status: 'Ongoing',
    type: 'Manhua',
    releaseYear: 2025,
    genres: ['System', 'Action', 'Manhua', 'Martial Arts'],
    views: 87400,
    ratingSum: 690,
    ratingCount: 150,
    ratingAvg: 4.6,
    latestChapterNum: 22,
    latestChapterTitle: 'Hidden Stairwell',
    chapterCount: 22,
    isFeatured: false,
    createdBy: 'system_seed',
    createdAtMs: now - 20 * DAY,
    updatedAtMs: now - 9 * HOUR,
    isSeedOnly: true,
  },
];

const CHAPTER_SUBTITLES = [
  'Overture of Fate',
  'Crossroads in the Mist',
  'Trial of the Outer Gate',
  'Echoes Beneath Stone',
  'Shattered Inscription',
  'Blood & Silver Vow',
  'The Seventh Meridian',
  'Night Watch on the Ridge',
  'Ashen Verdict',
  'Hidden Chamber',
  'Storm Over the Courtyard',
  'Unsealed Archive',
  'Vanguard Clash',
  'fractured Horizon',
  'Silent Counterstrike',
  'Oath of the Twin Blades',
  'Beyond the Iron Threshold',
  'Abyssal Resonance',
  'Dawn of Reckoning',
  'Twentieth Rite',
  'Crown of Sparks',
];

export const SEED_CHAPTERS: Record<string, Chapter[]> = Object.fromEntries(
  SEED_SERIES.map((series) => {
    const total = series.chapterCount || 22;
    const chapters: Chapter[] = Array.from({ length: total }, (_, idx) => {
      const chNum = idx + 1;
      const chTime =
        chNum === total
          ? series.updatedAtMs
          : series.createdAtMs + Math.round(((series.updatedAtMs - series.createdAtMs) * chNum) / total);
      return {
        id: `${series.id}-ch-${chNum}`,
        seriesId: series.id,
        visibility: 'public',
        chapterNumber: chNum,
        title:
          chNum === total
            ? series.latestChapterTitle
            : CHAPTER_SUBTITLES[idx % CHAPTER_SUBTITLES.length],
        pageCount: 6,
        createdBy: 'system_seed',
        createdAtMs: chTime,
        updatedAtMs: chTime,
        isSeedOnly: true,
      };
    });
    return [series.id, chapters];
  })
);

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates crisp sequential illustrated comic/webtoon pages (800x1240 vertical format)
 * so every starter chapter has 6 genuinely readable multi-panel pages that work seamlessly
 * in both Webtoon Scroll Mode, Single Page Mode, and Offline IndexedDB Downloads.
 */
export function buildSeedChapterPages(
  seriesTitle: string,
  chapterNumber: number,
  chapterTitle: string,
  pageCount = 6
): string[] {
  const palettes = [
    { top: '#0B132B', mid: '#1E293B', accent: '#3B82F6', glow: '#93C5FD' },
    { top: '#1A1423', mid: '#2D1E2F', accent: '#F59E0B', glow: '#FDE68A' },
    { top: '#0F172A', mid: '#112233', accent: '#38BDF8', glow: '#BAE6FD' },
  ];
  const pal = palettes[(chapterNumber - 1) % palettes.length];

  const beats = [
    {
      narration: `CHAPTER ${chapterNumber} · ${chapterTitle.toUpperCase()}`,
      dialogueA: 'The seals along the outer perimeter just shifted—someone triggered the ancient array.',
      dialogueB: 'Stay sharp. Once we cross the threshold, there is no turning back.',
      sfx: 'KRAA-KOOM',
    },
    {
      narration: 'BENEATH THE SHATTERED ARCHWAY',
      dialogueA: 'For eighty winters this hall stood silent. Why are the runes resonating now?',
      dialogueB: 'Because they recognize the technique you carry in your blade.',
      sfx: 'SHING—!',
    },
    {
      narration: 'CONVERGENCE POINT',
      dialogueA: 'Look at the pressure readings! Every pillar in the sector is aligning!',
      dialogueB: 'Hold your ground—I will redirect the surge through the central core!',
      sfx: 'VWOOM',
    },
    {
      narration: 'CLASH IN THE TWILIGHT',
      dialogueA: 'Impossible... nobody from the outer sect should be able to read that trajectory!',
      dialogueB: 'You measured my rank, not my resolve.',
      sfx: 'SLASH!!',
    },
    {
      narration: 'AFTERMATH OF THE STRIKE',
      dialogueA: 'The barrier is clearing. You can see the upper citadel from here.',
      dialogueB: 'This is only the first gate. The real trial waits above the clouds.',
      sfx: 'WHOOSH',
    },
    {
      narration: `TO BE CONTINUED IN CHAPTER ${chapterNumber + 1}`,
      dialogueA: 'Record these coordinates before the mist closes in again.',
      dialogueB: 'Next stop: the inner sanctum.',
      sfx: 'THOOM',
    },
  ];

  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const beat = beats[i % beats.length];
    const pageNum = i + 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1240">
      <defs>
        <linearGradient id="pbg${pageNum}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#070A10"/>
          <stop offset="50%" stop-color="#0D131F"/>
          <stop offset="100%" stop-color="#070A10"/>
        </linearGradient>
        <linearGradient id="panA${pageNum}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${pal.top}"/>
          <stop offset="100%" stop-color="${pal.mid}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="1240" fill="url(#pbg${pageNum})"/>

      <!-- Panel 1: Wide Establishing Shot -->
      <g transform="translate(48, 44)">
        <rect width="704" height="340" rx="6" fill="url(#panA${pageNum})" stroke="#334155" stroke-width="3"/>
        <circle cx="540" cy="120" r="72" fill="${pal.accent}" fill-opacity="0.22"/>
        <circle cx="540" cy="120" r="42" fill="${pal.glow}" fill-opacity="0.85"/>
        <polygon points="80,340 240,140 390,340" fill="#090D16" opacity="0.9"/>
        <polygon points="290,340 460,110 660,340" fill="#0B1120" stroke="${pal.accent}" stroke-opacity="0.4" stroke-width="2"/>
        <line x1="0" y1="250" x2="704" y2="190" stroke="${pal.accent}" stroke-width="2" stroke-opacity="0.45"/>
        <!-- Caption Box -->
        <rect x="24" y="22" width="440" height="44" rx="4" fill="#05080F" fill-opacity="0.88" stroke="${pal.accent}" stroke-width="1.5"/>
        <text x="42" y="50" fill="#E2E8F0" font-family="sans-serif" font-size="15" font-weight="700" letter-spacing="1.5">${escapeXml(beat.narration)}</text>
      </g>

      <!-- Panel 2: Diagonal Action Split -->
      <g transform="translate(48, 412)">
        <rect width="704" height="380" rx="6" fill="#0E1726" stroke="#334155" stroke-width="3"/>
        <!-- Speed lines -->
        <line x1="40" y1="340" x2="660" y2="50" stroke="${pal.accent}" stroke-width="4" stroke-opacity="0.65"/>
        <line x1="90" y1="360" x2="690" y2="95" stroke="${pal.glow}" stroke-width="2" stroke-opacity="0.8"/>
        <line x1="10" y1="260" x2="540" y2="25" stroke="${pal.accent}" stroke-width="1.5" stroke-opacity="0.4"/>
        <!-- Silhouette character focus -->
        <circle cx="352" cy="195" r="88" fill="${pal.accent}" fill-opacity="0.14" stroke="${pal.accent}" stroke-width="2"/>
        <polygon points="310,360 352,140 405,360" fill="#05080F" stroke="#94A3B8" stroke-width="2"/>
        <!-- SFX Typography -->
        <text x="460" y="315" fill="${pal.glow}" font-family="sans-serif" font-size="40" font-weight="900" font-style="italic" letter-spacing="3">${escapeXml(beat.sfx)}</text>
        <!-- Speech Bubble 1 -->
        <rect x="28" y="28" width="380" height="92" rx="18" fill="#F8FAFC" stroke="#0F172A" stroke-width="3"/>
        <text x="50" y="64" fill="#0F172A" font-family="sans-serif" font-size="16" font-weight="600">${escapeXml(beat.dialogueA.slice(0, 44))}</text>
        <text x="50" y="90" fill="#0F172A" font-family="sans-serif" font-size="16" font-weight="600">${escapeXml(beat.dialogueA.slice(44))}</text>
      </g>

      <!-- Panel 3: Close-up Dramatic Finale -->
      <g transform="translate(48, 820)">
        <rect width="704" height="340" rx="6" fill="url(#panA${pageNum})" stroke="#334155" stroke-width="3"/>
        <path d="M 0 280 Q 352 160 704 290 L 704 340 L 0 340 Z" fill="#060911"/>
        <circle cx="170" cy="175" r="56" fill="#05080F" stroke="${pal.glow}" stroke-width="2.5"/>
        <line x1="145" y1="168" x2="195" y2="162" stroke="${pal.accent}" stroke-width="4"/>
        <!-- Speech Bubble 2 -->
        <rect x="260" y="105" width="412" height="104" rx="20" fill="#F8FAFC" stroke="#0F172A" stroke-width="3"/>
        <text x="284" y="146" fill="#0F172A" font-family="sans-serif" font-size="16" font-weight="700">${escapeXml(beat.dialogueB.slice(0, 44))}</text>
        <text x="284" y="174" fill="#0F172A" font-family="sans-serif" font-size="16" font-weight="700">${escapeXml(beat.dialogueB.slice(44))}</text>
      </g>

      <!-- Subtle Page Footer -->
      <text x="48" y="1202" fill="#64748B" font-family="monospace" font-size="14">${escapeXml(seriesTitle)} · Ch. ${chapterNumber}</text>
      <text x="752" y="1202" text-anchor="end" fill="#94A3B8" font-family="monospace" font-size="14">PAGE ${String(pageNum).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}</text>
    </svg>`;

    pages.push(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  }
  return pages;
}
