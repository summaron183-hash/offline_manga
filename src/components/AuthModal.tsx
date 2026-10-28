import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  History,
  Loader2,
  MessageSquare,
  X,
} from 'lucide-react';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { auth, googleProvider } from '../firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccessToast }) => {
  const { settings } = useSiteSettings();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccessToast('Signed in with Google. Cloud profile & library synced.');
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMsg(null);
      } else {
        const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#131822] border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-100">
              Sign in to {settings.siteName || 'MGeko'}
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Continue with your Google account to sync your profile and library across every device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cloud Sync Benefits */}
        <div className="rounded-xl bg-[#0B0E14] border border-slate-800/80 p-4 space-y-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <Bookmark className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Cloud profile, bookmarks, and new-chapter release alerts</span>
          </div>
          <div className="flex items-center gap-2.5">
            <History className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Automatic chapter progress & re-read controls across devices</span>
          </div>
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Rich comments with images, replies, and series ratings</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Exclusive Google Sign-In Button */}
        <button
          type="button"
          disabled={busy}
          onClick={handleGoogleSignIn}
          className="w-full min-h-[48px] flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-60 shadow-lg"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-700 shrink-0" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.09 3.56-5.17 3.56-8.8z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.31c-.24-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31V6.6H1.29C.47 8.23 0 10.06 0 12s.47 3.77 1.29 5.4l3.99-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l3.99 3.09c.95-2.85 3.6-4.94 6.72-4.94z"
              />
            </svg>
          )}
          <span>{busy ? 'Connecting to Google...' : 'Continue with Google'}</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>Verified Google authentication with zero password setup required.</span>
        </div>
      </div>
    </div>
  );
};
