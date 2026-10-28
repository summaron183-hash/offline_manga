import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Series } from '../types';
import { MangaCover } from './MangaCover';

interface SearchableSeriesSelectProps {
  allSeries: Series[];
  selectedSeriesId: string;
  onSelect: (series: Series) => void;
}

export const SearchableSeriesSelect: React.FC<SearchableSeriesSelectProps> = ({
  allSeries,
  selectedSeriesId,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSeries = useMemo(
    () => allSeries.find((s) => s.id === selectedSeriesId) || null,
    [allSeries, selectedSeriesId]
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allSeries;
    return allSeries.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q) ||
        s.altTitles.some((alt) => alt.toLowerCase().includes(q))
    );
  }, [allSeries, searchQuery]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 hover:border-slate-700 focus:border-blue-500 text-left flex items-center justify-between gap-3 transition-colors"
      >
        {selectedSeries ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <MangaCover
              src={selectedSeries.coverUrl}
              title={selectedSeries.title}
              className="w-6 h-8 rounded shrink-0"
            />
            <span className="text-sm font-medium text-slate-100 truncate">
              {selectedSeries.title}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
              (Latest: Ch. {selectedSeries.latestChapterNum})
            </span>
          </div>
        ) : (
          <span className="text-sm text-slate-400">Search and select target manga series...</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-12 z-40 rounded-xl bg-[#131822] border border-slate-700 shadow-2xl overflow-hidden">
          <div className="p-2.5 border-b border-slate-800 flex items-center gap-2 bg-[#0B0E14]">
            <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type series title, alt title, or author to filter..."
              className="w-full bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none py-1"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-500 hover:text-slate-200"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No manga series matching "{searchQuery}".
              </div>
            ) : (
              filtered.map((s) => {
                const isSelected = s.id === selectedSeriesId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSelect(s);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full p-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                      isSelected ? 'bg-blue-600/15' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MangaCover
                        src={s.coverUrl}
                        title={s.title}
                        className="w-8 h-11 rounded shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                          {s.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5 tabular-nums">
                          {s.type} · {s.author} · Latest Ch. {s.latestChapterNum}
                        </p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0 mr-1" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
