import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, HardDriveDownload, Trash2 } from 'lucide-react';
import { MangaCover } from '../components/MangaCover';
import {
  clearAllOfflineChapters,
  deleteOfflineChapter,
  deleteOfflineSeries,
  formatBytes,
  getOfflineStorageStats,
} from '../services/offlineDb';
import { OfflineChapterRecord, ViewRoute } from '../types';
import { formatRelativeTime } from '../utils/time';

interface DownloadsViewProps {
  offlineChapters: OfflineChapterRecord[];
  onRefreshOffline: () => Promise<void>;
  onNavigate: (next: ViewRoute) => void;
  onToast: (msg: string) => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  offlineChapters,
  onRefreshOffline,
  onNavigate,
  onToast,
}) => {
  const [stats, setStats] = useState({
    chaptersBytes: 0,
    browserUsageBytes: 0,
    browserQuotaBytes: 1024 * 1024 * 1024,
  });
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    getOfflineStorageStats(offlineChapters).then(setStats);
  }, [offlineChapters]);

  const groupedBySeries = useMemo(() => {
    const map: Record<
      string,
      {
        seriesId: string;
        seriesTitle: string;
        seriesCoverUrl: string;
        seriesType: string;
        totalBytes: number;
        chapters: OfflineChapterRecord[];
      }
    > = {};

    for (const rec of offlineChapters) {
      if (!map[rec.seriesId]) {
        map[rec.seriesId] = {
          seriesId: rec.seriesId,
          seriesTitle: rec.seriesTitle,
          seriesCoverUrl: rec.seriesCoverUrl,
          seriesType: rec.seriesType,
          totalBytes: 0,
          chapters: [],
        };
      }
      map[rec.seriesId].totalBytes += rec.sizeBytes;
      map[rec.seriesId].chapters.push(rec);
    }

    Object.values(map).forEach((group) =>
      group.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)
    );
    return Object.values(map);
  }, [offlineChapters]);

  const usagePercent = Math.min(
    100,
    Math.max(
      offlineChapters.length > 0 ? 1.5 : 0,
      (stats.browserUsageBytes / Math.max(1, stats.browserQuotaBytes)) * 100
    )
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
            Offline Download Manager
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Chapters stored locally inside your browser’s IndexedDB vault for zero-network reading.
          </p>
        </div>

        {offlineChapters.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClearAll ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await clearAllOfflineChapters();
                    await onRefreshOffline();
                    setConfirmClearAll(false);
                    onToast('All local offline downloads deleted.');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                >
                  Confirm Delete All
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-medium"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="px-4 py-2 rounded-xl bg-[#131822] hover:bg-red-500/15 border border-slate-800 hover:border-red-500/40 text-xs font-medium text-slate-300 hover:text-red-300 inline-flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Free All Device Space
              </button>
            )}
          </div>
        )}
      </div>

      {/* Storage Occupancy Card */}
      <div className="bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <HardDriveDownload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Local IndexedDB Storage Consumption
              </p>
              <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                {offlineChapters.length} downloaded chapter{offlineChapters.length === 1 ? '' : 's'} across{' '}
                {groupedBySeries.length} series
              </p>
            </div>
          </div>

          <div className="text-right font-mono tabular-nums">
            <p className="text-sm font-semibold text-slate-100">
              {formatBytes(stats.chaptersBytes)} offline chapters
            </p>
            <p className="text-xs text-slate-400">
              {formatBytes(stats.browserUsageBytes)} used of {formatBytes(stats.browserQuotaBytes)} quota
            </p>
          </div>
        </div>

        <div className="w-full h-2.5 rounded-full bg-[#0B0E14] overflow-hidden border border-slate-800">
          <div
            style={{ width: `${usagePercent}%` }}
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
          />
        </div>
      </div>

      {/* Downloaded Series & Chapters List */}
      {groupedBySeries.length === 0 ? (
        <div className="bg-[#131822] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <p className="text-base font-semibold text-slate-200">
            No offline chapters saved on this device
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click the Download button on any series page or inside the manga reader toolbar to cache chapters locally into IndexedDB.
          </p>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'directory' })}
            className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            Explore Series to Download
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedBySeries.map((group) => (
            <div
              key={group.seriesId}
              className="bg-[#131822] border border-slate-800/80 rounded-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <MangaCover
                    src={group.seriesCoverUrl}
                    title={group.seriesTitle}
                    className="w-14 h-20 rounded-lg shrink-0"
                  />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onNavigate({ name: 'series', seriesId: group.seriesId })}
                      className="text-base font-bold text-slate-100 hover:text-blue-400 text-left truncate block"
                    >
                      {group.seriesTitle}
                    </button>
                    <p className="text-xs text-slate-400 font-mono tabular-nums mt-1">
                      {group.seriesType} · {group.chapters.length} chapter
                      {group.chapters.length === 1 ? '' : 's'} · {formatBytes(group.totalBytes)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await deleteOfflineSeries(group.seriesId);
                    await onRefreshOffline();
                    onToast(`Deleted offline downloads for ${group.seriesTitle}.`);
                  }}
                  className="self-start sm:self-center px-3 py-1.5 rounded-lg bg-[#0B0E14] hover:bg-red-500/15 border border-slate-800 hover:border-red-500/40 text-xs text-slate-300 hover:text-red-300 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Series Downloads
                </button>
              </div>

              <div className="divide-y divide-slate-800/70">
                {group.chapters.map((ch) => (
                  <div
                    key={ch.chapterId}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-800/35 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate tabular-nums">
                        Chapter {ch.chapterNumber}
                        {ch.chapterTitle ? ` — ${ch.chapterTitle}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {ch.pages.length} pages · {formatBytes(ch.sizeBytes)} · Saved{' '}
                        {formatRelativeTime(ch.downloadedAtMs)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate({
                            name: 'reader',
                            seriesId: ch.seriesId,
                            chapterId: ch.chapterId,
                          })
                        }
                        className="min-h-[38px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Read Offline
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          await deleteOfflineChapter(ch.chapterId);
                          await onRefreshOffline();
                          onToast(`Deleted Chapter ${ch.chapterNumber} from local storage.`);
                        }}
                        title="Delete offline chapter"
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-[#0B0E14] hover:bg-red-500/15 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
