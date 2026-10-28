import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { Bell, BookOpen, Bookmark, Check, Cloud, History, RotateCcw, Trash2 } from 'lucide-react';
import { MangaCover } from '../components/MangaCover';
import { ResetProgressModal } from '../components/ResetProgressModal';
import {
  clearAllCloudNotifications,
  clearAllReadingHistoryCloud,
  deleteCloudNotification,
  deleteSeriesReadingHistoryCloud,
  markAllCloudNotificationsRead,
  setCloudNotificationReadState,
} from '../services/cloudService';
import {
  BookmarkItem,
  NotificationItem,
  ReadingHistoryItem,
  Series,
  ViewRoute,
} from '../types';
import { formatRelativeTime } from '../utils/time';

interface LibraryViewProps {
  user: User | null;
  initialTab: 'bookmarks' | 'history' | 'notifications';
  bookmarks: BookmarkItem[];
  history: ReadingHistoryItem[];
  notifications: NotificationItem[];
  allSeries: Series[];
  onRemoveBookmark: (seriesId: string) => Promise<void>;
  onNavigate: (next: ViewRoute) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  user,
  initialTab,
  bookmarks,
  history,
  notifications,
  allSeries,
  onRemoveBookmark,
  onNavigate,
  onOpenAuth,
  onToast,
}) => {
  const [tab, setTab] = useState<'bookmarks' | 'history' | 'notifications'>(initialTab);
  const [resetTarget, setResetTarget] = useState<{
    series: Series;
    history?: ReadingHistoryItem;
  } | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmClearNotifs, setConfirmClearNotifs] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const filteredNotifs = useMemo(
    () => (notifFilter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications),
    [notifications, notifFilter]
  );

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto">
          <Cloud className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Multi-Device Cloud Library</h1>
        <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          Continue with Google to synchronize your saved manga bookmarks, reading progress, re-read controls, and chapter release alerts across every device.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
        >
          Continue with Google
        </button>
      </div>
    );
  }

  const openResetModal = (item: ReadingHistoryItem) => {
    const found =
      allSeries.find((s) => s.id === item.seriesId) ||
      ({
        id: item.seriesId,
        visibility: 'public',
        title: item.seriesTitle,
        altTitles: [],
        synopsis: '',
        author: '',
        artist: '',
        coverUrl: item.coverUrl,
        status: 'Ongoing',
        type: 'Manhwa',
        releaseYear: 2025,
        genres: ['Action'],
        views: 1,
        ratingSum: 5,
        ratingCount: 1,
        ratingAvg: 5,
        latestChapterNum: item.lastChapterNum,
        latestChapterTitle: item.lastChapterTitle,
        chapterCount: Math.max(22, item.lastChapterNum),
        isFeatured: false,
        createdBy: '',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      } as Series);
    setResetTarget({ series: found, history: item });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">My Cloud Library</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage bookmarks, reset reading progress for re-reads, and organize chapter notifications
          </p>
        </div>

        <div className="flex flex-wrap items-center p-1 bg-[#131822] border border-slate-800 rounded-xl self-start gap-1">
          <button
            type="button"
            onClick={() => setTab('bookmarks')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              tab === 'bookmarks'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span className="tabular-nums">Bookmarks ({bookmarks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              tab === 'history'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="tabular-nums">Reading History ({history.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              tab === 'notifications'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="tabular-nums">Notifications ({notifications.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: BOOKMARKS */}
      {tab === 'bookmarks' &&
        (bookmarks.length === 0 ? (
          <div className="bg-[#131822] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <p className="text-base font-semibold text-slate-200">No bookmarked series yet</p>
            <p className="text-xs text-slate-400">
              Open any manga series and click Bookmark to save it here and receive new chapter alerts.
            </p>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'directory' })}
              className="mt-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
            >
              Browse Manga Directory
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {bookmarks.map((bm) => {
              const liveSeries = allSeries.find((s) => s.id === bm.seriesId);
              const latestCh = liveSeries ? liveSeries.latestChapterNum : bm.latestChapterNum;
              return (
                <div key={bm.seriesId} className="group space-y-2.5">
                  <div
                    onClick={() => onNavigate({ name: 'series', seriesId: bm.seriesId })}
                    className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#131822] border border-slate-800 cursor-pointer"
                  >
                    <MangaCover
                      src={liveSeries?.coverUrl || bm.coverUrl}
                      title={bm.seriesTitle}
                      className="w-full h-full transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div
                      onClick={() => onNavigate({ name: 'series', seriesId: bm.seriesId })}
                      className="min-w-0 cursor-pointer"
                    >
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-blue-400 truncate">
                        {bm.seriesTitle}
                      </h3>
                      <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                        {bm.type} · Latest Ch. {latestCh}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveBookmark(bm.seriesId)}
                      title="Remove bookmark"
                      className="p-1.5 text-slate-500 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {/* TAB 2: READING HISTORY & RE-READ PROGRESS RESET */}
      {tab === 'history' && (
        <div className="space-y-4">
          {history.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Want to re-read from Chapter 1, Chapter 2, or any point? Click{' '}
                <strong className="text-slate-200">Reset / Re-Read</strong> on any series below.
              </p>
              {confirmClearHistory ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await clearAllReadingHistoryCloud(user.uid, history);
                      setConfirmClearHistory(false);
                      onToast('Cleared all reading history.');
                    }}
                    className="h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold"
                  >
                    Confirm Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearHistory(false)}
                    className="h-8 px-2.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearHistory(true)}
                  className="h-8 px-3 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-xs text-red-400 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All History</span>
                </button>
              )}
            </div>
          )}

          {history.length === 0 ? (
            <div className="bg-[#131822] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <p className="text-base font-semibold text-slate-200">
                Your reading history is empty
              </p>
              <p className="text-xs text-slate-400">
                Chapters you open are automatically synced here so you can pick up right where you left off.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70 bg-[#131822] border border-slate-800 rounded-2xl overflow-hidden">
              {history.map((item) => (
                <div
                  key={item.seriesId}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/35 transition-colors"
                >
                  <div
                    onClick={() => onNavigate({ name: 'series', seriesId: item.seriesId })}
                    className="flex items-center gap-4 min-w-0 cursor-pointer"
                  >
                    <MangaCover
                      src={item.coverUrl}
                      title={item.seriesTitle}
                      className="w-14 h-20 rounded-lg shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm sm:text-base font-semibold text-slate-100 hover:text-blue-400 truncate">
                        {item.seriesTitle}
                      </h3>
                      <p className="text-xs text-slate-300 font-mono tabular-nums">
                        Last read: Chapter {item.lastChapterNum}
                        {item.lastChapterTitle ? ` — ${item.lastChapterTitle}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {item.readChapterIds.length} chapters read ·{' '}
                        {formatRelativeTime(item.updatedAtMs)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          name: 'reader',
                          seriesId: item.seriesId,
                          chapterId: item.lastChapterId,
                        })
                      }
                      className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Resume Ch. {item.lastChapterNum}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openResetModal(item)}
                      className="h-9 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                      <span>Reset / Re-Read</span>
                    </button>

                    <button
                      type="button"
                      title="Delete from reading history"
                      onClick={async () => {
                        await deleteSeriesReadingHistoryCloud(user.uid, item.seriesId);
                        onToast(`Removed ${item.seriesTitle} from history.`);
                      }}
                      className="h-9 w-9 rounded-xl bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NOTIFICATIONS MANAGER */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotifFilter('all')}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  notifFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#131822] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setNotifFilter('unread')}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  notifFilter === 'unread'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#131822] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Unread ({notifications.filter((n) => !n.isRead).length})
              </button>
            </div>

            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => markAllCloudNotificationsRead(user.uid, notifications)}
                  className="h-8 px-3 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 text-blue-400" />
                  <span>Mark All Read</span>
                </button>

                {confirmClearNotifs ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        await clearAllCloudNotifications(user.uid, notifications);
                        setConfirmClearNotifs(false);
                        onToast('Cleared all notifications.');
                      }}
                      className="h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold"
                    >
                      Confirm Clear All
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearNotifs(false)}
                      className="h-8 px-2 text-xs text-slate-400"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearNotifs(true)}
                    className="h-8 px-3 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-xs text-red-400 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {filteredNotifs.length === 0 ? (
            <div className="bg-[#131822] border border-slate-800 rounded-2xl p-12 text-center space-y-2">
              <p className="text-base font-semibold text-slate-200">No notifications found</p>
              <p className="text-xs text-slate-400">
                New chapter alerts for your bookmarked series appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70 bg-[#131822] border border-slate-800 rounded-2xl overflow-hidden">
              {filteredNotifs.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    n.isRead ? 'opacity-75' : 'bg-blue-600/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      if (!n.isRead) {
                        await setCloudNotificationReadState(user.uid, n.id, true);
                      }
                      onNavigate({
                        name: 'reader',
                        seriesId: n.seriesId,
                        chapterId: n.chapterId,
                      });
                    }}
                    className="text-left min-w-0 flex-1"
                  >
                    <p className="text-sm font-medium text-slate-100">{n.message}</p>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {formatRelativeTime(n.createdAtMs)}
                      {!n.isRead ? ' · Unread' : ''}
                    </p>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setCloudNotificationReadState(user.uid, n.id, !n.isRead)
                      }
                      className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 whitespace-nowrap transition-colors"
                    >
                      {n.isRead ? 'Mark Unread' : 'Mark Read'}
                    </button>
                    <button
                      type="button"
                      title="Delete notification"
                      onClick={() => deleteCloudNotification(user.uid, n.id)}
                      className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {resetTarget && (
        <ResetProgressModal
          series={resetTarget.series}
          currentHistory={resetTarget.history}
          user={user}
          onClose={() => setResetTarget(null)}
          onToast={onToast}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
};
