import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Home,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CommentSection } from '../components/CommentSection';
import { useSiteSettings } from '../context/SiteSettingsContext';
import {
  fetchChapterPagesCloud,
  recordCloudReadingProgress,
  submitContentReport,
  subscribeSeriesChapters,
} from '../services/cloudService';
import { getOfflineChapter, saveOfflineChapter } from '../services/offlineDb';
import {
  Chapter,
  OfflineChapterRecord,
  ReadingHistoryItem,
  Series,
  UserModerationRecord,
  UserProfile,
  ViewRoute,
} from '../types';

interface ReaderViewProps {
  series: Series | undefined;
  chapterId: string;
  user: User | null;
  userProfile: UserProfile | null;
  userModeration: UserModerationRecord | null;
  isStaffUser: boolean;
  historyItem?: ReadingHistoryItem;
  offlineMap: Record<string, OfflineChapterRecord>;
  onRefreshOffline: () => Promise<void>;
  onNavigate: (next: ViewRoute) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}

const CHAPTER_REPORT_REASONS = [
  'Missing page(s)',
  'Broken or corrupted image',
  'Pages out of order',
  'Wrong chapter uploaded',
  'Translation / quality issue',
  'Other chapter issue',
];

export const ReaderView: React.FC<ReaderViewProps> = ({
  series,
  chapterId,
  user,
  userProfile,
  userModeration,
  isStaffUser,
  historyItem,
  offlineMap,
  onRefreshOffline,
  onNavigate,
  onOpenAuth,
  onToast,
}) => {
  const { settings, ui } = useSiteSettings();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedFromOffline, setLoadedFromOffline] = useState(false);
  const [offlineRecord, setOfflineRecord] = useState<OfflineChapterRecord | null>(null);

  const [readingMode, setReadingMode] = useState<'webtoon' | 'single'>(
    userProfile?.readingModePref || 'webtoon'
  );
  const [fitMode, setFitMode] = useState<'width' | 'height' | 'custom'>('width');
  const [zoomScale, setZoomScale] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Chapter End Report State
  const [reportChapterOpen, setReportChapterOpen] = useState(false);
  const [chapterReportReason, setChapterReportReason] = useState(CHAPTER_REPORT_REASONS[0]);
  const [chapterReportDetails, setChapterReportDetails] = useState('');
  const [submittingChapterReport, setSubmittingChapterReport] = useState(false);

  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);

  useEffect(() => {
    if (userProfile?.readingModePref) {
      setReadingMode(userProfile.readingModePref);
    }
  }, [userProfile?.readingModePref]);

  useEffect(() => {
    if (!series) return;
    const unsub = subscribeSeriesChapters(series.id, setChapters);
    return () => unsub();
  }, [series?.id]);

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber),
    [chapters]
  );

  const activeChapter = useMemo(() => {
    const found = sortedChapters.find((c) => c.id === chapterId);
    if (found) return found;
    if (offlineRecord) {
      return {
        id: offlineRecord.chapterId,
        seriesId: offlineRecord.seriesId,
        visibility: 'public' as const,
        chapterNumber: offlineRecord.chapterNumber,
        title: offlineRecord.chapterTitle,
        pageCount: offlineRecord.pages.length,
        createdBy: '',
        createdAtMs: offlineRecord.downloadedAtMs,
        updatedAtMs: offlineRecord.downloadedAtMs,
      };
    }
    return undefined;
  }, [sortedChapters, chapterId, offlineRecord]);

  const currentIdx = useMemo(
    () => sortedChapters.findIndex((c) => c.id === chapterId),
    [sortedChapters, chapterId]
  );
  const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : undefined;
  const nextChapter =
    currentIdx >= 0 && currentIdx < sortedChapters.length - 1
      ? sortedChapters[currentIdx + 1]
      : undefined;

  useEffect(() => {
    let cancelled = false;
    async function loadPages() {
      setLoading(true);
      setCurrentPage(0);
      setReportChapterOpen(false);
      window.scrollTo({ top: 0 });

      const localCopy = await getOfflineChapter(chapterId);
      if (cancelled) return;
      if (localCopy && localCopy.pages.length > 0) {
        setOfflineRecord(localCopy);
        setPages(localCopy.pages);
        setLoadedFromOffline(true);
        setLoading(false);
        return;
      }

      setLoadedFromOffline(false);
      if (series && activeChapter) {
        const cloudPages = await fetchChapterPagesCloud(series, activeChapter);
        if (!cancelled) {
          setPages(cloudPages);
          setLoading(false);
        }
      } else if (series && sortedChapters.length > 0) {
        setLoading(false);
      }
    }
    loadPages();
    return () => {
      cancelled = true;
    };
  }, [chapterId, series?.id, activeChapter?.id]);

  // Sync reading progress to Cloud Firestore when chapter opens
  useEffect(() => {
    if (!user || !series || !activeChapter || pages.length === 0) return;
    recordCloudReadingProgress(user, series, activeChapter, currentPage, historyItem);
  }, [user?.uid, series?.id, activeChapter?.id]);

  // Track visible page index during Webtoon vertical scroll
  useEffect(() => {
    if (readingMode !== 'webtoon' || pages.length === 0) return;
    const onScroll = () => {
      const mid = window.innerHeight * 0.45;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= mid && rect.bottom >= mid) {
          setCurrentPage(i);
          break;
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [readingMode, pages.length]);

  const goPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
      window.scrollTo({ top: 0 });
    } else if (prevChapter && series) {
      onNavigate({ name: 'reader', seriesId: series.id, chapterId: prevChapter.id });
    }
  }, [currentPage, prevChapter, series, onNavigate]);

  const goNextPage = useCallback(() => {
    if (currentPage < pages.length - 1) {
      setCurrentPage((p) => p + 1);
      window.scrollTo({ top: 0 });
    } else if (nextChapter && series) {
      onNavigate({ name: 'reader', seriesId: series.id, chapterId: nextChapter.id });
    }
  }, [currentPage, pages.length, nextChapter, series, onNavigate]);

  // Keyboard navigation in Single Page Mode (ignore when typing in comment/report inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (readingMode === 'single') {
        if (e.key === 'ArrowLeft') goPrevPage();
        if (e.key === 'ArrowRight') goNextPage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readingMode, goPrevPage, goNextPage]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen restricted in some sandboxed contexts
    }
  };

  const handleSaveOfflineFromToolbar = async () => {
    if (!activeChapter || pages.length === 0 || downloading) return;
    const sId = series?.id || offlineRecord?.seriesId || 'offline';
    const sTitle = series?.title || offlineRecord?.seriesTitle || 'Saved Manga';
    const sCover = series?.coverUrl || offlineRecord?.seriesCoverUrl || '';
    const sType = series?.type || offlineRecord?.seriesType || 'Manhwa';

    setDownloading(true);
    try {
      await saveOfflineChapter({
        chapterId: activeChapter.id,
        seriesId: sId,
        seriesTitle: sTitle,
        seriesCoverUrl: sCover,
        seriesType: sType,
        chapterNumber: activeChapter.chapterNumber,
        chapterTitle: activeChapter.title,
        pages,
      });
      await onRefreshOffline();
      setLoadedFromOffline(true);
      onToast(`Chapter ${activeChapter.chapterNumber} saved offline to IndexedDB!`);
    } finally {
      setDownloading(false);
    }
  };

  const handleSubmitChapterReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!series || !activeChapter) return;
    setSubmittingChapterReport(true);
    try {
      await submitContentReport(user, {
        targetType: 'chapter',
        seriesId: series.id,
        seriesTitle: series.title,
        chapterId: activeChapter.id,
        chapterNumber: activeChapter.chapterNumber,
        reason: chapterReportReason,
        details: chapterReportDetails,
        reporterProfile: userProfile,
      });
      setReportChapterOpen(false);
      setChapterReportDetails('');
      onToast(
        `Report submitted for Chapter ${activeChapter.chapterNumber}. Staff will check missing/broken pages.`
      );
    } finally {
      setSubmittingChapterReport(false);
    }
  };

  const isSavedOffline = Boolean(offlineMap[chapterId] || loadedFromOffline);
  const displayTitle =
    series?.title || offlineRecord?.seriesTitle || `${settings.siteName || 'MGeko'} Reader`;

  const imageWidthClass =
    fitMode === 'height'
      ? 'max-h-[88vh] w-auto mx-auto'
      : fitMode === 'width'
      ? 'w-full max-w-3xl mx-auto'
      : 'mx-auto';

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100">
      {/* Sticky Top Reader Toolbar */}
      <div
        className={`sticky top-0 z-40 bg-[#0B0E14]/95 backdrop-blur-md border-b border-slate-800 transition-opacity duration-150 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left: Back to Series & Home */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() =>
                series
                  ? onNavigate({ name: 'series', seriesId: series.id })
                  : onNavigate({ name: 'downloads' })
              }
              className="min-h-[38px] px-2.5 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Series</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'home' })}
              aria-label="Home"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-slate-300 shrink-0"
            >
              <Home className="w-4 h-4" />
            </button>
            <div className="min-w-0 ml-1">
              <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                {displayTitle}
              </p>
              <p className="text-[11px] text-slate-400 truncate tabular-nums">
                {activeChapter ? `Chapter ${activeChapter.chapterNumber}` : 'Loading...'}
                {loadedFromOffline ? ' · Offline Vault' : ''}
              </p>
            </div>
          </div>

          {/* Center: Quick Chapter Selector & Prev/Next */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              type="button"
              disabled={!prevChapter || !series}
              onClick={() =>
                prevChapter &&
                series &&
                onNavigate({ name: 'reader', seriesId: series.id, chapterId: prevChapter.id })
              }
              className="min-h-[36px] px-2.5 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 disabled:opacity-40 inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>

            {sortedChapters.length > 0 && series && (
              <select
                aria-label="Select chapter"
                value={chapterId}
                onChange={(e) =>
                  onNavigate({
                    name: 'reader',
                    seriesId: series.id,
                    chapterId: e.target.value,
                  })
                }
                className="h-9 px-3 rounded-lg bg-[#131822] border border-slate-800 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {sortedChapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Ch. {c.chapterNumber}
                    {c.title ? ` - ${c.title.slice(0, 24)}` : ''}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              disabled={!nextChapter || !series}
              onClick={() =>
                nextChapter &&
                series &&
                onNavigate({ name: 'reader', seriesId: series.id, chapterId: nextChapter.id })
              }
              className="min-h-[36px] px-2.5 rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 disabled:opacity-40 inline-flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Mode Switcher, Zoom/Fit, Offline Download & Fullscreen */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center p-0.5 bg-[#131822] border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setReadingMode('webtoon')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  readingMode === 'webtoon'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Webtoon
              </button>
              <button
                type="button"
                onClick={() => setReadingMode('single')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  readingMode === 'single'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Paginated
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setFitMode('custom');
                setZoomScale((z) => Math.max(60, z - 15));
              }}
              aria-label="Zoom out"
              className="hidden sm:flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-slate-300"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setFitMode((m) => (m === 'width' ? 'height' : 'width'));
                setZoomScale(100);
              }}
              className="hidden lg:inline-flex min-h-[36px] px-2.5 items-center rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300 whitespace-nowrap"
            >
              {fitMode === 'height' ? 'Fit Height' : 'Fit Width'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFitMode('custom');
                setZoomScale((z) => Math.min(160, z + 15));
              }}
              aria-label="Zoom in"
              className="hidden sm:flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-slate-300"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={downloading || pages.length === 0}
              onClick={handleSaveOfflineFromToolbar}
              title="Download chapter for offline reading"
              className={`min-h-[36px] px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isSavedOffline
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-[#131822] hover:bg-slate-800 border-slate-800 text-slate-200'
              }`}
            >
              {isSavedOffline ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Download className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="hidden xl:inline">
                {downloading ? 'Saving...' : isSavedOffline ? 'Offline Ready' : 'Save Offline'}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#131822] hover:bg-slate-800 border border-slate-800 text-slate-300"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Reader Viewport Canvas */}
      <div className="pb-28">
        {loading ? (
          <div className="max-w-3xl mx-auto px-4 py-24 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Loading chapter panels...</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="max-w-lg mx-auto px-4 py-24 text-center space-y-4">
            <p className="text-base font-semibold text-slate-200">
              Chapter pages unavailable offline
            </p>
            <p className="text-xs text-slate-400">
              Connect to the internet or open a downloaded chapter from your Offline Vault.
            </p>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'downloads' })}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
            >
              Open Offline Downloads
            </button>
          </div>
        ) : readingMode === 'webtoon' ? (
          <div
            onClick={() => setControlsVisible((v) => !v)}
            className="mx-auto flex flex-col items-center cursor-pointer select-none"
          >
            {pages.map((imgSrc, idx) => (
              <img
                key={idx}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                src={imgSrc}
                alt={`Page ${idx + 1}`}
                referrerPolicy="no-referrer"
                style={
                  fitMode === 'custom'
                    ? { width: `${Math.round((768 * zoomScale) / 100)}px`, maxWidth: '100%' }
                    : undefined
                }
                className={`block select-none ${imageWidthClass}`}
              />
            ))}
          </div>
        ) : (
          <div className="relative max-w-5xl mx-auto px-2 sm:px-4 py-4 flex items-center justify-center min-h-[80vh] select-none">
            <img
              src={pages[currentPage]}
              alt={`Page ${currentPage + 1} of ${pages.length}`}
              referrerPolicy="no-referrer"
              style={
                fitMode === 'custom'
                  ? { width: `${Math.round((768 * zoomScale) / 100)}px`, maxWidth: '100%' }
                  : undefined
              }
              className={`block rounded-md shadow-2xl select-none ${imageWidthClass}`}
            />

            <button
              type="button"
              aria-label="Previous page"
              onClick={goPrevPage}
              className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize focus:outline-none"
            />
            <button
              type="button"
              aria-label="Toggle reader toolbar"
              onClick={() => setControlsVisible((v) => !v)}
              className="absolute inset-y-0 left-1/3 w-1/3 cursor-pointer focus:outline-none"
            />
            <button
              type="button"
              aria-label="Next page"
              onClick={goNextPage}
              className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize focus:outline-none"
            />
          </div>
        )}

        {/* End-of-Chapter Navigation + Chapter Report + Chapter Discussion */}
        {!loading && pages.length > 0 && (
          <div className="max-w-3xl mx-auto px-4 pt-10 space-y-6">
            {/* Chapter Navigation Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                disabled={!prevChapter || !series}
                onClick={() =>
                  prevChapter &&
                  series &&
                  onNavigate({ name: 'reader', seriesId: series.id, chapterId: prevChapter.id })
                }
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-[#131822] hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-200 disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous Chapter
              </button>

              {series && (
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'series', seriesId: series.id })}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-[#131822] hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-300"
                >
                  Chapter List
                </button>
              )}

              <button
                type="button"
                disabled={!nextChapter || !series}
                onClick={() =>
                  nextChapter &&
                  series &&
                  onNavigate({ name: 'reader', seriesId: series.id, chapterId: nextChapter.id })
                }
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                Next Chapter
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Chapter Issue / Missing Page Report Bar */}
            {series && activeChapter && (
              <div className="rounded-xl bg-[#131822] border border-slate-800/90 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Missing a page, broken panel, or out-of-order upload in Chapter{' '}
                      <strong className="font-mono">{activeChapter.chapterNumber}</strong>?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        onOpenAuth();
                        return;
                      }
                      setReportChapterOpen((v) => !v);
                    }}
                    className="h-9 px-3.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-center transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{ui('reader_report_chapter', 'Report Chapter Issue')}</span>
                  </button>
                </div>

                {reportChapterOpen && (
                  <form
                    onSubmit={handleSubmitChapterReport}
                    className="pt-3 border-t border-slate-800 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                      <span>
                        Report Issue in {series.title} — Chapter {activeChapter.chapterNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReportChapterOpen(false)}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={chapterReportReason}
                        onChange={(e) => setChapterReportReason(e.target.value)}
                        className="h-10 px-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        {CHAPTER_REPORT_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        maxLength={500}
                        value={chapterReportDetails}
                        onChange={(e) => setChapterReportDetails(e.target.value)}
                        placeholder="Which page number is missing or broken? (e.g. Page 4 missing)"
                        className="h-10 px-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReportChapterOpen(false)}
                        className="h-8 px-3 text-xs text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingChapterReport}
                        className="h-8 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {submittingChapterReport && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                        <span>Submit Chapter Report</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Chapter-End Comments Section */}
            {series && activeChapter && (
              <CommentSection
                series={series}
                chapterId={activeChapter.id}
                chapterNumber={activeChapter.chapterNumber}
                title={`Chapter ${activeChapter.chapterNumber} · ${ui(
                  'reader_chapter_discussion',
                  'Chapter Discussion'
                )}`}
                user={user}
                userProfile={userProfile}
                userModeration={userModeration}
                isStaffUser={isStaffUser}
                onNavigate={onNavigate}
                onOpenAuth={onOpenAuth}
                onToast={onToast}
              />
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Reader Status & Page Indicator Bar */}
      <div
        className={`fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 transition-opacity duration-150 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-[#131822]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl px-4 py-2 shadow-2xl flex items-center gap-4">
          {readingMode === 'single' && (
            <button
              type="button"
              onClick={goPrevPage}
              className="p-1 text-slate-300 hover:text-white"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <span className="text-xs font-mono tabular-nums text-slate-200 whitespace-nowrap">
            Page {String(Math.min(pages.length, currentPage + 1)).padStart(2, '0')} /{' '}
            {String(pages.length).padStart(2, '0')}
          </span>

          {readingMode === 'single' && (
            <button
              type="button"
              onClick={goNextPage}
              className="p-1 text-slate-300 hover:text-white"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {sortedChapters.length > 0 && series && (
            <div className="md:hidden border-l border-slate-700 pl-3 flex items-center gap-2">
              <button
                type="button"
                disabled={!prevChapter}
                onClick={() =>
                  prevChapter &&
                  onNavigate({ name: 'reader', seriesId: series.id, chapterId: prevChapter.id })
                }
                className="text-xs text-slate-300 disabled:opacity-40"
              >
                Prev Ch
              </button>
              <span className="text-slate-600">·</span>
              <button
                type="button"
                disabled={!nextChapter}
                onClick={() =>
                  nextChapter &&
                  onNavigate({ name: 'reader', seriesId: series.id, chapterId: nextChapter.id })
                }
                className="text-xs text-blue-400 font-semibold disabled:opacity-40"
              >
                Next Ch
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
