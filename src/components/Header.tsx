import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, signOut } from 'firebase/auth';
import {
  Bell,
  Bookmark,
  Check,
  Compass,
  Download,
  HardDriveDownload,
  History,
  Home,
  LogOut,
  Megaphone,
  Search,
  Shield,
  Smartphone,
  Trash2,
  User as UserIcon,
  WifiOff,
  X,
} from 'lucide-react';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { auth } from '../firebase';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { NotificationItem, Series, StaffRole, UserProfile, ViewRoute } from '../types';
import { formatRelativeTime } from '../utils/time';
import { MangaCover } from './MangaCover';

interface HeaderProps {
  route: ViewRoute;
  onNavigate: (next: ViewRoute) => void;
  allSeries: Series[];
  user: User | null;
  userProfile: UserProfile | null;
  staffRole: StaffRole;
  notifications: NotificationItem[];
  offlineCount: number;
  onOpenAuth: () => void;
  onMarkNotifRead: (notif: NotificationItem) => void;
  onToggleNotifRead: (notif: NotificationItem) => void;
  onDeleteNotif: (notifId: string) => void;
  onMarkAllNotifsRead: () => void;
  hideChromeForReader?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  route,
  onNavigate,
  allSeries,
  user,
  userProfile,
  staffRole,
  notifications,
  offlineCount,
  onOpenAuth,
  onMarkNotifRead,
  onToggleNotifRead,
  onDeleteNotif,
  onMarkAllNotifsRead,
  hideChromeForReader = false,
}) => {
  const { settings, ui } = useSiteSettings();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();

  const [searchOpen, setSearchOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [iosModalOpen, setIosModalOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const isStaff = staffRole === 'admin' || staffRole === 'moderator';

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const suggestions = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return allSeries.slice(0, 5);
    return allSeries
      .filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q) ||
          s.altTitles.some((alt) => alt.toLowerCase().includes(q)) ||
          s.genres.some((g) => g.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [allSeries, queryText]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const activeAvatar = userProfile?.photoURL || user?.photoURL || '';
  const activeDisplayName =
    userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Reader';

  if (hideChromeForReader) {
    return null;
  }

  return (
    <>
      {settings.announcementBanner && (
        <div className="bg-blue-600/15 border-b border-blue-500/30 px-4 py-1.5 text-center text-xs text-blue-200 flex items-center justify-center gap-2">
          <Megaphone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate">{settings.announcementBanner}</span>
        </div>
      )}

      <header className="sticky top-0 z-40 h-14 bg-[#0B0E14]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 xl:gap-8">
          {/* Zone 1: Custom Logo + Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate({ name: 'home' })}
            className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-slate-100 hover:text-blue-400 transition-colors whitespace-nowrap shrink-0 font-display"
          >
            {settings.logoUrl && (
              <img
                src={settings.logoUrl}
                alt={settings.siteName}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-md object-contain shrink-0"
              />
            )}
            <span>{settings.siteName || 'MGeko'}</span>
          </button>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 xl:gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => onNavigate({ name: 'home' })}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                route.name === 'home' ? 'text-slate-100 border-blue-500' : 'border-transparent'
              }`}
            >
              {ui('nav_home', 'Home')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'directory' })}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                route.name === 'directory' ? 'text-slate-100 border-blue-500' : 'border-transparent'
              }`}
            >
              {ui('nav_directory', 'Manga List')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'latest' })}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                route.name === 'latest' ? 'text-slate-100 border-blue-500' : 'border-transparent'
              }`}
            >
              {ui('nav_updates', 'Updates')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'library', tab: 'bookmarks' })}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                route.name === 'library' ? 'text-slate-100 border-blue-500' : 'border-transparent'
              }`}
            >
              {ui('nav_library', 'Library')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ name: 'downloads' })}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                route.name === 'downloads' ? 'text-slate-100 border-blue-500' : 'border-transparent'
              }`}
            >
              {ui('nav_downloads', 'Downloads')}
              {offlineCount > 0 ? ` (${offlineCount})` : ''}
            </button>

            {/* Profile Option (Replaces Portal for normal users) */}
            <button
              type="button"
              onClick={() => onNavigate({ name: 'profile' })}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                route.name === 'profile' ? 'text-slate-100 border-blue-500' : 'border-transparent'
              }`}
            >
              {ui('nav_profile', 'Profile')}
            </button>

            {/* Portal Option — Strictly shown beside Profile ONLY when Admin or Moderator logs in */}
            {isStaff && (
              <button
                type="button"
                onClick={() => onNavigate({ name: 'admin' })}
                className={`inline-flex items-center gap-1.5 hover:text-blue-400 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  route.name === 'admin'
                    ? 'text-blue-400 border-blue-500'
                    : 'text-blue-400/90 border-transparent'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{ui('nav_portal', 'Portal')}</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Search, Alerts, PWA Install & Auth */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div ref={searchRef} className="relative">
              <div className="hidden sm:flex items-center bg-[#131822] border border-slate-800 focus-within:border-blue-500 rounded-lg px-3 h-9 w-44 md:w-60 transition-colors">
                <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
                <input
                  type="text"
                  value={queryText}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setQueryText(e.target.value);
                    setSearchOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && queryText.trim()) {
                      setSearchOpen(false);
                      onNavigate({ name: 'directory', initialQuery: queryText.trim() });
                    }
                  }}
                  placeholder={ui('search_placeholder', 'Search manga, author...')}
                  className="bg-transparent text-xs text-slate-100 placeholder:text-slate-500 w-full focus:outline-none"
                />
                {queryText && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQueryText('')}
                    className="text-slate-500 hover:text-slate-300 ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                aria-label="Search manga"
                onClick={() => setSearchOpen((v) => !v)}
                className="sm:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800/70"
              >
                <Search className="w-5 h-5" />
              </button>

              {searchOpen && (
                <div className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-11 sm:w-96 bg-[#131822] border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="sm:hidden p-3 border-b border-slate-800 flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      placeholder="Search titles, alt names, authors..."
                      className="bg-transparent text-sm text-slate-100 placeholder:text-slate-500 w-full focus:outline-none"
                    />
                  </div>
                  <div className="px-3.5 py-2 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{queryText.trim() ? 'Matching Series' : 'Popular Suggestions'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        onNavigate({ name: 'directory', initialQuery: queryText.trim() });
                      }}
                      className="text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
                    >
                      Advanced Search →
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {suggestions.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No series found matching "{queryText}".
                      </div>
                    ) : (
                      suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setQueryText('');
                            onNavigate({ name: 'series', seriesId: s.id });
                          }}
                          className="w-full p-2.5 flex items-center gap-3 hover:bg-slate-800/60 text-left transition-colors"
                        >
                          <MangaCover
                            src={s.coverUrl}
                            title={s.title}
                            className="w-10 h-14 rounded-md shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-100 truncate">
                              {s.title}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5 tabular-nums">
                              {s.type} · {s.status} · Ch. {s.latestChapterNum}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">{s.author}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Staff Quick Portal Button (only when Admin/Mod logs in) */}
            {isStaff && (
              <button
                type="button"
                title="Open Staff Portal"
                onClick={() => onNavigate({ name: 'admin' })}
                className={`lg:hidden min-h-[40px] px-2.5 flex items-center gap-1 rounded-lg border text-xs font-semibold transition-colors ${
                  route.name === 'admin'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-[#131822] text-blue-400 border-slate-800 hover:border-blue-500/50'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span className="hidden xs:inline">{ui('nav_portal', 'Portal')}</span>
              </button>
            )}

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                Install App
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setIosModalOpen(true)}
                className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                Install App
              </button>
            )}

            {/* Notifications Dropdown */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800/70 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed sm:absolute right-4 sm:right-0 top-16 sm:top-11 w-[calc(100vw-2rem)] sm:w-96 bg-[#131822] border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100 tabular-nums">
                      Chapter Alerts ({unreadCount} unread)
                    </span>
                    {user && unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={onMarkAllNotifsRead}
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {!user ? (
                      <div className="p-6 text-center space-y-2">
                        <p className="text-xs text-slate-400">
                          Continue with Google to receive automatic cloud alerts when bookmarked series release new chapters.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onOpenAuth();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"
                        >
                          Continue with Google
                        </button>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No chapter alerts yet. Bookmark any series to get notified on new uploads!
                      </div>
                    ) : (
                      notifications.slice(0, 12).map((n) => (
                        <div
                          key={n.id}
                          className={`p-3 flex items-start justify-between gap-2 hover:bg-slate-800/40 transition-colors ${
                            n.isRead ? 'opacity-70' : 'bg-blue-500/5'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onMarkNotifRead(n);
                              setNotifOpen(false);
                              onNavigate({
                                name: 'reader',
                                seriesId: n.seriesId,
                                chapterId: n.chapterId,
                              });
                            }}
                            className="text-left flex-1 min-w-0"
                          >
                            <p className="text-xs font-medium text-slate-100 leading-snug">
                              {n.message}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                              {formatRelativeTime(n.createdAtMs)}
                              {!n.isRead ? ' · Unread' : ''}
                            </p>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              title={n.isRead ? 'Mark unread' : 'Mark read'}
                              onClick={() => onToggleNotifRead(n)}
                              className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete notification"
                              onClick={() => onDeleteNotif(n.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {user && (
                    <div className="px-4 py-2.5 border-t border-slate-800 bg-[#0B0E14]/60 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          onNavigate({ name: 'library', tab: 'notifications' });
                        }}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                      >
                        Manage All Notifications →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {ui('auth_signin', 'Sign In')}
              </button>
            ) : (
              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="min-h-[40px] flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-800/70 transition-colors"
                >
                  {activeAvatar ? (
                    <img
                      src={activeAvatar}
                      alt={activeDisplayName}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover border border-slate-700"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center uppercase">
                      {activeDisplayName.slice(0, 1)}
                    </div>
                  )}
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-11 w-60 bg-[#131822] border border-slate-800 rounded-xl shadow-2xl py-1.5 z-50">
                    <div className="px-4 py-2.5 border-b border-slate-800">
                      <p className="text-xs font-semibold text-slate-100 truncate">
                        {activeDisplayName}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                      {staffRole === 'admin' && (
                        <p className="text-[11px] text-blue-400 font-medium mt-1">
                          Cloud Administrator
                        </p>
                      )}
                      {staffRole === 'moderator' && (
                        <p className="text-[11px] text-emerald-400 font-medium mt-1">
                          Cloud Moderator
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate({ name: 'profile' });
                      }}
                      className="w-full px-4 py-2 text-xs text-slate-200 hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-blue-400" />
                      My Profile
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate({ name: 'library', tab: 'bookmarks' });
                      }}
                      className="w-full px-4 py-2 text-xs text-slate-200 hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                      Cloud Bookmarks
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate({ name: 'library', tab: 'history' });
                      }}
                      className="w-full px-4 py-2 text-xs text-slate-200 hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                    >
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      Reading History
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate({ name: 'library', tab: 'notifications' });
                      }}
                      className="w-full px-4 py-2 text-xs text-slate-200 hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                    >
                      <Bell className="w-3.5 h-3.5 text-slate-400" />
                      Manage Notifications
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate({ name: 'downloads' });
                      }}
                      className="w-full px-4 py-2 text-xs text-slate-200 hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                    >
                      <HardDriveDownload className="w-3.5 h-3.5 text-slate-400" />
                      Offline Downloads ({offlineCount})
                    </button>

                    {/* Staff Portal link strictly for Admin & Moderator */}
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          onNavigate({ name: 'admin' });
                        }}
                        className="w-full px-4 py-2 text-xs text-blue-400 font-medium hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Staff Portal
                      </button>
                    )}

                    {!isInstalled && isInstallable && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          install();
                        }}
                        className="w-full px-4 py-2 text-xs text-blue-400 hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Install {settings.siteName || 'MGeko'} App
                      </button>
                    )}

                    <div className="border-t border-slate-800 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          setProfileOpen(false);
                          await signOut(auth);
                        }}
                        className="w-full px-4 py-2 text-xs text-red-300 hover:bg-slate-800/70 flex items-center gap-2.5 text-left"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="fixed bottom-16 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-lg">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline Mode — Reading from local IndexedDB vault</span>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'downloads' })}
            className="underline ml-1 whitespace-nowrap"
          >
            Open Downloads
          </button>
        </div>
      )}

      {/* Mobile Bottom Nav — Profile replaces Portal for normal users */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#0B0E14]/95 backdrop-blur-md border-t border-slate-800/80 grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => onNavigate({ name: 'home' })}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            route.name === 'home' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">
            {ui('nav_home', 'Home')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'directory' })}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            route.name === 'directory' || route.name === 'latest'
              ? 'text-blue-400'
              : 'text-slate-400'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">Browse</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'library', tab: 'bookmarks' })}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            route.name === 'library' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <Bookmark className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">
            {ui('nav_library', 'Library')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'downloads' })}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            route.name === 'downloads' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <HardDriveDownload className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">Offline</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'profile' })}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            route.name === 'profile' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">
            {ui('nav_profile', 'Profile')}
          </span>
        </button>
      </nav>

      {iosModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setIosModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#131822] border border-slate-800 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-100">
              Install {settings.siteName || 'MGeko'} on iOS
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              1. Tap the <strong>Share</strong> icon in your Safari toolbar.
              <br />
              2. Scroll down and tap <strong>Add to Home Screen</strong> to launch{' '}
              {settings.siteName || 'MGeko'} in full standalone mode.
            </p>
            <button
              type="button"
              onClick={() => setIosModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
