import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { MangaCover } from '../components/MangaCover';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { HERO_BACKDROP_ASSET } from '../data/seedCatalog';
import { ALL_GENRES, ReadingHistoryItem, Series, ViewRoute } from '../types';
import { formatCompactViews, formatRelativeTime } from '../utils/time';

interface HomeViewProps {
  allSeries: Series[];
  historyMap: Record<string, ReadingHistoryItem>;
  onNavigate: (next: ViewRoute) => void;
  onQuickReadSeries: (series: Series, mode: 'first' | 'latest') => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  allSeries,
  historyMap,
  onNavigate,
  onQuickReadSeries,
}) => {
  const { ui } = useSiteSettings();

  const featured = useMemo(() => {
    const flagged = allSeries.filter((s) => s.isFeatured);
    return (flagged.length > 0 ? flagged : allSeries).slice(0, 5);
  }, [allSeries]);

  const [heroIndex, setHeroIndex] = useState(0);
  const [rankingTab, setRankingTab] = useState<'today' | 'weekly'>('today');

  useEffect(() => {
    if (featured.length <= 1) return;
    const id = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % featured.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [featured.length]);

  const activeHero = featured[heroIndex % Math.max(1, featured.length)];

  const popularRanked = useMemo(() => {
    const copy = [...allSeries];
    if (rankingTab === 'today') {
      return copy.sort((a, b) => b.views - a.views).slice(0, 6);
    }
    return copy.sort((a, b) => b.ratingAvg * b.views - a.ratingAvg * a.views).slice(0, 6);
  }, [allSeries, rankingTab]);

  const latestUpdates = useMemo(() => {
    return [...allSeries].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }, [allSeries]);

  return (
    <div className="space-y-12 pb-20">
      {/* 1. Featured Hero Carousel */}
      {activeHero && (
        <section className="relative overflow-hidden border-b border-slate-800/80 bg-[#0D111A]">
          <div className="absolute inset-0">
            <img
              src={activeHero.heroBackdropUrl || HERO_BACKDROP_ASSET}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-30 scale-105 blur-[2px]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B0E14] via-[#0B0E14]/90 to-[#0B0E14]/55" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] via-transparent to-[#0B0E14]/40" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-300">
                  <span className="text-blue-400 font-semibold">
                    {ui('hero_badge', 'Featured Spotlight')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeHero.type}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeHero.status}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-amber-400 tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {activeHero.ratingAvg.toFixed(1)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    Ch. {activeHero.latestChapterNum}
                  </span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-50 leading-[1.12] max-w-2xl">
                  {activeHero.title}
                </h1>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl line-clamp-3">
                  {activeHero.synopsis}
                </p>

                <p className="text-xs text-slate-400">{activeHero.genres.join(' · ')}</p>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onQuickReadSeries(activeHero, 'first')}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    <BookOpen className="w-4 h-4" />
                    {historyMap[activeHero.id]
                      ? `Continue Ch. ${historyMap[activeHero.id].lastChapterNum}`
                      : ui('hero_read_now', 'Read Now')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate({ name: 'series', seriesId: activeHero.id })}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#131822]/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <span>{ui('hero_details', 'Series Details')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {featured.length > 1 && (
                  <div className="pt-3 flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Previous featured series"
                      onClick={() =>
                        setHeroIndex((prev) => (prev - 1 + featured.length) % featured.length)
                      }
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5">
                      {featured.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={`Select spotlight ${idx + 1}`}
                          onClick={() => setHeroIndex(idx)}
                          className={`h-1.5 rounded-full transition-all ${
                            idx === heroIndex % featured.length
                              ? 'w-7 bg-blue-500'
                              : 'w-2 bg-slate-700 hover:bg-slate-500'
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-label="Next featured series"
                      onClick={() => setHeroIndex((prev) => (prev + 1) % featured.length)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 flex justify-center lg:justify-end">
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'series', seriesId: activeHero.id })}
                  className="group relative w-48 sm:w-56 lg:w-64 aspect-[3/4] rounded-2xl overflow-hidden border border-slate-700/70 shadow-2xl transition-transform duration-200 hover:-translate-y-1 text-left"
                >
                  <MangaCover
                    src={activeHero.coverUrl}
                    title={activeHero.title}
                    className="w-full h-full"
                  />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Split: 8-Column Feed + 4-Column Genre & Leaderboard Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-12">
          {/* 2. Popular Today / Weekly Ranking Grid */}
          <section className="space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                  {ui('home_popular_title', 'Popular Series')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ui('home_popular_subtitle', 'Most read titles across readers')}
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#131822] border border-slate-800 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setRankingTab('today')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    rankingTab === 'today'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setRankingTab('weekly')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    rankingTab === 'weekly'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Weekly
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              {popularRanked.map((series) => (
                <div
                  key={series.id}
                  onClick={() => onNavigate({ name: 'series', seriesId: series.id })}
                  className="group cursor-pointer space-y-2.5 transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#131822] border border-slate-800/80">
                    <MangaCover
                      src={series.coverUrl}
                      title={series.title}
                      className="w-full h-full transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-8">
                      <p className="text-[11px] font-mono tabular-nums text-slate-200">
                        Ch. {series.latestChapterNum} · {formatCompactViews(series.views)} views
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                      {series.title}
                    </h3>
                    <p className="text-xs text-slate-400 truncate tabular-nums">
                      {series.type} · {series.status} · ★ {series.ratingAvg.toFixed(1)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Chronological Latest Releases Feed */}
          <section className="space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                  {ui('home_latest_title', 'Latest Releases')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ui('home_latest_subtitle', 'Freshly uploaded chapters sorted chronologically')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate({ name: 'latest' })}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 whitespace-nowrap"
              >
                {ui('home_view_all_updates', 'View All Updates →')}
              </button>
            </div>

            <div className="divide-y divide-slate-800/70 bg-[#131822] border border-slate-800/80 rounded-2xl overflow-hidden">
              {latestUpdates.map((series) => {
                const latestNum = series.latestChapterNum;
                const prevNum = Math.max(1, latestNum - 1);
                return (
                  <div
                    key={series.id}
                    className="p-4 sm:p-5 flex items-start gap-4 hover:bg-slate-800/35 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onNavigate({ name: 'series', seriesId: series.id })}
                      className="w-20 sm:w-24 aspect-[3/4] rounded-lg overflow-hidden shrink-0 border border-slate-800"
                    >
                      <MangaCover
                        src={series.coverUrl}
                        title={series.title}
                        className="w-full h-full"
                      />
                    </button>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => onNavigate({ name: 'series', seriesId: series.id })}
                          className="text-base font-semibold text-slate-100 hover:text-blue-400 transition-colors text-left line-clamp-1"
                        >
                          {series.title}
                        </button>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {series.type} · {series.author} · {series.genres.slice(0, 3).join(', ')}
                        </p>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        {latestNum > 0 ? (
                          <>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <button
                                type="button"
                                onClick={() => onQuickReadSeries(series, 'latest')}
                                className="font-mono tabular-nums font-medium text-slate-200 hover:text-blue-400 transition-colors truncate"
                              >
                                Chapter {latestNum}
                                {series.latestChapterTitle
                                  ? ` — ${series.latestChapterTitle}`
                                  : ''}
                              </button>
                              <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0 tabular-nums">
                                {formatRelativeTime(series.updatedAtMs)}
                              </span>
                            </div>

                            {latestNum > 1 && (
                              <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onNavigate({ name: 'series', seriesId: series.id })
                                  }
                                  className="font-mono tabular-nums hover:text-slate-200 transition-colors truncate"
                                >
                                  Chapter {prevNum}
                                </button>
                                <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                                  Earlier release
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">No chapters uploaded yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* 4. Sidebar: Genre Tag Cloud & Weekly Top 5 */}
        <aside className="lg:col-span-4 space-y-8">
          <div className="bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">
                {ui('home_genres_title', 'Browse by Genre')}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate({ name: 'directory' })}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                All Genres
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_GENRES.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => onNavigate({ name: 'directory', initialGenre: genre })}
                  className="px-3 py-1.5 rounded-lg bg-[#0B0E14] hover:bg-blue-600/20 border border-slate-800 hover:border-blue-500/50 text-xs font-medium text-slate-300 hover:text-blue-300 transition-colors whitespace-nowrap"
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-100">
              {ui('home_leaderboard_title', 'Top Rated Leaderboard')}
            </h3>
            <div className="divide-y divide-slate-800/70">
              {[...allSeries]
                .sort((a, b) => b.ratingAvg - a.ratingAvg)
                .slice(0, 5)
                .map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigate({ name: 'series', seriesId: s.id })}
                    className="w-full py-3 first:pt-0 last:pb-0 flex items-center gap-3.5 text-left group"
                  >
                    <span className="w-6 text-sm font-mono font-bold tabular-nums text-slate-500 group-hover:text-blue-400">
                      0{idx + 1}
                    </span>
                    <MangaCover
                      src={s.coverUrl}
                      title={s.title}
                      className="w-11 h-15 rounded-md shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors truncate">
                        {s.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                        {s.type} · ★ {s.ratingAvg.toFixed(2)} · {formatCompactViews(s.views)}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
