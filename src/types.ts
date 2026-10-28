export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export type MangaType = 'Manga' | 'Manhwa' | 'Manhua';
export type MangaStatus = 'Ongoing' | 'Completed';
export type StaffRole = 'user' | 'moderator' | 'admin';
export type ModerationStatus = 'active' | 'warned' | 'muted' | 'suspended' | 'banned';

export interface Series {
  id: string;
  visibility: 'public';
  title: string;
  altTitles: string[];
  synopsis: string;
  author: string;
  artist: string;
  coverUrl: string;
  heroBackdropUrl?: string;
  status: MangaStatus;
  type: MangaType;
  releaseYear: number;
  genres: string[];
  views: number;
  ratingSum: number;
  ratingCount: number;
  ratingAvg: number;
  latestChapterNum: number;
  latestChapterTitle: string;
  chapterCount: number;
  isFeatured: boolean;
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  isSeedOnly?: boolean;
}

export interface Chapter {
  id: string;
  seriesId: string;
  visibility: 'public';
  chapterNumber: number;
  title: string;
  pageCount: number;
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  isSeedOnly?: boolean;
}

export interface ChapterPage {
  id: string;
  seriesId: string;
  chapterId: string;
  visibility: 'public';
  pageNumber: number;
  imageUrl: string;
  createdBy: string;
}

export interface CommentItem {
  id: string;
  visibility: 'public';
  seriesId: string;
  seriesTitle: string;
  chapterId: string;
  parentId: string;
  replyToName: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  content: string;
  imageUrl: string;
  isEdited: boolean;
  likesCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserProfile {
  uid: string;
  visibility: 'public';
  displayName: string;
  username: string;
  photoURL: string;
  bannerUrl: string;
  bio: string;
  pronouns: string;
  location: string;
  favoriteGenres: string[];
  readingModePref: 'webtoon' | 'single';
  chapterAlertsEnabled: boolean;
  showReadingStatsPublic: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StaffEntry {
  email: string;
  role: 'admin' | 'moderator';
  addedBy: string;
  addedByEmail: string;
  updatedAtMs: number;
}

export interface UserModerationRecord {
  userId: string;
  visibility: 'public';
  status: ModerationStatus;
  reason: string;
  warningMessage: string;
  isPermanent: boolean;
  expiresAtMs: number;
  updatedBy: string;
  updatedAtMs: number;
}

export interface ContentReportItem {
  id: string;
  scope: 'moderation';
  targetType: 'comment' | 'chapter';
  seriesId: string;
  seriesTitle: string;
  chapterId: string;
  chapterNumber: number;
  commentId: string;
  commentAuthorId: string;
  commentSnippet: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SiteSettings {
  id: 'settings';
  visibility: 'public';
  siteName: string;
  siteTagline: string;
  logoUrl: string;
  announcementBanner: string;
  themePreset: string;
  bgCanvasHex: string;
  bgSurfaceHex: string;
  accentHex: string;
  textPrimaryHex: string;
  uiCopy: Record<string, string>;
  textReplacements: string[]; // Encoded as "original:::replacement"
  updatedBy: string;
  updatedAtMs: number;
}

export interface BookmarkItem {
  userId: string;
  seriesId: string;
  seriesTitle: string;
  coverUrl: string;
  latestChapterNum: number;
  type: MangaType;
  createdAtMs: number;
}

export interface ReadingHistoryItem {
  userId: string;
  seriesId: string;
  seriesTitle: string;
  coverUrl: string;
  lastChapterId: string;
  lastChapterNum: number;
  lastChapterTitle: string;
  lastPageIndex: number;
  readChapterIds: string[];
  updatedAtMs: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  seriesId: string;
  seriesTitle: string;
  chapterId: string;
  chapterNumber: number;
  message: string;
  isRead: boolean;
  senderId: string;
  createdAtMs: number;
}

export interface OfflineChapterRecord {
  chapterId: string;
  seriesId: string;
  seriesTitle: string;
  seriesCoverUrl: string;
  seriesType: MangaType;
  chapterNumber: number;
  chapterTitle: string;
  pages: string[];
  sizeBytes: number;
  downloadedAtMs: number;
}

export type ViewRoute =
  | { name: 'home' }
  | { name: 'directory'; initialGenre?: string; initialSort?: DirectorySort; initialQuery?: string; initialType?: MangaType | 'All' }
  | { name: 'latest' }
  | { name: 'series'; seriesId: string }
  | { name: 'reader'; seriesId: string; chapterId: string }
  | { name: 'library'; tab: 'bookmarks' | 'history' | 'notifications' }
  | { name: 'downloads' }
  | { name: 'profile'; targetUserId?: string }
  | { name: 'admin' };

export type DirectorySort = 'latest' | 'popular' | 'az' | 'rating';

export const ALL_GENRES: string[] = [
  'Action',
  'Adventure',
  'Fantasy',
  'Romance',
  'Isekai',
  'Manhwa',
  'Manhua',
  'Sci-Fi',
  'Slice of Life',
  'Martial Arts',
  'System',
  'Seinen',
  'Shoujo',
  'Mystery',
  'Drama',
];

export const DEFAULT_UI_COPY: Record<string, string> = {
  nav_home: 'Home',
  nav_directory: 'Manga List',
  nav_updates: 'Updates',
  nav_library: 'Library',
  nav_downloads: 'Downloads',
  nav_profile: 'Profile',
  nav_portal: 'Portal',
  search_placeholder: 'Search manga, author...',
  auth_signin: 'Sign In',
  hero_badge: 'Featured Spotlight',
  hero_read_now: 'Read Now',
  hero_details: 'Series Details',
  home_popular_title: 'Popular Series',
  home_popular_subtitle: 'Most read titles across readers',
  home_latest_title: 'Latest Releases',
  home_latest_subtitle: 'Freshly uploaded chapters sorted chronologically',
  home_view_all_updates: 'View All Updates →',
  home_genres_title: 'Browse by Genre',
  home_leaderboard_title: 'Top Rated Leaderboard',
  series_synopsis_title: 'Synopsis',
  series_chapters_title: 'Chapters',
  series_comments_title: 'Cloud Comments',
  reader_report_chapter: 'Report Chapter Issue',
  reader_chapter_discussion: 'Chapter Discussion',
};

export const THEME_PRESETS: Array<{
  id: string;
  name: string;
  bgCanvasHex: string;
  bgSurfaceHex: string;
  accentHex: string;
  textPrimaryHex: string;
}> = [
  {
    id: 'midnight-blue',
    name: 'Midnight Sapphire (Default)',
    bgCanvasHex: '#0B0E14',
    bgSurfaceHex: '#131822',
    accentHex: '#3B82F6',
    textPrimaryHex: '#F1F5F9',
  },
  {
    id: 'crimson-ink',
    name: 'Crimson Blade',
    bgCanvasHex: '#0E0A0C',
    bgSurfaceHex: '#191216',
    accentHex: '#E11D48',
    textPrimaryHex: '#F8FAFC',
  },
  {
    id: 'jade-sect',
    name: 'Mount Hua Jade',
    bgCanvasHex: '#08100E',
    bgSurfaceHex: '#101E1A',
    accentHex: '#10B981',
    textPrimaryHex: '#ECFDF5',
  },
  {
    id: 'imperial-gold',
    name: 'Imperial Gold',
    bgCanvasHex: '#0E0C08',
    bgSurfaceHex: '#1A160F',
    accentHex: '#F59E0B',
    textPrimaryHex: '#FEFCE8',
  },
  {
    id: 'obsidian-slate',
    name: 'Obsidian Violet',
    bgCanvasHex: '#09090D',
    bgSurfaceHex: '#14141D',
    accentHex: '#6366F1',
    textPrimaryHex: '#F1F5F9',
  },
];

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  id: 'settings',
  visibility: 'public',
  siteName: 'MGeko',
  siteTagline: 'Cloud Synced & Offline-Capable Manga Reader PWA',
  logoUrl: '',
  announcementBanner: '',
  themePreset: 'midnight-blue',
  bgCanvasHex: '#0B0E14',
  bgSurfaceHex: '#131822',
  accentHex: '#3B82F6',
  textPrimaryHex: '#F1F5F9',
  uiCopy: { ...DEFAULT_UI_COPY },
  textReplacements: [],
  updatedBy: '',
  updatedAtMs: 0,
};
