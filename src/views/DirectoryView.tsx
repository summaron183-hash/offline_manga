import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { MangaCover } from '../components/MangaCover';
import { ALL_GENRES, DirectorySort, MangaStatus, MangaType, Series, ViewRoute } from '../types';
import { formatCompactViews, formatRelativeTime } from '../utils/time';

interface DirectoryViewProps {
  allSeries: Series[];
  initialGenre?: string;
  initialSort?: DirectorySort;
  initialQuery?: string;
  initialType?: MangaType | 'All';
  latestOnlyMode?: boolean;
  onNavigate: (next: ViewRoute) => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  allSeries,
  initialGenre = 'All',
  initialSort = 'latest',
  initialQuery = '',
  initialType = 'All',
  latestOnlyMode = false,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<DirectorySort>(latestOnlyMode ? 'latest' : initialSort);
  const [statusFilter, setStatusFilter] = useState<MangaStatus | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState<MangaType | 'All'>(initialType);
  const [selectedGenre, setSelectedGenre] = useState<string>(initialGenre || 'All');

  useEffect(() => {
    setSearchQuery(initialQuery || '');
    setSelectedGenre(initialGenre || 'All');
    setSortBy(latestOnlyMode ? 'latest' : initialSort || 'latest');
    setTypeFilter(initialType || 'All');
  }, [initialGenre, initialSort, initialQuery, initialType, latestOnlyMode]);

  const filteredSeries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = allSeries.filter((s) => {
      if (statusFilter !== 'All' && s.status !== statusFilter) return false;
      if (typeFilter !== 'All' && s.type !== typeFilter) return false;
      if (selectedGenre !== 'All' && !s.genres.includes(selectedGenre)) return false;
      if (q) {
        const hit =
          s.title.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.altTitles.some((a) => a.toLowerCase().includes(q)) ||
          s.genres.some((g) => g.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });

    return matches.sort((a, b) => {
      if (sortBy === 'latest') return b.updatedAtMs - a.updatedAtMs;
      if (sortBy === 'popular') return b.views - a.views;
      if (sortBy === 'rating') return b.ratingAvg - a.ratingAvg;
      return a.title.localeCompare(b.title);
    });
  }, [allSeries, searchQuery, sortBy, statusFilter, typeFilter, selectedGenre]);

  const resetFilters = () => {
    setSearchQuery('');
    setSortBy('latest');
    setStatusFilter('All');
    setTypeFilter('All');
    setSelectedGenre('All');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
            {latestOnlyMode ? 'Latest Chapter Updates' : 'Manga Directory'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {latestOnlyMode
              ? 'Chronological feed of recently updated manga, manhwa, and manhua.'
              : 'Filter and explore the complete MGeko library by genre, format, status, or popularity.'}
          </p>
        </div>
        <p className="text-xs font-mono tabular-nums text-slate-400">
          Showing {filteredSeries.length} of {allSeries.length} series
        </p>
      </div>

      {/* Filter Panel */}
      <div className="bg-[#131822] border border-slate-800/80 rounded-2xl p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Search Input */}
          <div className="md:col-span-5 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by title, alternative name, or author..."
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Sort Selector */}
          <div className="md:col-span-3">
            <select
              aria-label="Sort series"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as DirectorySort)}
              className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="latest">Sort: Latest Updated</option>
              <option value="popular">Sort: Popularity</option>
              <option value="rating">Sort: Highest Rating</option>
              <option value="az">Sort: Title (A–Z)</option>
            </select>
          </div>

          {/* Status Selector */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MangaStatus | 'All')}
              className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="All">Status: All</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Type Selector */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by format type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as MangaType | 'All')}
              className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="All">Type: All</option>
              <option value="Manga">Manga</option>
              <option value="Manhwa">Manhwa</option>
              <option value="Manhua">Manhua</option>
            </select>
          </div>
        </div>

        {/* Genre Interactive Filter Buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 inline-flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Genres
            </span>
            {(searchQuery ||
              statusFilter !== 'All' ||
              typeFilter !== 'All' ||
              selectedGenre !== 'All' ||
              sortBy !== 'latest') && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {['All', ...ALL_GENRES].map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(genre)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedGenre === genre
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#0B0E14] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {filteredSeries.length === 0 ? (
        <div className="bg-[#131822] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <p className="text-base font-semibold text-slate-200">
            No manga series matched your current filter combination
          </p>
          <p className="text-xs text-slate-400">
            Try clearing a genre tag or broadening your search term.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 sm:gap-6">
          {filteredSeries.map((series) => (
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
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-3 pt-8">
                  <p className="text-[11px] font-mono tabular-nums text-slate-200">
                    Ch. {series.latestChapterNum} · ★ {series.ratingAvg.toFixed(1)}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                  {series.title}
                </h3>
                <p className="text-xs text-slate-400 truncate">
                  {series.type} · {series.status} · {formatCompactViews(series.views)}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  Updated {formatRelativeTime(series.updatedAtMs)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
