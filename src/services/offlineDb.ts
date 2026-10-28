import { OfflineChapterRecord } from '../types';

/**
 * LOCAL BROWSER STORAGE (IndexedDB)
 * Reserved EXCLUSIVELY for the MGeko Offline Chapter Downloader.
 */
const DB_NAME = 'mgeko_offline_vault';
const DB_VERSION = 1;
const STORE_CHAPTERS = 'offline_chapters';

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
        const store = db.createObjectStore(STORE_CHAPTERS, { keyPath: 'chapterId' });
        store.createIndex('by_series', 'seriesId', { unique: false });
        store.createIndex('by_downloadedAt', 'downloadedAtMs', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Converts an external or asset URL into a self-contained data URI so downloaded
 * chapters render with zero network connectivity.
 */
export async function toSelfContainedImage(src: string): Promise<string> {
  if (src.startsWith('data:')) {
    return src;
  }
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
}

export async function saveOfflineChapter(
  record: Omit<OfflineChapterRecord, 'sizeBytes' | 'downloadedAtMs'>,
  onPageProgress?: (done: number, total: number) => void
): Promise<OfflineChapterRecord> {
  const convertedPages: string[] = [];
  for (let i = 0; i < record.pages.length; i++) {
    const dataUri = await toSelfContainedImage(record.pages[i]);
    convertedPages.push(dataUri);
    onPageProgress?.(i + 1, record.pages.length);
  }
  const selfContainedCover = await toSelfContainedImage(record.seriesCoverUrl);
  const byteEstimate =
    convertedPages.reduce((sum, p) => sum + p.length, 0) + selfContainedCover.length + 512;

  const fullRecord: OfflineChapterRecord = {
    ...record,
    seriesCoverUrl: selfContainedCover,
    pages: convertedPages,
    sizeBytes: byteEstimate,
    downloadedAtMs: Date.now(),
  };

  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
    tx.objectStore(STORE_CHAPTERS).put(fullRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return fullRecord;
}

export async function getOfflineChapter(chapterId: string): Promise<OfflineChapterRecord | null> {
  const db = await openVault();
  const result = await new Promise<OfflineChapterRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAPTERS, 'readonly');
    const req = tx.objectStore(STORE_CHAPTERS).get(chapterId);
    req.onsuccess = () => resolve((req.result as OfflineChapterRecord) || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function listOfflineChapters(): Promise<OfflineChapterRecord[]> {
  const db = await openVault();
  const items = await new Promise<OfflineChapterRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAPTERS, 'readonly');
    const req = tx.objectStore(STORE_CHAPTERS).getAll();
    req.onsuccess = () => resolve((req.result as OfflineChapterRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => b.downloadedAtMs - a.downloadedAtMs);
}

export async function deleteOfflineChapter(chapterId: string): Promise<void> {
  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
    tx.objectStore(STORE_CHAPTERS).delete(chapterId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function deleteOfflineSeries(seriesId: string): Promise<void> {
  const all = await listOfflineChapters();
  const matching = all.filter((item) => item.seriesId === seriesId);
  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
    const store = tx.objectStore(STORE_CHAPTERS);
    for (const ch of matching) {
      store.delete(ch.chapterId);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearAllOfflineChapters(): Promise<void> {
  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
    tx.objectStore(STORE_CHAPTERS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getOfflineStorageStats(records: OfflineChapterRecord[]): Promise<{
  chaptersBytes: number;
  browserUsageBytes: number;
  browserQuotaBytes: number;
}> {
  const chaptersBytes = records.reduce((acc, item) => acc + item.sizeBytes, 0);
  let browserUsageBytes = chaptersBytes;
  let browserQuotaBytes = 1024 * 1024 * 1024; // 1 GB fallback
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (est.usage) browserUsageBytes = Math.max(est.usage, chaptersBytes);
      if (est.quota) browserQuotaBytes = est.quota;
    } catch {
      // Ignore quota estimation errors in restricted contexts
    }
  }
  return { chaptersBytes, browserUsageBytes, browserQuotaBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0.0 MB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
