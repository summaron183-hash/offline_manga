import { User, updateProfile } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import JSZip from 'jszip';
import { buildSeedChapterPages, SEED_CHAPTERS, SEED_SERIES } from '../data/seedCatalog';
import { BOOTSTRAP_ADMIN_EMAIL, db, handleFirestoreError } from '../firebase';
import {
  BookmarkItem,
  Chapter,
  ChapterPage,
  CommentItem,
  ContentReportItem,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_UI_COPY,
  MangaStatus,
  MangaType,
  ModerationStatus,
  NotificationItem,
  OperationType,
  ReadingHistoryItem,
  Series,
  SiteSettings,
  StaffEntry,
  StaffRole,
  UserModerationRecord,
  UserProfile,
} from '../types';

function tsToMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

export function sanitizeId(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return cleaned || `id-${Date.now()}`;
}

export function normalizeGmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

export function isValidGmailFormat(email: string): boolean {
  const norm = normalizeGmail(email);
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(norm) && norm.length >= 5 && norm.length <= 254;
}

/**
 * Compresses an arbitrary image File or Blob into an optimized WebP data URI
 * via HTML5 Canvas so every document stays safely under Firestore's 1MB ceiling.
 */
export async function compressImageBlobToWebP(
  blob: Blob,
  maxWidth = 1080,
  quality = 0.78
): Promise<string> {
  const bitmapUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (err) => reject(err);
      el.src = bitmapUrl;
    });

    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let dataUrl = canvas.toDataURL('image/webp', quality);
    let currentQ = quality;
    while (dataUrl.length > 620_000 && currentQ > 0.35) {
      currentQ -= 0.12;
      dataUrl = canvas.toDataURL('image/webp', currentQ);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/**
 * Unpacks a chapter .zip archive in the browser using JSZip, naturally sorts image entries,
 * and compresses each page to WebP for cloud storage.
 */
export async function unpackChapterZipFile(
  zipFile: File,
  onProgress?: (current: number, total: number, stage: string) => void
): Promise<string[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const imageEntries = Object.values(zip.files)
    .filter(
      (entry) =>
        !entry.dir &&
        !/(__MACOSX|\.DS_Store)/i.test(entry.name) &&
        /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(entry.name)
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

  if (imageEntries.length === 0) {
    throw new Error('No supported image files (.jpg, .png, .webp) found inside the ZIP archive.');
  }

  const pages: string[] = [];
  for (let i = 0; i < imageEntries.length; i++) {
    onProgress?.(i + 1, imageEntries.length, `Compressing ${imageEntries[i].name}`);
    const blob = await imageEntries[i].async('blob');
    const webpDataUri = await compressImageBlobToWebP(blob, 1050, 0.78);
    pages.push(webpDataUri);
  }
  return pages;
}

// ============================================================================
// 1. CLOUD USER PROFILES & DIRECTORY
// ============================================================================

function parseUserProfileDoc(data: Record<string, unknown>): UserProfile {
  return {
    uid: String(data.uid || ''),
    visibility: 'public',
    displayName: String(data.displayName || 'MGeko Reader'),
    username: String(data.username || ''),
    photoURL: String(data.photoURL || ''),
    bannerUrl: String(data.bannerUrl || ''),
    bio: String(data.bio || ''),
    pronouns: String(data.pronouns || ''),
    location: String(data.location || ''),
    favoriteGenres: Array.isArray(data.favoriteGenres)
      ? (data.favoriteGenres as string[]).slice(0, 8)
      : [],
    readingModePref: data.readingModePref === 'single' ? 'single' : 'webtoon',
    chapterAlertsEnabled:
      typeof data.chapterAlertsEnabled === 'boolean' ? data.chapterAlertsEnabled : true,
    showReadingStatsPublic:
      typeof data.showReadingStatsPublic === 'boolean' ? data.showReadingStatsPublic : true,
    createdAtMs: tsToMs(data.createdAt),
    updatedAtMs: tsToMs(data.updatedAt),
  };
}

export async function syncUserProfileOnLogin(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const userPath = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const fallbackName = (user.displayName || user.email?.split('@')[0] || 'MGeko Reader').slice(
      0,
      80
    );
    const defaultHandle = (user.email?.split('@')[0] || 'reader')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 32);

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        visibility: 'public',
        displayName: fallbackName,
        username: defaultHandle,
        photoURL: (user.photoURL || '').slice(0, 650000),
        bannerUrl: '',
        bio: '',
        pronouns: '',
        location: '',
        favoriteGenres: [],
        readingModePref: 'webtoon',
        chapterAlertsEnabled: true,
        showReadingStatsPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data();
      // Upgrade v1 docs or preserve custom user settings
      if (existing.visibility !== 'public' || typeof existing.username !== 'string') {
        await setDoc(userRef, {
          uid: user.uid,
          visibility: 'public',
          displayName: String(existing.displayName || fallbackName).slice(0, 80),
          username: String(existing.username || defaultHandle).slice(0, 40),
          photoURL: String(existing.photoURL || user.photoURL || '').slice(0, 650000),
          bannerUrl: String(existing.bannerUrl || '').slice(0, 650000),
          bio: String(existing.bio || '').slice(0, 600),
          pronouns: String(existing.pronouns || '').slice(0, 40),
          location: String(existing.location || '').slice(0, 80),
          favoriteGenres: Array.isArray(existing.favoriteGenres)
            ? existing.favoriteGenres.slice(0, 8)
            : [],
          readingModePref: existing.readingModePref === 'single' ? 'single' : 'webtoon',
          chapterAlertsEnabled:
            typeof existing.chapterAlertsEnabled === 'boolean'
              ? existing.chapterAlertsEnabled
              : true,
          showReadingStatsPublic:
            typeof existing.showReadingStatsPublic === 'boolean'
              ? existing.showReadingStatsPublic
              : true,
          createdAt: existing.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (user.email && user.email.length >= 3) {
      const privRef = doc(db, 'users', user.uid, 'private', 'info');
      const privSnap = await getDoc(privRef);
      const normEmail = normalizeGmail(user.email).slice(0, 254);
      if (!privSnap.exists()) {
        await setDoc(privRef, {
          uid: user.uid,
          email: normEmail,
          updatedAt: serverTimestamp(),
        });
      } else if (privSnap.data().email !== normEmail) {
        await updateDoc(privRef, {
          email: normEmail,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void
): () => void {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(parseUserProfileDoc(snap.data()));
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeAllUserProfiles(
  onData: (profiles: UserProfile[]) => void
): () => void {
  const path = 'users';
  const q = query(collection(db, 'users'), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => parseUserProfileDoc(d.data()))
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchUserPrivateEmail(uid: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    if (snap.exists()) return String(snap.data().email || '');
    return null;
  } catch {
    return null;
  }
}

export async function saveUserProfileCloud(
  user: User,
  input: {
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
  }
): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const cleanName = input.displayName.trim().slice(0, 80) || 'MGeko Reader';
    const cleanHandle = input.username
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-zA-Z0-9_.-]/g, '')
      .slice(0, 40);
    const cleanGenres = input.favoriteGenres.slice(0, 8).map((g) => g.slice(0, 40));

    const payload = {
      uid: user.uid,
      visibility: 'public' as const,
      displayName: cleanName,
      username: cleanHandle,
      photoURL: input.photoURL.trim().slice(0, 650000),
      bannerUrl: input.bannerUrl.trim().slice(0, 650000),
      bio: input.bio.trim().slice(0, 600),
      pronouns: input.pronouns.trim().slice(0, 40),
      location: input.location.trim().slice(0, 80),
      favoriteGenres: cleanGenres,
      readingModePref: input.readingModePref,
      chapterAlertsEnabled: Boolean(input.chapterAlertsEnabled),
      showReadingStatsPublic: Boolean(input.showReadingStatsPublic),
      createdAt: snap.exists() && snap.data().createdAt ? snap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, payload);

    // Sync display name (and short HTTP photoURL) to Firebase Auth profile
    try {
      await updateProfile(user, {
        displayName: cleanName,
        ...(payload.photoURL && payload.photoURL.length <= 1800 && !payload.photoURL.startsWith('data:')
          ? { photoURL: payload.photoURL }
          : {}),
      });
    } catch {
      // Data URIs exceed Auth photoURL limit; Cloud profile stores full high-res WebP
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// 2. GMAIL-BASED STAFF RBAC (ADMIN & MODERATOR)
// ============================================================================

export function subscribeMyStaffRole(
  userEmail: string | null | undefined,
  emailVerified: boolean,
  onRole: (role: StaffRole) => void
): () => void {
  if (!userEmail || !emailVerified) {
    onRole('user');
    return () => {};
  }
  const norm = normalizeGmail(userEmail);
  if (norm === normalizeGmail(BOOTSTRAP_ADMIN_EMAIL)) {
    onRole('admin');
    return () => {};
  }
  if (!isValidGmailFormat(norm)) {
    onRole('user');
    return () => {};
  }

  return onSnapshot(
    doc(db, 'staff', norm),
    (snap) => {
      if (!snap.exists()) {
        onRole('user');
        return;
      }
      const r = snap.data().role;
      onRole(r === 'admin' ? 'admin' : r === 'moderator' ? 'moderator' : 'user');
    },
    () => {
      onRole('user');
    }
  );
}

/**
 * Encodes/decodes StaffDirectory entries ("email:::role:::addedByEmail:::updatedAtMs")
 */
function encodeStaffEntries(entries: StaffEntry[]): string[] {
  return entries
    .slice(0, 100)
    .map(
      (e) =>
        `${normalizeGmail(e.email)}:::${e.role}:::${e.addedByEmail.slice(0, 120)}:::${e.updatedAtMs}`
    );
}

function decodeStaffEntries(raw: unknown): StaffEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const parts = String(item).split(':::');
      if (parts.length < 2) return null;
      const role = parts[1] === 'admin' ? 'admin' : 'moderator';
      return {
        email: parts[0],
        role,
        addedBy: '',
        addedByEmail: parts[2] || '',
        updatedAtMs: Number(parts[3]) || Date.now(),
      } as StaffEntry;
    })
    .filter((v): v is StaffEntry => Boolean(v && v.email));
}

export function subscribeStaffDirectory(
  onData: (entries: StaffEntry[]) => void
): () => void {
  return onSnapshot(
    doc(db, 'siteConfig', 'staffDirectory'),
    (snap) => {
      if (!snap.exists()) {
        onData([]);
        return;
      }
      onData(decodeStaffEntries(snap.data().entries));
    },
    () => {
      onData([]);
    }
  );
}

export async function upsertStaffMemberByGmail(
  adminUser: User,
  rawGmail: string,
  role: 'admin' | 'moderator',
  currentEntries: StaffEntry[]
): Promise<void> {
  const email = normalizeGmail(rawGmail);
  if (!isValidGmailFormat(email)) {
    throw new Error('Please enter a valid email address (e.g. name@gmail.com).');
  }
  if (email === normalizeGmail(BOOTSTRAP_ADMIN_EMAIL)) {
    throw new Error('The primary owner Gmail already has permanent Admin access.');
  }

  const staffPath = `staff/${email}`;
  try {
    const staffRef = doc(db, 'staff', email);
    const snap = await getDoc(staffRef);
    const adminEmail = normalizeGmail(adminUser.email || 'admin@mgeko.cc').slice(0, 254);

    if (!snap.exists()) {
      await setDoc(staffRef, {
        email,
        role,
        addedBy: adminUser.uid,
        addedByEmail: adminEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(staffRef, {
        role,
        addedBy: adminUser.uid,
        addedByEmail: adminEmail,
        updatedAt: serverTimestamp(),
      });
    }

    const filtered = currentEntries.filter((e) => normalizeGmail(e.email) !== email);
    const nextList: StaffEntry[] = [
      {
        email,
        role,
        addedBy: adminUser.uid,
        addedByEmail: adminEmail,
        updatedAtMs: Date.now(),
      },
      ...filtered,
    ];

    const dirRef = doc(db, 'siteConfig', 'staffDirectory');
    const dirSnap = await getDoc(dirRef);
    const encoded = encodeStaffEntries(nextList);
    if (!dirSnap.exists()) {
      await setDoc(dirRef, {
        id: 'staffDirectory',
        entries: encoded,
        updatedBy: adminUser.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(dirRef, {
        entries: encoded,
        updatedBy: adminUser.uid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, staffPath);
  }
}

export async function removeStaffMemberByGmail(
  adminUser: User,
  rawGmail: string,
  currentEntries: StaffEntry[]
): Promise<void> {
  const email = normalizeGmail(rawGmail);
  if (email === normalizeGmail(BOOTSTRAP_ADMIN_EMAIL)) {
    throw new Error('Cannot remove the primary owner Administrator.');
  }
  const staffPath = `staff/${email}`;
  try {
    await deleteDoc(doc(db, 'staff', email));
    const nextList = currentEntries.filter((e) => normalizeGmail(e.email) !== email);
    const dirRef = doc(db, 'siteConfig', 'staffDirectory');
    const dirSnap = await getDoc(dirRef);
    const encoded = encodeStaffEntries(nextList);
    if (dirSnap.exists()) {
      await updateDoc(dirRef, {
        entries: encoded,
        updatedBy: adminUser.uid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, staffPath);
  }
}

// ============================================================================
// 3. USER MODERATION & PUNISHMENTS (WARN / MUTE / SUSPEND / BAN)
// ============================================================================

function parseModerationDoc(data: Record<string, unknown>): UserModerationRecord {
  return {
    userId: String(data.userId || ''),
    visibility: 'public',
    status: (['active', 'warned', 'muted', 'suspended', 'banned'].includes(String(data.status))
      ? data.status
      : 'active') as ModerationStatus,
    reason: String(data.reason || ''),
    warningMessage: String(data.warningMessage || ''),
    isPermanent: Boolean(data.isPermanent),
    expiresAtMs: tsToMs(data.expiresAt),
    updatedBy: String(data.updatedBy || ''),
    updatedAtMs: tsToMs(data.updatedAt),
  };
}

export function isSanctionCurrentlyActive(mod: UserModerationRecord | null | undefined): boolean {
  if (!mod) return false;
  if (!['muted', 'suspended', 'banned'].includes(mod.status)) return false;
  if (mod.isPermanent) return true;
  return Date.now() < mod.expiresAtMs;
}

export function subscribeUserModeration(
  uid: string,
  onData: (mod: UserModerationRecord | null) => void
): () => void {
  return onSnapshot(
    doc(db, 'userModeration', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(parseModerationDoc(snap.data()));
    },
    () => {
      onData(null);
    }
  );
}

export function subscribeAllUserModerations(
  onData: (map: Record<string, UserModerationRecord>) => void
): () => void {
  const q = query(collection(db, 'userModeration'), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snap) => {
      const m: Record<string, UserModerationRecord> = {};
      for (const d of snap.docs) {
        const rec = parseModerationDoc(d.data());
        m[rec.userId] = rec;
      }
      onData(m);
    },
    () => {
      onData({});
    }
  );
}

export async function setUserModerationCloud(
  staffUser: User,
  targetUserId: string,
  input: {
    status: ModerationStatus;
    reason: string;
    warningMessage?: string;
    durationHours?: number | 'permanent';
  }
): Promise<void> {
  const path = `userModeration/${targetUserId}`;
  try {
    const ref = doc(db, 'userModeration', targetUserId);
    const snap = await getDoc(ref);
    const isPermanent = input.durationHours === 'permanent';
    const hours = typeof input.durationHours === 'number' ? input.durationHours : 24;
    const expiresDate = new Date(Date.now() + hours * 3600 * 1000);
    const expiresTs = Timestamp.fromDate(expiresDate);

    const payload = {
      userId: targetUserId,
      visibility: 'public' as const,
      status: input.status,
      reason: input.reason.trim().slice(0, 500),
      warningMessage: (input.warningMessage || input.reason || '').trim().slice(0, 500),
      isPermanent,
      expiresAt: expiresTs,
      updatedBy: staffUser.uid,
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, {
        status: payload.status,
        reason: payload.reason,
        warningMessage: payload.warningMessage,
        isPermanent: payload.isPermanent,
        expiresAt: payload.expiresAt,
        updatedBy: payload.updatedBy,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchTargetUserReadingHistory(
  targetUserId: string
): Promise<ReadingHistoryItem[]> {
  const path = `users/${targetUserId}/history`;
  try {
    const q = query(
      collection(db, 'users', targetUserId, 'history'),
      where('userId', '==', targetUserId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          userId: data.userId,
          seriesId: data.seriesId,
          seriesTitle: data.seriesTitle,
          coverUrl: data.coverUrl,
          lastChapterId: data.lastChapterId,
          lastChapterNum: Number(data.lastChapterNum) || 1,
          lastChapterTitle: String(data.lastChapterTitle || ''),
          lastPageIndex: Number(data.lastPageIndex) || 0,
          readChapterIds: Array.isArray(data.readChapterIds) ? data.readChapterIds : [],
          updatedAtMs: tsToMs(data.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ============================================================================
// 4. GLOBAL SITE SETTINGS (ADMIN ONLY WRITE, PUBLIC LIVE SYNC)
// ============================================================================

export function subscribeSiteSettings(
  onData: (settings: SiteSettings) => void
): () => void {
  return onSnapshot(
    doc(db, 'siteConfig', 'settings'),
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_SITE_SETTINGS);
        return;
      }
      const d = snap.data();
      const rawCopy =
        d.uiCopy && typeof d.uiCopy === 'object' ? (d.uiCopy as Record<string, string>) : {};
      onData({
        id: 'settings',
        visibility: 'public',
        siteName: String(d.siteName || DEFAULT_SITE_SETTINGS.siteName),
        siteTagline: String(d.siteTagline ?? DEFAULT_SITE_SETTINGS.siteTagline),
        logoUrl: String(d.logoUrl || ''),
        announcementBanner: String(d.announcementBanner || ''),
        themePreset: String(d.themePreset || DEFAULT_SITE_SETTINGS.themePreset),
        bgCanvasHex: String(d.bgCanvasHex || DEFAULT_SITE_SETTINGS.bgCanvasHex),
        bgSurfaceHex: String(d.bgSurfaceHex || DEFAULT_SITE_SETTINGS.bgSurfaceHex),
        accentHex: String(d.accentHex || DEFAULT_SITE_SETTINGS.accentHex),
        textPrimaryHex: String(d.textPrimaryHex || DEFAULT_SITE_SETTINGS.textPrimaryHex),
        uiCopy: { ...DEFAULT_UI_COPY, ...rawCopy },
        textReplacements: Array.isArray(d.textReplacements)
          ? (d.textReplacements as string[]).slice(0, 80)
          : [],
        updatedBy: String(d.updatedBy || ''),
        updatedAtMs: tsToMs(d.updatedAt),
      });
    },
    () => {
      onData(DEFAULT_SITE_SETTINGS);
    }
  );
}

export async function saveSiteSettingsCloud(
  adminUser: User,
  input: Omit<SiteSettings, 'id' | 'visibility' | 'updatedBy' | 'updatedAtMs'>
): Promise<void> {
  const path = 'siteConfig/settings';
  try {
    const ref = doc(db, 'siteConfig', 'settings');
    const snap = await getDoc(ref);

    // Trim uiCopy entries cleanly
    const cleanCopy: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.uiCopy || {}).slice(0, 95)) {
      cleanCopy[k.slice(0, 60)] = String(v ?? '').slice(0, 500);
    }

    const cleanReplacements = (input.textReplacements || [])
      .filter((r) => r.includes(':::'))
      .slice(0, 80)
      .map((r) => r.slice(0, 600));

    const payload = {
      id: 'settings' as const,
      visibility: 'public' as const,
      siteName: input.siteName.trim().slice(0, 80) || 'MGeko',
      siteTagline: input.siteTagline.trim().slice(0, 200),
      logoUrl: input.logoUrl.trim().slice(0, 650000),
      announcementBanner: input.announcementBanner.trim().slice(0, 300),
      themePreset: input.themePreset.slice(0, 40),
      bgCanvasHex: input.bgCanvasHex.trim().slice(0, 16) || '#0B0E14',
      bgSurfaceHex: input.bgSurfaceHex.trim().slice(0, 16) || '#131822',
      accentHex: input.accentHex.trim().slice(0, 16) || '#3B82F6',
      textPrimaryHex: input.textPrimaryHex.trim().slice(0, 16) || '#F1F5F9',
      uiCopy: cleanCopy,
      textReplacements: cleanReplacements,
      updatedBy: adminUser.uid,
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, {
        siteName: payload.siteName,
        siteTagline: payload.siteTagline,
        logoUrl: payload.logoUrl,
        announcementBanner: payload.announcementBanner,
        themePreset: payload.themePreset,
        bgCanvasHex: payload.bgCanvasHex,
        bgSurfaceHex: payload.bgSurfaceHex,
        accentHex: payload.accentHex,
        textPrimaryHex: payload.textPrimaryHex,
        uiCopy: payload.uiCopy,
        textReplacements: payload.textReplacements,
        updatedBy: payload.updatedBy,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// 5. SERIES & CHAPTER CATALOG
// ============================================================================

export function subscribePublicSeries(
  onData: (cloudSeries: Series[]) => void
): () => void {
  const path = 'series';
  const q = query(collection(db, 'series'), where('visibility', '==', 'public'));
  return onSnapshot(
    q,
    (snap) => {
      const list: Series[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id,
          visibility: 'public',
          title: data.title,
          altTitles: Array.isArray(data.altTitles) ? data.altTitles : [],
          synopsis: data.synopsis,
          author: data.author,
          artist: data.artist,
          coverUrl: data.coverUrl,
          status: data.status as MangaStatus,
          type: data.type as MangaType,
          releaseYear: Number(data.releaseYear) || 2025,
          genres: Array.isArray(data.genres) ? data.genres : ['Action'],
          views: Number(data.views) || 0,
          ratingSum: Number(data.ratingSum) || 0,
          ratingCount: Number(data.ratingCount) || 0,
          ratingAvg: Number(data.ratingAvg) || 0,
          latestChapterNum: Number(data.latestChapterNum) || 0,
          latestChapterTitle: String(data.latestChapterTitle || ''),
          chapterCount: Number(data.chapterCount) || 0,
          isFeatured: Boolean(data.isFeatured),
          createdBy: String(data.createdBy || ''),
          createdAtMs: tsToMs(data.createdAt),
          updatedAtMs: tsToMs(data.updatedAt),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Ensures a seed series and its starter chapter metadata exist in Cloud Firestore
 * in a fast batched commit when a user interacts with it.
 */
export async function ensureSeriesPersistedInCloud(
  series: Series,
  user: User
): Promise<void> {
  if (!user.emailVerified) return;
  const path = `series/${series.id}`;
  try {
    const seriesRef = doc(db, 'series', series.id);
    const snap = await getDoc(seriesRef);
    if (snap.exists()) return;

    await setDoc(seriesRef, {
      id: series.id,
      visibility: 'public',
      title: series.title.slice(0, 200),
      altTitles: series.altTitles.slice(0, 10).map((t) => t.slice(0, 200)),
      synopsis: series.synopsis.slice(0, 4000),
      author: series.author.slice(0, 120),
      artist: series.artist.slice(0, 120),
      coverUrl: series.coverUrl.slice(0, 650000),
      status: series.status,
      type: series.type,
      releaseYear: series.releaseYear,
      genres: series.genres.slice(0, 10).map((g) => g.slice(0, 40)),
      views: series.views,
      ratingSum: series.ratingSum,
      ratingCount: series.ratingCount,
      ratingAvg: series.ratingAvg,
      latestChapterNum: series.latestChapterNum,
      latestChapterTitle: series.latestChapterTitle.slice(0, 200),
      chapterCount: series.chapterCount,
      isFeatured: series.isFeatured,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const seedChs = SEED_CHAPTERS[series.id] || [];
    if (seedChs.length > 0) {
      const batch = writeBatch(db);
      for (const ch of seedChs) {
        const chRef = doc(db, 'series', series.id, 'chapters', ch.id);
        batch.set(chRef, {
          id: ch.id,
          seriesId: series.id,
          visibility: 'public',
          chapterNumber: ch.chapterNumber,
          title: ch.title.slice(0, 200),
          pageCount: ch.pageCount,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function seedFullStarterCatalogToCloud(
  user: User,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < SEED_SERIES.length; i++) {
    await ensureSeriesPersistedInCloud(SEED_SERIES[i], user);
    onProgress?.(i + 1, SEED_SERIES.length);
  }
}

export function subscribeSeriesChapters(
  seriesId: string,
  onData: (chapters: Chapter[]) => void
): () => void {
  const path = `series/${seriesId}/chapters`;
  const q = query(
    collection(db, 'series', seriesId, 'chapters'),
    where('visibility', '==', 'public')
  );
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty && SEED_CHAPTERS[seriesId]) {
        onData(
          [...SEED_CHAPTERS[seriesId]].sort((a, b) => b.chapterNumber - a.chapterNumber)
        );
        return;
      }
      const cloudList: Chapter[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id,
          seriesId: data.seriesId,
          visibility: 'public' as const,
          chapterNumber: Number(data.chapterNumber) || 1,
          title: String(data.title || ''),
          pageCount: Number(data.pageCount) || 1,
          createdBy: String(data.createdBy || ''),
          createdAtMs: tsToMs(data.createdAt),
          updatedAtMs: tsToMs(data.updatedAt),
        };
      });

      // Merge any missing seed chapters if an older partial seed existed
      const cloudMap = new Map(cloudList.map((c) => [c.chapterNumber, c]));
      const seedFallback = SEED_CHAPTERS[seriesId] || [];
      for (const sc of seedFallback) {
        if (!cloudMap.has(sc.chapterNumber)) {
          cloudList.push(sc);
        }
      }

      onData(cloudList.sort((a, b) => b.chapterNumber - a.chapterNumber));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchChapterPagesCloud(
  series: Series,
  chapter: Chapter
): Promise<string[]> {
  const path = `series/${series.id}/chapters/${chapter.id}/pages`;
  try {
    const q = query(
      collection(db, 'series', series.id, 'chapters', chapter.id, 'pages'),
      where('visibility', '==', 'public')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs
        .map((d) => d.data() as ChapterPage)
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((p) => p.imageUrl);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
  return buildSeedChapterPages(
    series.title,
    chapter.chapterNumber,
    chapter.title,
    chapter.pageCount
  );
}

export async function incrementSeriesViewCount(
  series: Series,
  user: User | null
): Promise<void> {
  if (!user || !user.emailVerified || series.isSeedOnly) return;
  try {
    await updateDoc(doc(db, 'series', series.id), {
      views: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking view increment
  }
}

export async function saveSeriesMetadataCloud(
  user: User,
  input: {
    existingId?: string;
    title: string;
    altTitles: string[];
    synopsis: string;
    author: string;
    artist: string;
    coverUrl: string;
    status: MangaStatus;
    type: MangaType;
    releaseYear: number;
    genres: string[];
    isFeatured: boolean;
  }
): Promise<string> {
  const seriesId =
    input.existingId || sanitizeId(`${input.title}-${Date.now().toString(36)}`);
  const path = `series/${seriesId}`;
  try {
    const ref = doc(db, 'series', seriesId);
    const snap = await getDoc(ref);
    const genres = input.genres.length > 0 ? input.genres.slice(0, 10) : ['Action'];
    const altTitles = input.altTitles.filter(Boolean).slice(0, 10).map((t) => t.slice(0, 200));

    if (!snap.exists()) {
      await setDoc(ref, {
        id: seriesId,
        visibility: 'public',
        title: input.title.trim().slice(0, 200),
        altTitles,
        synopsis: input.synopsis.trim().slice(0, 4000),
        author: input.author.trim().slice(0, 120),
        artist: input.artist.trim().slice(0, 120),
        coverUrl: input.coverUrl.trim().slice(0, 650000),
        status: input.status,
        type: input.type,
        releaseYear: Math.min(2100, Math.max(1950, Math.round(input.releaseYear))),
        genres: genres.map((g) => g.slice(0, 40)),
        views: 1,
        ratingSum: 5,
        ratingCount: 1,
        ratingAvg: 5,
        latestChapterNum: 0,
        latestChapterTitle: '',
        chapterCount: 0,
        isFeatured: input.isFeatured,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: input.title.trim().slice(0, 200),
        altTitles,
        synopsis: input.synopsis.trim().slice(0, 4000),
        author: input.author.trim().slice(0, 120),
        artist: input.artist.trim().slice(0, 120),
        coverUrl: input.coverUrl.trim().slice(0, 650000),
        status: input.status,
        type: input.type,
        releaseYear: Math.min(2100, Math.max(1950, Math.round(input.releaseYear))),
        genres: genres.map((g) => g.slice(0, 40)),
        isFeatured: input.isFeatured,
        updatedAt: serverTimestamp(),
      });
    }
    return seriesId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function publishChapterToCloud(
  user: User,
  series: Series,
  chapterNumber: number,
  chapterTitle: string,
  pageImages: string[],
  onProgress?: (done: number, total: number, stage: string) => void
): Promise<string> {
  await ensureSeriesPersistedInCloud(series, user);

  const chapterId = sanitizeId(
    `${series.id}-ch-${String(chapterNumber).replace('.', '_')}-${Date.now().toString(36)}`
  );
  const chapterPath = `series/${series.id}/chapters/${chapterId}`;

  try {
    onProgress?.(0, pageImages.length, 'Creating chapter metadata...');
    await setDoc(doc(db, 'series', series.id, 'chapters', chapterId), {
      id: chapterId,
      seriesId: series.id,
      visibility: 'public',
      chapterNumber,
      title: chapterTitle.trim().slice(0, 200),
      pageCount: pageImages.length,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (let i = 0; i < pageImages.length; i++) {
      const pageId = `page-${String(i + 1).padStart(3, '0')}`;
      onProgress?.(
        i + 1,
        pageImages.length,
        `Uploading page ${i + 1} of ${pageImages.length} to Cloud...`
      );
      await setDoc(doc(db, 'series', series.id, 'chapters', chapterId, 'pages', pageId), {
        id: pageId,
        seriesId: series.id,
        chapterId,
        visibility: 'public',
        pageNumber: i + 1,
        imageUrl: pageImages[i].slice(0, 800000),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
    }

    const nextLatestNum = Math.max(series.latestChapterNum, chapterNumber);
    const nextLatestTitle =
      chapterNumber >= series.latestChapterNum
        ? chapterTitle.trim().slice(0, 200)
        : series.latestChapterTitle;

    await updateDoc(doc(db, 'series', series.id), {
      latestChapterNum: nextLatestNum,
      latestChapterTitle: nextLatestTitle,
      chapterCount: series.chapterCount + 1,
      updatedAt: serverTimestamp(),
    });

    const subQuery = query(
      collection(db, 'series', series.id, 'subscribers'),
      where('seriesId', '==', series.id)
    );
    const subSnap = await getDocs(subQuery);
    for (const subDoc of subSnap.docs) {
      const subscriberUid = subDoc.data().userId as string;
      // Check if subscriber opted out of chapter alerts
      const profSnap = await getDoc(doc(db, 'users', subscriberUid));
      if (profSnap.exists() && profSnap.data().chapterAlertsEnabled === false) {
        continue;
      }
      const notifId = sanitizeId(
        `notif-${series.id}-${chapterId}-${subscriberUid.slice(0, 12)}`
      );
      await setDoc(doc(db, 'users', subscriberUid, 'notifications', notifId), {
        id: notifId,
        userId: subscriberUid,
        seriesId: series.id,
        seriesTitle: series.title.slice(0, 200),
        chapterId,
        chapterNumber,
        message: `Chapter ${chapterNumber}${
          chapterTitle ? `: ${chapterTitle}` : ''
        } of ${series.title} is now available!`.slice(0, 300),
        isRead: false,
        senderId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return chapterId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, chapterPath);
  }
}

export async function deleteChapterFromCloud(
  series: Series,
  chapter: Chapter
): Promise<void> {
  const path = `series/${series.id}/chapters/${chapter.id}`;
  try {
    const pagesQ = query(
      collection(db, 'series', series.id, 'chapters', chapter.id, 'pages'),
      where('visibility', '==', 'public')
    );
    const pagesSnap = await getDocs(pagesQ);
    for (const p of pagesSnap.docs) {
      await deleteDoc(p.ref);
    }
    await deleteDoc(doc(db, 'series', series.id, 'chapters', chapter.id));
    await updateDoc(doc(db, 'series', series.id), {
      chapterCount: Math.max(0, series.chapterCount - 1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteSeriesFromCloud(seriesId: string): Promise<void> {
  const path = `series/${seriesId}`;
  try {
    const chQ = query(
      collection(db, 'series', seriesId, 'chapters'),
      where('visibility', '==', 'public')
    );
    const chSnap = await getDocs(chQ);
    for (const chDoc of chSnap.docs) {
      const pagesQ = query(
        collection(db, 'series', seriesId, 'chapters', chDoc.id, 'pages'),
        where('visibility', '==', 'public')
      );
      const pagesSnap = await getDocs(pagesQ);
      for (const pDoc of pagesSnap.docs) {
        await deleteDoc(pDoc.ref);
      }
      await deleteDoc(chDoc.ref);
    }
    await deleteDoc(doc(db, 'series', seriesId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// 6. BOOKMARKS, READING HISTORY (RE-READ RESET) & NOTIFICATIONS
// ============================================================================

export function subscribeUserBookmarks(
  userId: string,
  onData: (bookmarks: BookmarkItem[]) => void
): () => void {
  const path = `users/${userId}/bookmarks`;
  const q = query(
    collection(db, 'users', userId, 'bookmarks'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: BookmarkItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            userId: data.userId,
            seriesId: data.seriesId,
            seriesTitle: data.seriesTitle,
            coverUrl: data.coverUrl,
            latestChapterNum: Number(data.latestChapterNum) || 0,
            type: data.type as MangaType,
            createdAtMs: tsToMs(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function toggleCloudBookmark(
  user: User,
  series: Series,
  currentlyBookmarked: boolean
): Promise<void> {
  await ensureSeriesPersistedInCloud(series, user);
  const bmPath = `users/${user.uid}/bookmarks/${series.id}`;
  try {
    const bmRef = doc(db, 'users', user.uid, 'bookmarks', series.id);
    const subRef = doc(db, 'series', series.id, 'subscribers', user.uid);
    const batch = writeBatch(db);

    if (currentlyBookmarked) {
      batch.delete(bmRef);
      batch.delete(subRef);
    } else {
      batch.set(bmRef, {
        userId: user.uid,
        seriesId: series.id,
        seriesTitle: series.title.slice(0, 200),
        coverUrl: series.coverUrl.slice(0, 650000),
        latestChapterNum: series.latestChapterNum,
        type: series.type,
        createdAt: serverTimestamp(),
      });
      batch.set(subRef, {
        userId: user.uid,
        seriesId: series.id,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, bmPath);
  }
}

export function subscribeUserHistory(
  userId: string,
  onData: (history: ReadingHistoryItem[]) => void
): () => void {
  const path = `users/${userId}/history`;
  const q = query(
    collection(db, 'users', userId, 'history'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: ReadingHistoryItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            userId: data.userId,
            seriesId: data.seriesId,
            seriesTitle: data.seriesTitle,
            coverUrl: data.coverUrl,
            lastChapterId: data.lastChapterId,
            lastChapterNum: Number(data.lastChapterNum) || 1,
            lastChapterTitle: String(data.lastChapterTitle || ''),
            lastPageIndex: Number(data.lastPageIndex) || 0,
            readChapterIds: Array.isArray(data.readChapterIds) ? data.readChapterIds : [],
            updatedAtMs: tsToMs(data.updatedAt),
          };
        })
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function recordCloudReadingProgress(
  user: User,
  series: Series,
  chapter: Chapter,
  pageIndex: number,
  existingHistory?: ReadingHistoryItem
): Promise<void> {
  if (!user.emailVerified) return;
  await ensureSeriesPersistedInCloud(series, user);
  const path = `users/${user.uid}/history/${series.id}`;
  try {
    const histRef = doc(db, 'users', user.uid, 'history', series.id);
    const prevRead = existingHistory?.readChapterIds || [];
    const nextRead = Array.from(new Set([chapter.id, ...prevRead])).slice(0, 1000);

    const snap = await getDoc(histRef);
    const payload = {
      userId: user.uid,
      seriesId: series.id,
      seriesTitle: series.title.slice(0, 200),
      coverUrl: series.coverUrl.slice(0, 650000),
      lastChapterId: chapter.id,
      lastChapterNum: chapter.chapterNumber,
      lastChapterTitle: chapter.title.slice(0, 200),
      lastPageIndex: Math.min(500, Math.max(0, pageIndex)),
      readChapterIds: nextRead,
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) {
      await setDoc(histRef, payload);
    } else {
      await updateDoc(histRef, {
        seriesTitle: payload.seriesTitle,
        coverUrl: payload.coverUrl,
        lastChapterId: payload.lastChapterId,
        lastChapterNum: payload.lastChapterNum,
        lastChapterTitle: payload.lastChapterTitle,
        lastPageIndex: payload.lastPageIndex,
        readChapterIds: payload.readChapterIds,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Resets a user's reading progress on a series to any specific chapter (e.g. Ch. 1 or Ch. 2)
 * and clears read checkmarks for chapters after the chosen chapter so they can enjoy a fresh re-read!
 */
export async function resetSeriesReadingProgressCloud(
  user: User,
  series: Series,
  targetChapter: Chapter,
  allSeriesChapters: Chapter[]
): Promise<void> {
  await ensureSeriesPersistedInCloud(series, user);
  const path = `users/${user.uid}/history/${series.id}`;
  try {
    const histRef = doc(db, 'users', user.uid, 'history', series.id);
    const snap = await getDoc(histRef);

    // Keep chapters strictly <= targetChapter.chapterNumber as read
    const keptReadIds = allSeriesChapters
      .filter((ch) => ch.chapterNumber <= targetChapter.chapterNumber)
      .map((ch) => ch.id)
      .slice(0, 1000);

    const payload = {
      userId: user.uid,
      seriesId: series.id,
      seriesTitle: series.title.slice(0, 200),
      coverUrl: series.coverUrl.slice(0, 650000),
      lastChapterId: targetChapter.id,
      lastChapterNum: targetChapter.chapterNumber,
      lastChapterTitle: targetChapter.title.slice(0, 200),
      lastPageIndex: 0,
      readChapterIds: keptReadIds.length > 0 ? keptReadIds : [targetChapter.id],
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(histRef, payload);
    } else {
      await updateDoc(histRef, {
        seriesTitle: payload.seriesTitle,
        coverUrl: payload.coverUrl,
        lastChapterId: payload.lastChapterId,
        lastChapterNum: payload.lastChapterNum,
        lastChapterTitle: payload.lastChapterTitle,
        lastPageIndex: 0,
        readChapterIds: payload.readChapterIds,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSeriesReadingHistoryCloud(
  userId: string,
  seriesId: string
): Promise<void> {
  const path = `users/${userId}/history/${seriesId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'history', seriesId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearAllReadingHistoryCloud(
  userId: string,
  items: ReadingHistoryItem[]
): Promise<void> {
  if (items.length === 0) return;
  const path = `users/${userId}/history`;
  try {
    const batch = writeBatch(db);
    for (const item of items) {
      batch.delete(doc(db, 'users', userId, 'history', item.seriesId));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserNotifications(
  userId: string,
  onData: (notifications: NotificationItem[]) => void
): () => void {
  const path = `users/${userId}/notifications`;
  const q = query(
    collection(db, 'users', userId, 'notifications'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: NotificationItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: data.id,
            userId: data.userId,
            seriesId: data.seriesId,
            seriesTitle: data.seriesTitle,
            chapterId: data.chapterId,
            chapterNumber: Number(data.chapterNumber) || 1,
            message: data.message,
            isRead: Boolean(data.isRead),
            senderId: data.senderId,
            createdAtMs: tsToMs(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function setCloudNotificationReadState(
  userId: string,
  notifId: string,
  isRead: boolean
): Promise<void> {
  const path = `users/${userId}/notifications/${notifId}`;
  try {
    await updateDoc(doc(db, 'users', userId, 'notifications', notifId), {
      isRead,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markCloudNotificationRead(
  userId: string,
  notifId: string
): Promise<void> {
  return setCloudNotificationReadState(userId, notifId, true);
}

export async function markAllCloudNotificationsRead(
  userId: string,
  notifications: NotificationItem[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;
  const path = `users/${userId}/notifications`;
  try {
    const batch = writeBatch(db);
    for (const n of unread) {
      batch.update(doc(db, 'users', userId, 'notifications', n.id), {
        isRead: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCloudNotification(
  userId: string,
  notifId: string
): Promise<void> {
  const path = `users/${userId}/notifications/${notifId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'notifications', notifId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearAllCloudNotifications(
  userId: string,
  notifications: NotificationItem[]
): Promise<void> {
  if (notifications.length === 0) return;
  const path = `users/${userId}/notifications`;
  try {
    const batch = writeBatch(db);
    for (const n of notifications) {
      batch.delete(doc(db, 'users', userId, 'notifications', n.id));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// 7. 20-CHAPTER GATED SERIES RATINGS
// ============================================================================

export async function submitCloudSeriesRating(
  user: User,
  series: Series,
  score: number,
  readChaptersCount: number
): Promise<void> {
  if (readChaptersCount < 20) {
    throw new Error(
      `You need to read at least 20 chapters of ${series.title} before rating (${readChaptersCount}/20 read).`
    );
  }
  await ensureSeriesPersistedInCloud(series, user);
  const path = `series/${series.id}/ratings/${user.uid}`;
  try {
    const seriesRef = doc(db, 'series', series.id);
    const ratingRef = doc(db, 'series', series.id, 'ratings', user.uid);
    const clampedScore = Math.min(5, Math.max(1, Math.round(score)));

    await runTransaction(db, async (tx) => {
      const seriesSnap = await tx.get(seriesRef);
      const ratingSnap = await tx.get(ratingRef);
      if (!seriesSnap.exists()) throw new Error('Series document not found');

      const sData = seriesSnap.data();
      let ratingSum = Number(sData.ratingSum) || 0;
      let ratingCount = Number(sData.ratingCount) || 0;

      if (ratingSnap.exists()) {
        const oldScore = Number(ratingSnap.data().score) || 0;
        ratingSum = Math.max(0, ratingSum - oldScore + clampedScore);
        tx.update(ratingRef, {
          score: clampedScore,
          updatedAt: serverTimestamp(),
        });
      } else {
        ratingSum += clampedScore;
        ratingCount += 1;
        tx.set(ratingRef, {
          userId: user.uid,
          seriesId: series.id,
          visibility: 'public',
          score: clampedScore,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const ratingAvg =
        ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : clampedScore;
      tx.update(seriesRef, {
        ratingSum,
        ratingCount,
        ratingAvg,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserSeriesRating(
  seriesId: string,
  userId: string
): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'series', seriesId, 'ratings', userId));
    if (snap.exists()) return Number(snap.data().score) || null;
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// 8. COMMENTS (RICH TEXT, IMAGES, 10-MIN EDIT, DEEP REPLIES) & REPORTS
// ============================================================================

function parseCommentDoc(data: Record<string, unknown>): CommentItem {
  return {
    id: String(data.id || ''),
    visibility: 'public',
    seriesId: String(data.seriesId || ''),
    seriesTitle: String(data.seriesTitle || ''),
    chapterId: String(data.chapterId || ''),
    parentId: String(data.parentId || ''),
    replyToName: String(data.replyToName || ''),
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || 'Reader'),
    authorPhoto: String(data.authorPhoto || ''),
    content: String(data.content || ''),
    imageUrl: String(data.imageUrl || ''),
    isEdited: Boolean(data.isEdited),
    likesCount: Number(data.likesCount) || 0,
    createdAtMs: tsToMs(data.createdAt),
    updatedAtMs: tsToMs(data.updatedAt),
  };
}

export function subscribeSeriesComments(
  seriesId: string | null,
  onData: (comments: CommentItem[]) => void
): () => void {
  const path = 'comments';
  const q = seriesId
    ? query(
        collection(db, 'comments'),
        where('visibility', '==', 'public'),
        where('seriesId', '==', seriesId)
      )
    : query(collection(db, 'comments'), where('visibility', '==', 'public'));

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => parseCommentDoc(d.data()))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAuthorComments(
  authorId: string,
  onData: (comments: CommentItem[]) => void
): () => void {
  const path = 'comments';
  const q = query(
    collection(db, 'comments'),
    where('visibility', '==', 'public'),
    where('authorId', '==', authorId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => parseCommentDoc(d.data()))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function postCloudComment(
  user: User,
  series: Series,
  content: string,
  options?: {
    chapterId?: string;
    parentId?: string;
    replyToName?: string;
    imageUrl?: string;
    authorProfile?: UserProfile | null;
  }
): Promise<void> {
  await ensureSeriesPersistedInCloud(series, user);
  const commentId = sanitizeId(
    `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  );
  const path = `comments/${commentId}`;
  try {
    const authorName = (
      options?.authorProfile?.displayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'Reader'
    ).slice(0, 80);
    const authorPhoto = (
      options?.authorProfile?.photoURL ||
      user.photoURL ||
      ''
    ).slice(0, 650000);

    await setDoc(doc(db, 'comments', commentId), {
      id: commentId,
      visibility: 'public',
      seriesId: series.id,
      seriesTitle: series.title.slice(0, 200),
      chapterId: (options?.chapterId || '').slice(0, 128),
      parentId: (options?.parentId || '').slice(0, 128),
      replyToName: (options?.replyToName || '').slice(0, 80),
      authorId: user.uid,
      authorName,
      authorPhoto,
      content: content.trim().slice(0, 2000),
      imageUrl: (options?.imageUrl || '').trim().slice(0, 650000),
      isEdited: false,
      likesCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;

export async function editCloudComment(
  user: User,
  comment: CommentItem,
  newContent: string,
  newImageUrl: string
): Promise<void> {
  if (user.uid !== comment.authorId) {
    throw new Error('Only the comment author can edit this comment.');
  }
  if (Date.now() - comment.createdAtMs >= COMMENT_EDIT_WINDOW_MS) {
    throw new Error('The 10-minute edit window for this comment has expired.');
  }
  const cleanText = newContent.trim().slice(0, 2000);
  const cleanImg = newImageUrl.trim().slice(0, 650000);
  if (!cleanText && !cleanImg) {
    throw new Error('Comment must include text or an image.');
  }
  const path = `comments/${comment.id}`;
  try {
    const ref = doc(db, 'comments', comment.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Comment not found.');
    const existing = snap.data();

    // Ensure full v2 fields exist if editing
    if (typeof existing.isEdited !== 'boolean' || typeof existing.imageUrl !== 'string') {
      await setDoc(ref, {
        id: comment.id,
        visibility: 'public',
        seriesId: existing.seriesId,
        seriesTitle: String(existing.seriesTitle || ''),
        chapterId: String(existing.chapterId || ''),
        parentId: String(existing.parentId || ''),
        replyToName: String(existing.replyToName || ''),
        authorId: existing.authorId,
        authorName: String(existing.authorName || 'Reader'),
        authorPhoto: String(existing.authorPhoto || ''),
        content: cleanText,
        imageUrl: cleanImg,
        isEdited: true,
        likesCount: Number(existing.likesCount) || 0,
        createdAt: existing.createdAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        content: cleanText,
        imageUrl: cleanImg,
        isEdited: true,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleCloudCommentLike(
  user: User,
  commentId: string
): Promise<boolean> {
  const path = `comments/${commentId}`;
  try {
    const commentRef = doc(db, 'comments', commentId);
    const likeRef = doc(db, 'comments', commentId, 'likes', user.uid);
    let likedAfter = false;

    await runTransaction(db, async (tx) => {
      const commentSnap = await tx.get(commentRef);
      const likeSnap = await tx.get(likeRef);
      if (!commentSnap.exists()) throw new Error('Comment does not exist');

      const cData = commentSnap.data();
      const currentLikes = Number(cData.likesCount) || 0;
      const nextLikes = likeSnap.exists()
        ? Math.max(0, currentLikes - 1)
        : currentLikes + 1;

      if (likeSnap.exists()) {
        tx.delete(likeRef);
        likedAfter = false;
      } else {
        tx.set(likeRef, {
          userId: user.uid,
          commentId,
          createdAt: serverTimestamp(),
        });
        likedAfter = true;
      }

      // Upgrade v1 doc shape if needed, otherwise atomic update
      if (typeof cData.isEdited !== 'boolean' || typeof cData.imageUrl !== 'string') {
        tx.set(commentRef, {
          id: commentId,
          visibility: 'public',
          seriesId: cData.seriesId,
          seriesTitle: String(cData.seriesTitle || ''),
          chapterId: String(cData.chapterId || ''),
          parentId: String(cData.parentId || ''),
          replyToName: String(cData.replyToName || ''),
          authorId: cData.authorId,
          authorName: String(cData.authorName || 'Reader'),
          authorPhoto: String(cData.authorPhoto || ''),
          content: String(cData.content || ''),
          imageUrl: String(cData.imageUrl || ''),
          isEdited: Boolean(cData.isEdited),
          likesCount: nextLikes,
          createdAt: cData.createdAt,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(commentRef, {
          likesCount: nextLikes,
          updatedAt: serverTimestamp(),
        });
      }
    });
    return likedAfter;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCloudComment(commentId: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Submit a report for a negative/rule-breaking comment OR a chapter issue (e.g., missing page).
 */
export async function submitContentReport(
  user: User,
  input: {
    targetType: 'comment' | 'chapter';
    seriesId: string;
    seriesTitle: string;
    chapterId?: string;
    chapterNumber?: number;
    commentId?: string;
    commentAuthorId?: string;
    commentSnippet?: string;
    reason: string;
    details: string;
    reporterProfile?: UserProfile | null;
  }
): Promise<void> {
  const reportId = sanitizeId(
    `rpt-${input.targetType}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );
  const path = `reports/${reportId}`;
  try {
    const reporterName = (
      input.reporterProfile?.displayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'Reader'
    ).slice(0, 80);

    await setDoc(doc(db, 'reports', reportId), {
      id: reportId,
      scope: 'moderation',
      targetType: input.targetType,
      seriesId: input.seriesId,
      seriesTitle: input.seriesTitle.slice(0, 200),
      chapterId: (input.chapterId || '').slice(0, 128),
      chapterNumber: Number(input.chapterNumber) || 0,
      commentId: (input.commentId || '').slice(0, 128),
      commentAuthorId: (input.commentAuthorId || '').slice(0, 128),
      commentSnippet: (input.commentSnippet || '').slice(0, 500),
      reporterId: user.uid,
      reporterName,
      reason: input.reason.trim().slice(0, 120),
      details: input.details.trim().slice(0, 1000),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeContentReports(
  onData: (reports: ContentReportItem[]) => void
): () => void {
  const path = 'reports';
  const q = query(collection(db, 'reports'), where('scope', '==', 'moderation'));
  return onSnapshot(
    q,
    (snap) => {
      const items: ContentReportItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            scope: 'moderation' as const,
            targetType: (data.targetType === 'chapter' ? 'chapter' : 'comment') as
              | 'chapter'
              | 'comment',
            seriesId: String(data.seriesId || ''),
            seriesTitle: String(data.seriesTitle || ''),
            chapterId: String(data.chapterId || ''),
            chapterNumber: Number(data.chapterNumber) || 0,
            commentId: String(data.commentId || ''),
            commentAuthorId: String(data.commentAuthorId || ''),
            commentSnippet: String(data.commentSnippet || ''),
            reporterId: String(data.reporterId || ''),
            reporterName: String(data.reporterName || 'Reader'),
            reason: String(data.reason || ''),
            details: String(data.details || ''),
            status: (['open', 'resolved', 'dismissed'].includes(String(data.status))
              ? data.status
              : 'open') as 'open' | 'resolved' | 'dismissed',
            createdAtMs: tsToMs(data.createdAt),
            updatedAtMs: tsToMs(data.updatedAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function updateContentReportStatus(
  reportId: string,
  status: 'open' | 'resolved' | 'dismissed'
): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteContentReport(reportId: string): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await deleteDoc(doc(db, 'reports', reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
