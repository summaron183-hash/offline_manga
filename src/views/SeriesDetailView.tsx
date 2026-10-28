import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowDownUp,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  HardDrive,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Share2,
  Star,
} from 'lucide-react';
import { CommentSection } from '../components/CommentSection';
import { MangaCover } from '../components/MangaCover';
import { ResetProgressModal } from '../components/ResetProgressModal';
import { useSiteSettings } from '../context/SiteSettingsContext';
import {
  fetchChapterPagesCloud,
  fetchUserSeriesRating,
  incrementSeriesViewCount,
  submitCloudSeriesRating,
  subscribeSeriesChapters,
} from '../services/cloudService';
import { deleteOfflineChapter, saveOfflineChapter } from '../services/offlineDb';
import {
  Chapter,
  OfflineChapterRecord,
  ReadingHistoryItem,
  Series,
  UserModerationRecord,
  UserProfile,
  ViewRoute,
} from '../types';
import { formatCompactViews, formatRelativeTime } from '../utils/time';

interface SeriesDetailViewProps {
  series: Series;
  user: User | null;
  userProfile: UserProfile | null;
  userModeration: UserModerationRecord | null;
  isStaffUser: boolean;
  isBookmarked: boolean;
  historyItem?: ReadingHistoryItem;
  offlineMap: Record<string, OfflineChapterRecord>;
  onRefreshOffline: () => Promise<void>;
  onToggleBookmark: (series: Series) => Promise<void>;
  onNavigate: (next: ViewRoute) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}

export const SeriesDetailView: React.FC<SeriesDetailViewProps> = ({
  series,
  user,
  userProfile,
  userModeration,
  isStaffUser,
  isBookmarked,
  historyItem,
  offlineMap,
  onRefreshOffline,
  onToggleBookmark,
  onNavigate,
  onOpenAuth,
  onToast,
}) => {
  const { settings, ui } = useSiteSettings();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterSearch, setChapterSearch] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Star rating state (20-chapter gate)
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoverStar, setHoverStar] = useState<number>(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  // Offline download states
  const [downloadingChapterIds, setDownloadingChapterIds] = useState<Record<string, boolean>>({});
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    incrementSeriesViewCount(series, user);
  }, [series.id]);

  useEffect(() => {
    const unsubCh = subscribeSeriesChapters(series.id, setChapters);
    return () => unsubCh();
  }, [series.id]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setUserRating(null);
      return;
    }
    fetchUserSeriesRating(series.id, user.uid).then((score) => {
      if (active) setUserRating(score);
    });
    return () => {
      active = false;
    };
  }, [series.id, user]);

  const orderedAsc = useMemo(
    () => [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber),
    [chapters]
  );

  const firstChapter = orderedAsc[0];
  const latestChapter = orderedAsc[orderedAsc.length - 1];

  const readSet = useMemo(
    () => new Set(historyItem?.readChapterIds || []),
    [historyItem]
  );
  const readCount = historyItem?.readChapterIds?.length || 0;

  const filteredChapters = useMemo(() => {
    const q = chapterSearch.trim().toLowerCase();
    const base = sortDesc ? [...orderedAsc].reverse() : orderedAsc;
    if (!q) return base;
    return base.filter(
      (ch) =>
        String(ch.chapterNumber).includes(q) ||
        ch.title.toLowerCase().includes(q) ||
        `chapter ${ch.chapterNumber}`.includes(q)
    );
  }, [orderedAsc, sortDesc, chapterSearch]);

  const allSeriesDownloaded = useMemo(() => {
    if (chapters.length === 0) return false;
    return chapters.every((ch) => Boolean(offlineMap[ch.id]));
  }, [chapters, offlineMap]);

  const handleRate = async (score: number) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!user.emailVerified) {
      onToast('Please continue with Google to rate series.');
      return;
    }
    if (readCount < 20) {
      onToast(
        `Read at least 20 chapters of ${series.title} before rating (${readCount}/20 chapters read).`
      );
      return;
    }
    setSubmittingRating(true);
    try {
      await submitCloudSeriesRating(user, series, score, readCount);
      setUserRating(score);
      onToast(`Rated ${series.title} ${score}/5 stars!`);
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Unable to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleDownloadSingleChapter = async (ch: Chapter) => {
    if (downloadingChapterIds[ch.id]) return;
    setDownloadingChapterIds((prev) => ({ ...prev, [ch.id]: true }));
    try {
      const pages = await fetchChapterPagesCloud(series, ch);
      await saveOfflineChapter({
        chapterId: ch.id,
        seriesId: series.id,
        seriesTitle: series.title,
        seriesCoverUrl: series.coverUrl,
        seriesType: series.type,
        chapterNumber: ch.chapterNumber,
        chapterTitle: ch.title,
        pages,
      });
      await onRefreshOffline();
      onToast(`Chapter ${ch.chapterNumber} saved to local Offline Vault.`);
    } catch {
      onToast(`Could not save Chapter ${ch.chapterNumber} offline.`);
    } finally {
      setDownloadingChapterIds((prev) => ({ ...prev, [ch.id]: false }));
    }
  };

  const handleRemoveSingleOffline = async (ch: Chapter) => {
    await deleteOfflineChapter(ch.id);
    await onRefreshOffline();
    onToast(`Removed Chapter ${ch.chapterNumber} from local storage.`);
  };

  const handleDownloadWholeSeries = async () => {
    if (chapters.length === 0 || batchProgress) return;
    const targets = orderedAsc.filter((ch) => !offlineMap[ch.id]);
    if (targets.length === 0) {
      onNavigate({ name: 'downloads' });
      return;
    }
    setBatchProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        const ch = targets[i];
        const pages = await fetchChapterPagesCloud(series, ch);
        await saveOfflineChapter({
          chapterId: ch.id,
          seriesId: series.id,
          seriesTitle: series.title,
          seriesCoverUrl: series.coverUrl,
          seriesType: series.type,
          chapterNumber: ch.chapterNumber,
          chapterTitle: ch.title,
          pages,
        });
        setBatchProgress({ done: i + 1, total: targets.length });
      }
      await onRefreshOffline();
      onToast(
        `Downloaded all ${targets.length} chapter(s) of ${series.title} for offline reading!`
      );
    } catch {
      onToast('Interrupted while downloading series offline.');
    } finally {
      setBatchProgress(null);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?series=${encodeURIComponent(
      series.id
    )}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${series.title} — ${settings.siteName || 'MGeko'}`,
          text: `Read ${series.title} on ${settings.siteName || 'MGeko'}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast('Series share link copied to clipboard!');
    } catch {
      onToast(`Share URL: ${shareUrl}`);
    }
  };

  return (
    <div className="pb-16">
      {/* Dynamic Blurred Cover Banner */}
      <section className="relative overflow-hidden border-b border-slate-800/80 bg-[#0B0E14]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {series.coverUrl && (
            <img
              src={series.heroBackdropUrl || series.coverUrl}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-110 blur-2xl opacity-25 select-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] via-[#0B0E14]/85 to-[#0B0E14]/55" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-slate-400 mb-6">
            <button
              type="button"
              onClick={() => onNavigate({ name: 'home' })}
              className="hover:text-slate-200 transition-colors"
            >
              {ui('nav_home', 'Home')}
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'directory', initialType: series.type })}
              className="hover:text-slate-200 transition-colors"
            >
              {series.type}
            </button>
            <span>/</span>
            <span className="text-slate-200 truncate max-w-[240px] sm:max-w-md">
              {series.title}
            </span>
          </nav>

          <div className="flex flex-col md:flex-row gap-7 lg:gap-10 items-start">
            {/* Poster Artwork */}
            <div className="w-44 sm:w-56 md:w-60 shrink-0 mx-auto md:mx-0">
              <div className="aspect-[3/4] rounded-xl overflow-hidden border border-slate-700/70 shadow-2xl bg-[#131822]">
                <MangaCover src={series.coverUrl} title={series.title} className="w-full h-full" />
              </div>
            </div>

            {/* Metadata & Actions */}
            <div className="flex-1 min-w-0 w-full">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-blue-400 mb-2">
                <span>{series.type}</span>
                <span className="text-slate-600">·</span>
                <span
                  className={
                    series.status === 'Ongoing' ? 'text-emerald-400' : 'text-slate-300'
                  }
                >
                  {series.status}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-300 font-mono tabular-nums">{series.releaseYear}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400 font-mono tabular-nums">
                  {formatCompactViews(series.views)} views
                </span>
              </div>

              <h1 className="font-display text-2xl sm:text-4xl font-bold text-slate-50 tracking-tight leading-tight">
                {series.title}
              </h1>

              {series.altTitles.length > 0 && (
                <p className="mt-1.5 text-xs sm:text-sm text-slate-400 line-clamp-1">
                  Alt: {series.altTitles.join(' / ')}
                </p>
              )}

              {/* Author / Artist / 20-Chapter Gated Star Rating Bar */}
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs sm:text-sm text-slate-300 border-y border-slate-800/80 py-3">
                <div>
                  <span className="text-slate-500 mr-1.5">Author:</span>
                  <span className="font-medium text-slate-200">{series.author}</span>
                </div>
                <div>
                  <span className="text-slate-500 mr-1.5">Artist:</span>
                  <span className="font-medium text-slate-200">{series.artist}</span>
                </div>

                {/* Interactive Cloud 1-5 Star Rating (Requires >= 20 read chapters) */}
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center gap-0.5"
                    onMouseLeave={() => setHoverStar(0)}
                  >
                    {[1, 2, 3, 4, 5].map((star) => {
                      const activeScore = hoverStar || userRating || Math.round(series.ratingAvg);
                      const filled = star <= activeScore;
                      return (
                        <button
                          key={star}
                          type="button"
                          disabled={submittingRating}
                          onMouseEnter={() => setHoverStar(star)}
                          onClick={() => handleRate(star)}
                          title={
                            readCount < 20
                              ? `Read 20 chapters to unlock rating (${readCount}/20 read)`
                              : `Rate ${star} star${star > 1 ? 's' : ''}`
                          }
                          className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              filled ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="font-mono tabular-nums font-semibold text-amber-400">
                    {series.ratingAvg > 0 ? series.ratingAvg.toFixed(2) : '5.00'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    ({series.ratingCount})
                  </span>
                  {userRating ? (
                    <span className="text-[11px] text-blue-400 font-medium">
                      Your rating: ★{userRating}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {readCount >= 20
                        ? 'Click stars to rate'
                        : `${readCount}/20 chs read to rate`}
                    </span>
                  )}
                </div>
              </div>

              {/* Interactive Genre Filter Links */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {series.genres.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => onNavigate({ name: 'directory', initialGenre: genre })}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#131822] hover:bg-slate-800 text-slate-300 hover:text-blue-400 border border-slate-800 transition-colors"
                  >
                    {genre}
                  </button>
                ))}
              </div>

              {/* Primary Action Toolbar */}
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                {firstChapter && (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate({
                        name: 'reader',
                        seriesId: series.id,
                        chapterId: firstChapter.id,
                      })
                    }
                    className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap transition-colors shadow-lg shadow-blue-600/20"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>Read First (Ch. {firstChapter.chapterNumber})</span>
                  </button>
                )}

                {latestChapter && latestChapter.id !== firstChapter?.id && (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate({
                        name: 'reader',
                        seriesId: series.id,
                        chapterId: latestChapter.id,
                      })
                    }
                    className="h-10 px-4 rounded-lg bg-[#1A2230] hover:bg-slate-700/80 text-slate-100 border border-slate-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap transition-colors"
                  >
                    <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Read Latest (Ch. {latestChapter.chapterNumber})</span>
                  </button>
                )}

                {historyItem && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          name: 'reader',
                          seriesId: series.id,
                          chapterId: historyItem.lastChapterId,
                        })
                      }
                      className="h-10 px-3.5 rounded-lg bg-slate-800/90 hover:bg-slate-800 text-blue-300 border border-blue-500/30 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                    >
                      <span>Resume Ch. {historyItem.lastChapterNum}</span>
                    </button>

                    {user && (
                      <button
                        type="button"
                        onClick={() => setResetModalOpen(true)}
                        title="Reset progress to Ch. 1, Ch. 2, or any chapter to re-read"
                        className="h-10 px-3.5 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>Reset / Re-Read</span>
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => onToggleBookmark(series)}
                  className={`h-10 px-3.5 rounded-lg border text-xs sm:text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                    isBookmarked
                      ? 'bg-blue-600/15 border-blue-500/50 text-blue-300 hover:bg-blue-600/25'
                      : 'bg-[#131822] border-slate-800 text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <Bookmark
                    className={`w-4 h-4 shrink-0 ${
                      isBookmarked ? 'fill-blue-400 text-blue-400' : ''
                    }`}
                  />
                  <span>{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                </button>

                <button
                  type="button"
                  disabled={Boolean(batchProgress) || chapters.length === 0}
                  onClick={handleDownloadWholeSeries}
                  className={`h-10 px-3.5 rounded-lg border text-xs sm:text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors disabled:opacity-60 ${
                    allSeriesDownloaded
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                      : 'bg-[#131822] border-slate-800 text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {batchProgress ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                      <span className="font-mono tabular-nums">
                        Saving {batchProgress.done}/{batchProgress.total}
                      </span>
                    </>
                  ) : allSeriesDownloaded ? (
                    <>
                      <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Saved Offline</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 text-slate-300 shrink-0" />
                      <span>Download Series</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="h-10 px-3 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  title="Share series link"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>Share</span>
                </button>
              </div>

              {/* Expandable Synopsis Box */}
              <div className="mt-6 bg-[#131822]/90 border border-slate-800/90 rounded-xl p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  {ui('series_synopsis_title', 'Synopsis')}
                </h2>
                <p
                  className={`text-sm text-slate-300 leading-relaxed max-w-[75ch] ${
                    synopsisExpanded ? '' : 'line-clamp-3'
                  }`}
                >
                  {series.synopsis}
                </p>
                {series.synopsis.length > 210 && (
                  <button
                    type="button"
                    onClick={() => setSynopsisExpanded((v) => !v)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {synopsisExpanded ? (
                      <>
                        <span>Collapse</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Show Full Synopsis</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid: Chapter List + Upgraded Rich Cloud Comments */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Searchable & Sortable Chapter Table (7 cols) */}
        <section className="lg:col-span-7 bg-[#131822] border border-slate-800/90 rounded-xl overflow-hidden flex flex-col self-start">
          <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-lg font-bold text-slate-100">
                {ui('series_chapters_title', 'Chapters')}
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                ({chapters.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Filter chapter..."
                  className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setSortDesc((v) => !v)}
                className="h-9 px-3 rounded-lg bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-blue-400" />
                <span>{sortDesc ? 'Newest' : 'Oldest'}</span>
              </button>
            </div>
          </div>

          {filteredChapters.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              {chapters.length === 0
                ? 'No chapters published for this series yet.'
                : `No chapters matching "${chapterSearch}".`}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70 max-h-[680px] overflow-y-auto">
              {filteredChapters.map((ch) => {
                const isRead = readSet.has(ch.id);
                const isLastRead = historyItem?.lastChapterId === ch.id;
                const offlineRec = offlineMap[ch.id];
                const isDownloading = Boolean(downloadingChapterIds[ch.id]);

                return (
                  <div
                    key={ch.id}
                    className={`flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-slate-800/40 transition-colors ${
                      isLastRead ? 'bg-blue-600/5' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          name: 'reader',
                          seriesId: series.id,
                          chapterId: ch.id,
                        })
                      }
                      className="flex-1 min-w-0 text-left flex items-center gap-3 group"
                    >
                      {isRead ? (
                        <CheckCircle2
                          className="w-4 h-4 text-emerald-400 shrink-0"
                          aria-label="Chapter read"
                        />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-slate-700 shrink-0 group-hover:border-blue-400 transition-colors" />
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-semibold font-mono tabular-nums group-hover:text-blue-400 transition-colors ${
                              isRead ? 'text-slate-400' : 'text-slate-100'
                            }`}
                          >
                            Chapter {ch.chapterNumber}
                          </span>
                          {ch.title && (
                            <span
                              className={`text-xs truncate ${
                                isRead ? 'text-slate-500' : 'text-slate-300'
                              }`}
                            >
                              — {ch.title}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums">
                          <span>{formatRelativeTime(ch.createdAtMs)}</span>
                          <span>·</span>
                          <span>{ch.pageCount} pages</span>
                          {offlineRec && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-400 font-sans font-medium">
                                Offline Ready
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {offlineRec ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveSingleOffline(ch)}
                          title="Saved offline — click to free local space"
                          className="h-8 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-red-500/15 border border-emerald-500/30 hover:border-red-500/40 text-emerald-300 hover:text-red-300 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Offline</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isDownloading}
                          onClick={() => handleDownloadSingleChapter(ch)}
                          title="Download chapter to device IndexedDB for offline reading"
                          className="h-8 px-2.5 rounded-lg bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-blue-400 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {isDownloading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Save</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Global Real-Time Cloud Comments (5 cols) */}
        <section className="lg:col-span-5 self-start">
          <CommentSection
            series={series}
            title={ui('series_comments_title', 'Cloud Comments')}
            user={user}
            userProfile={userProfile}
            userModeration={userModeration}
            isStaffUser={isStaffUser}
            onNavigate={onNavigate}
            onOpenAuth={onOpenAuth}
            onToast={onToast}
          />
        </section>
      </div>

      {resetModalOpen && user && (
        <ResetProgressModal
          series={series}
          currentHistory={historyItem}
          user={user}
          onClose={() => setResetModalOpen(false)}
          onToast={onToast}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
};
