import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { BookOpen, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import {
  deleteSeriesReadingHistoryCloud,
  resetSeriesReadingProgressCloud,
  subscribeSeriesChapters,
} from '../services/cloudService';
import { Chapter, ReadingHistoryItem, Series, ViewRoute } from '../types';

interface ResetProgressModalProps {
  series: Series;
  currentHistory?: ReadingHistoryItem;
  user: User;
  onClose: () => void;
  onToast: (msg: string) => void;
  onNavigate: (next: ViewRoute) => void;
}

export const ResetProgressModal: React.FC<ResetProgressModalProps> = ({
  series,
  currentHistory,
  user,
  onClose,
  onToast,
  onNavigate,
}) => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    const unsub = subscribeSeriesChapters(series.id, (list) => {
      const asc = [...list].sort((a, b) => a.chapterNumber - b.chapterNumber);
      setChapters(asc);
      if (asc.length > 0 && !selectedChapterId) {
        setSelectedChapterId(asc[0].id);
      }
    });
    return () => unsub();
  }, [series.id]);

  const ch1 = useMemo(
    () => chapters.find((c) => c.chapterNumber === 1) || chapters[0] || null,
    [chapters]
  );
  const ch2 = useMemo(
    () => chapters.find((c) => c.chapterNumber === 2) || chapters[1] || null,
    [chapters]
  );

  const selectedChapter = useMemo(
    () => chapters.find((c) => c.id === selectedChapterId) || ch1,
    [chapters, selectedChapterId, ch1]
  );

  const handleResetToChapter = async (target: Chapter | null, openReaderAfter: boolean) => {
    if (!target) return;
    setSaving(true);
    try {
      await resetSeriesReadingProgressCloud(user, series, target, chapters);
      onToast(`Progress reset to Chapter ${target.chapterNumber} of ${series.title}.`);
      onClose();
      if (openReaderAfter) {
        onNavigate({ name: 'reader', seriesId: series.id, chapterId: target.id });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHistory = async () => {
    setSaving(true);
    try {
      await deleteSeriesReadingHistoryCloud(user.uid, series.id);
      onToast(`Removed ${series.title} from reading history.`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#131822] border border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <RotateCcw className="w-4 h-4 text-blue-400 shrink-0" />
            <h3 className="font-display text-base font-bold text-slate-100 truncate">
              Reset Progress & Re-Read
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-[#0B0E14] border border-slate-800/90 p-3.5 space-y-1">
            <p className="text-sm font-semibold text-slate-100 line-clamp-1">{series.title}</p>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              Current Progress:{' '}
              {currentHistory
                ? `Ch. ${currentHistory.lastChapterNum} (${currentHistory.readChapterIds.length} chapters read)`
                : 'Not started'}
            </p>
          </div>

          {/* 1-Click Quick Re-Read Presets */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">
              Quick Re-Read Presets
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {ch1 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSelectedChapterId(ch1.id);
                    handleResetToChapter(ch1, false);
                  }}
                  className="h-10 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-100 inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                  <span>Reset to Ch. {ch1.chapterNumber}</span>
                </button>
              )}
              {ch2 && ch2.id !== ch1?.id && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSelectedChapterId(ch2.id);
                    handleResetToChapter(ch2, false);
                  }}
                  className="h-10 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-100 inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                  <span>Reset to Ch. {ch2.chapterNumber}</span>
                </button>
              )}
            </div>
          </div>

          {/* Choose Any Chapter Dropdown */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Or Choose Any Chapter to Reset To
            </label>
            <select
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Chapter {ch.chapterNumber}
                  {ch.title ? ` — ${ch.title}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Chapters after your selected chapter will have their read checkmarks cleared so you can enjoy a clean re-read.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !selectedChapter}
              onClick={() => handleResetToChapter(selectedChapter, false)}
              className="flex-1 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>Set Progress Only</span>
            </button>

            <button
              type="button"
              disabled={saving || !selectedChapter}
              onClick={() => handleResetToChapter(selectedChapter, true)}
              className="flex-1 h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Reset & Read Now</span>
            </button>
          </div>

          {currentHistory && (
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              {confirmClearAll ? (
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="text-xs text-red-300">Remove all history for this series?</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDeleteHistory}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                    >
                      Yes, Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="text-xs text-slate-400 hover:text-red-400 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete series from reading history completely</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
