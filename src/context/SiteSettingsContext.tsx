import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { Check, Edit3, X } from 'lucide-react';
import { saveSiteSettingsCloud, subscribeSiteSettings } from '../services/cloudService';
import { DEFAULT_SITE_SETTINGS, DEFAULT_UI_COPY, SiteSettings } from '../types';

interface SiteSettingsContextValue {
  settings: SiteSettings;
  ui: (key: string, fallback?: string) => string;
  liveTextEditMode: boolean;
  setLiveTextEditMode: (enabled: boolean) => void;
}

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  settings: DEFAULT_SITE_SETTINGS,
  ui: (key, fallback) => fallback || DEFAULT_UI_COPY[key] || key,
  liveTextEditMode: false,
  setLiveTextEditMode: () => {},
});

export function useSiteSettings(): SiteSettingsContextValue {
  return useContext(SiteSettingsContext);
}

interface SiteSettingsProviderProps {
  isAdmin: boolean;
  adminUser: User | null;
  onToast: (msg: string) => void;
  children: React.ReactNode;
}

export const SiteSettingsProvider: React.FC<SiteSettingsProviderProps> = ({
  isAdmin,
  adminUser,
  onToast,
  children,
}) => {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [liveTextEditMode, setLiveTextEditMode] = useState(false);
  const [pickedOriginal, setPickedOriginal] = useState<string>('');
  const [pickedReplacement, setPickedReplacement] = useState<string>('');
  const [savingInline, setSavingInline] = useState(false);

  const origNodeTextMap = useRef<WeakMap<Text, string>>(new WeakMap());

  useEffect(() => {
    const unsub = subscribeSiteSettings(setSettings);
    return () => unsub();
  }, []);

  // Turn off live edit mode if admin signs out
  useEffect(() => {
    if (!isAdmin && liveTextEditMode) {
      setLiveTextEditMode(false);
      setPickedOriginal('');
    }
  }, [isAdmin, liveTextEditMode]);

  // Apply dynamic CSS theme variables and document title
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--site-canvas', settings.bgCanvasHex || '#0B0E14');
    root.style.setProperty('--site-surface', settings.bgSurfaceHex || '#131822');
    root.style.setProperty('--site-accent', settings.accentHex || '#3B82F6');
    root.style.setProperty('--site-text', settings.textPrimaryHex || '#F1F5F9');
    if (settings.siteName) {
      document.title = `${settings.siteName} — Manga, Manhwa & Manhua Reader`;
    }
  }, [
    settings.bgCanvasHex,
    settings.bgSurfaceHex,
    settings.accentHex,
    settings.textPrimaryHex,
    settings.siteName,
  ]);

  const parsedReplacements = useMemo(() => {
    const pairs: Array<{ from: string; to: string }> = [];
    for (const entry of settings.textReplacements) {
      const idx = entry.indexOf(':::');
      if (idx > 0) {
        const from = entry.slice(0, idx).trim();
        const to = entry.slice(idx + 3);
        if (from) pairs.push({ from, to });
      }
    }
    return pairs;
  }, [settings.textReplacements]);

  // Apply global text replacements anywhere in the DOM
  useEffect(() => {
    const applyToSubtree = (rootNode: Node) => {
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const parent = node.parentElement;
        if (
          parent &&
          !['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT'].includes(parent.tagName) &&
          !parent.closest('[data-no-site-replace="true"]')
        ) {
          let base = origNodeTextMap.current.get(node);
          if (base === undefined) {
            base = node.nodeValue || '';
            origNodeTextMap.current.set(node, base);
          }

          let transformed = base;
          for (const pair of parsedReplacements) {
            if (transformed.includes(pair.from)) {
              transformed = transformed.split(pair.from).join(pair.to);
            }
          }
          if (node.nodeValue !== transformed) {
            node.nodeValue = transformed;
          }
        }
        node = walker.nextNode() as Text | null;
      }
    };

    applyToSubtree(document.body);

    if (parsedReplacements.length === 0) return;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          applyToSubtree(m.addedNodes[i]);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [parsedReplacements]);

  // Live On-Page Click-to-Edit listener for Admins
  useEffect(() => {
    if (!liveTextEditMode || !isAdmin) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('[data-no-site-replace="true"]')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      // Find nearest direct text carrier
      const rawText = (target.innerText || target.textContent || '').trim();
      if (!rawText || rawText.length > 220 || rawText.includes('\n')) return;

      e.preventDefault();
      e.stopPropagation();

      // Check if rawText is already the output of an existing replacement
      const existingIdx = parsedReplacements.findIndex((p) => p.to === rawText || p.from === rawText);
      if (existingIdx >= 0) {
        setPickedOriginal(parsedReplacements[existingIdx].from);
        setPickedReplacement(parsedReplacements[existingIdx].to);
      } else {
        setPickedOriginal(rawText);
        setPickedReplacement(rawText);
      }
    };

    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [liveTextEditMode, isAdmin, parsedReplacements]);

  const handleSaveInlineReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser || !pickedOriginal.trim()) return;
    setSavingInline(true);
    try {
      const cleanOrig = pickedOriginal.trim();
      const filtered = settings.textReplacements.filter(
        (r) => !r.startsWith(`${cleanOrig}:::`)
      );
      const nextList =
        pickedReplacement.trim() && pickedReplacement !== cleanOrig
          ? [`${cleanOrig}:::${pickedReplacement}`, ...filtered]
          : filtered;

      await saveSiteSettingsCloud(adminUser, {
        siteName: settings.siteName,
        siteTagline: settings.siteTagline,
        logoUrl: settings.logoUrl,
        announcementBanner: settings.announcementBanner,
        themePreset: settings.themePreset,
        bgCanvasHex: settings.bgCanvasHex,
        bgSurfaceHex: settings.bgSurfaceHex,
        accentHex: settings.accentHex,
        textPrimaryHex: settings.textPrimaryHex,
        uiCopy: settings.uiCopy,
        textReplacements: nextList,
      });
      setPickedOriginal('');
      setPickedReplacement('');
      onToast('Site text updated in Cloud across all devices!');
    } finally {
      setSavingInline(false);
    }
  };

  const ui = (key: string, fallback?: string): string => {
    const val = settings.uiCopy?.[key];
    if (val && val.trim().length > 0) return val;
    return fallback || DEFAULT_UI_COPY[key] || key;
  };

  return (
    <SiteSettingsContext.Provider
      value={{
        settings,
        ui,
        liveTextEditMode,
        setLiveTextEditMode,
      }}
    >
      {children}

      {/* Floating Admin Live Text Inspector Dock */}
      {isAdmin && liveTextEditMode && (
        <div
          data-no-site-replace="true"
          className="fixed bottom-4 inset-x-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-xl z-50 bg-[#131822] border border-blue-500/60 rounded-2xl p-4 shadow-2xl space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
              <Edit3 className="w-4 h-4 shrink-0" />
              <span>Live Site Text Editor Active — Click any text on any page to edit it</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setLiveTextEditMode(false);
                setPickedOriginal('');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>

          {pickedOriginal ? (
            <form onSubmit={handleSaveInlineReplacement} className="space-y-2.5">
              <div className="text-[11px] text-slate-400 truncate">
                Original: <span className="text-slate-200 font-mono">"{pickedOriginal}"</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  maxLength={250}
                  value={pickedReplacement}
                  onChange={(e) => setPickedReplacement(e.target.value)}
                  placeholder="Enter new text..."
                  className="flex-1 h-9 px-3 rounded-lg bg-[#0B0E14] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={savingInline}
                  className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {savingInline ? 'Saving...' : 'Save Text'}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-[11px] text-slate-400">
              Click any heading, button, navigation label, or phrase on screen to customize it globally.
            </p>
          )}
        </div>
      )}
    </SiteSettingsContext.Provider>
  );
};
