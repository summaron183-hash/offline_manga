/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AlertTriangle, LogOut, ShieldAlert } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { SiteSettingsProvider, useSiteSettings } from './context/SiteSettingsContext';
import { SEED_CHAPTERS, SEED_SERIES } from './data/seedCatalog';
import { auth, db, validateFirestoreConnection } from './firebase';
import {
  deleteCloudNotification,
  isSanctionCurrentlyActive,
  markAllCloudNotificationsRead,
  markCloudNotificationRead,
  setCloudNotificationReadState,
  subscribeAllUserModerations,
  subscribeMyStaffRole,
  subscribePublicSeries,
  subscribeUserBookmarks,
  subscribeUserHistory,
  subscribeUserModeration,
  subscribeUserNotifications,
  subscribeUserProfile,
  syncUserProfileOnLogin,
  toggleCloudBookmark,
} from './services/cloudService';
import { listOfflineChapters } from './services/offlineDb';
import {
  BookmarkItem,
  NotificationItem,
  OfflineChapterRecord,
  ReadingHistoryItem,
  Series,
  StaffRole,
  UserModerationRecord,
  UserProfile,
  ViewRoute,
} from './types';
import { AdminPortalView } from './views/AdminPortalView';
import { DirectoryView } from './views/DirectoryView';
import { DownloadsView } from './views/DownloadsView';
import { HomeView } from './views/HomeView';
import { LibraryView } from './views/LibraryView';
import { ProfileView } from './views/ProfileView';
import { ReaderView } from './views/ReaderView';
import { SeriesDetailView } from './views/SeriesDetailView';

const AppFooter: React.FC<{
  isStaff: boolean;
  onNavigate: (next: ViewRoute) => void;
}> = ({ isStaff, onNavigate }) => {
  const { settings, ui } = useSiteSettings();
  return (
    <footer className="border-t border-slate-800/80 bg-[#0B0E14] py-8 pb-20 lg:pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-3 min-w-0">
          {settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt={settings.siteName}
              referrerPolicy="no-referrer"
              className="w-5 h-5 rounded object-contain shrink-0"
            />
          )}
          <span className="font-display font-bold text-slate-200 text-sm shrink-0">
            {settings.siteName || 'MGeko'}
          </span>
          <span>·</span>
          <span className="truncate">
            {settings.siteTagline || 'Cloud Synced & Offline-Capable Manga Reader PWA'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => onNavigate({ name: 'directory' })}
            className="hover:text-slate-300 transition-colors"
          >
            {ui('nav_directory', 'Manga List')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'latest' })}
            className="hover:text-slate-300 transition-colors"
          >
            {ui('nav_updates', 'Updates')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'downloads' })}
            className="hover:text-slate-300 transition-colors"
          >
            {ui('nav_downloads', 'Downloads')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'profile' })}
            className="hover:text-slate-300 transition-colors"
          >
            {ui('nav_profile', 'Profile')}
          </button>
          {isStaff && (
            <button
              type="button"
              onClick={() => onNavigate({ name: 'admin' })}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              {ui('nav_portal', 'Portal')}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};

export default function App() {
  const [route, setRoute] = useState<ViewRoute>(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedSeries = params.get('series');
    if (sharedSeries) {
      return { name: 'series', seriesId: sharedSeries };
    }
    return { name: 'home' };
  });

  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole>('user');
  const [userModeration, setUserModeration] = useState<UserModerationRecord | null>(null);
  const [userModerationsMap, setUserModerationsMap] = useState<
    Record<string, UserModerationRecord>
  >({});
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [cloudSeries, setCloudSeries] = useState<Series[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [offlineChapters, setOfflineChapters] = useState<OfflineChapterRecord[]>([]);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3600);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  const refreshOfflineVault = useCallback(async () => {
    try {
      const records = await listOfflineChapters();
      setOfflineChapters(records);
    } catch {
      // Ignore IndexedDB unavailable in private sandbox
    }
  }, []);

  // Boot connection validation, Offline Vault load, and Public Catalog listener
  useEffect(() => {
    validateFirestoreConnection();
    refreshOfflineVault();
    const unsubSeries = subscribePublicSeries(setCloudSeries);
    return () => unsubSeries();
  }, [refreshOfflineVault]);

  // Auth listener & per-user Cloud Sync subscriptions
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubRole: (() => void) | null = null;
    let unsubMod: (() => void) | null = null;
    let unsubBookmarks: (() => void) | null = null;
    let unsubHistory: (() => void) | null = null;
    let unsubNotifs: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      unsubProfile?.();
      unsubRole?.();
      unsubMod?.();
      unsubBookmarks?.();
      unsubHistory?.();
      unsubNotifs?.();
      unsubProfile = null;
      unsubRole = null;
      unsubMod = null;
      unsubBookmarks = null;
      unsubHistory = null;
      unsubNotifs = null;

      if (!currentUser) {
        setUserProfile(null);
        setStaffRole('user');
        setUserModeration(null);
        setBookmarks([]);
        setHistory([]);
        setNotifications([]);
        return;
      }

      syncUserProfileOnLogin(currentUser);

      unsubProfile = subscribeUserProfile(currentUser.uid, setUserProfile);
      unsubRole = subscribeMyStaffRole(
        currentUser.email,
        currentUser.emailVerified,
        setStaffRole
      );
      unsubMod = subscribeUserModeration(currentUser.uid, setUserModeration);
      unsubBookmarks = subscribeUserBookmarks(currentUser.uid, setBookmarks);
      unsubHistory = subscribeUserHistory(currentUser.uid, setHistory);
      unsubNotifs = subscribeUserNotifications(currentUser.uid, setNotifications);
    });

    return () => {
      unsubAuth();
      unsubProfile?.();
      unsubRole?.();
      unsubMod?.();
      unsubBookmarks?.();
      unsubHistory?.();
      unsubNotifs?.();
    };
  }, []);

  const isStaff = staffRole === 'admin' || staffRole === 'moderator';

  useEffect(() => {
    if (!isStaff) {
      setUserModerationsMap({});
      return;
    }
    const unsub = subscribeAllUserModerations(setUserModerationsMap);
    return () => unsub();
  }, [isStaff]);

  // Merge Cloud Firestore series with Pre-Seeded Starter Series (Cloud takes precedence)
  const mergedSeries = useMemo(() => {
    const cloudMap = new Map<string, Series>();
    for (const s of cloudSeries) {
      cloudMap.set(s.id, s);
    }
    const combined: Series[] = [...cloudSeries];
    for (const seed of SEED_SERIES) {
      if (!cloudMap.has(seed.id)) {
        combined.push(seed);
      }
    }
    return combined;
  }, [cloudSeries]);

  const bookmarkSet = useMemo(
    () => new Set(bookmarks.map((b) => b.seriesId)),
    [bookmarks]
  );

  const historyMap = useMemo(() => {
    const m: Record<string, ReadingHistoryItem> = {};
    for (const h of history) {
      m[h.seriesId] = h;
    }
    return m;
  }, [history]);

  const offlineMap = useMemo(() => {
    const m: Record<string, OfflineChapterRecord> = {};
    for (const rec of offlineChapters) {
      m[rec.chapterId] = rec;
    }
    return m;
  }, [offlineChapters]);

  const navigate = useCallback((next: ViewRoute) => {
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleToggleBookmark = async (series: Series) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    if (!user.emailVerified) {
      showToast('Please continue with Google to sync cloud bookmarks.');
      return;
    }
    const isSaved = bookmarkSet.has(series.id);
    await toggleCloudBookmark(user, series, isSaved);
    showToast(
      isSaved
        ? `Removed ${series.title} from Cloud Bookmarks.`
        : `Saved ${series.title} to Cloud Bookmarks & subscribed to chapter alerts!`
    );
  };

  const handleQuickReadSeries = async (series: Series, mode: 'first' | 'latest') => {
    if (mode === 'first' && historyMap[series.id]) {
      navigate({
        name: 'reader',
        seriesId: series.id,
        chapterId: historyMap[series.id].lastChapterId,
      });
      return;
    }

    if (!series.isSeedOnly) {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'series', series.id, 'chapters'),
            where('visibility', '==', 'public')
          )
        );
        if (!snap.empty) {
          const ordered = snap.docs
            .map((d) => ({ id: d.id, num: Number(d.data().chapterNumber) || 1 }))
            .sort((a, b) => a.num - b.num);
          const chosen = mode === 'first' ? ordered[0] : ordered[ordered.length - 1];
          navigate({ name: 'reader', seriesId: series.id, chapterId: chosen.id });
          return;
        }
      } catch {
        // Fallback to seed or series page
      }
    }

    const seedChs = SEED_CHAPTERS[series.id];
    if (seedChs && seedChs.length > 0) {
      const target = mode === 'first' ? seedChs[0] : seedChs[seedChs.length - 1];
      navigate({ name: 'reader', seriesId: series.id, chapterId: target.id });
      return;
    }
    navigate({ name: 'series', seriesId: series.id });
  };

  const activeSeriesForRoute = useMemo(() => {
    if (route.name === 'series' || route.name === 'reader') {
      return mergedSeries.find((s) => s.id === route.seriesId);
    }
    return undefined;
  }, [route, mergedSeries]);

  const isBannedOrSuspended =
    staffRole !== 'admin' &&
    isSanctionCurrentlyActive(userModeration) &&
    (userModeration?.status === 'banned' || userModeration?.status === 'suspended');

  return (
    <ErrorBoundary>
      <SiteSettingsProvider
        isAdmin={staffRole === 'admin'}
        adminUser={user}
        onToast={showToast}
      >
        <div className="min-h-screen flex flex-col bg-[#0B0E14] text-slate-100">
          <Header
            route={route}
            onNavigate={navigate}
            allSeries={mergedSeries}
            user={user}
            userProfile={userProfile}
            staffRole={staffRole}
            notifications={notifications}
            offlineCount={offlineChapters.length}
            onOpenAuth={() => setAuthModalOpen(true)}
            onMarkNotifRead={(notif) => {
              if (user && !notif.isRead) {
                markCloudNotificationRead(user.uid, notif.id);
              }
            }}
            onToggleNotifRead={(notif) => {
              if (user) {
                setCloudNotificationReadState(user.uid, notif.id, !notif.isRead);
              }
            }}
            onDeleteNotif={(notifId) => {
              if (user) {
                deleteCloudNotification(user.uid, notifId);
              }
            }}
            onMarkAllNotifsRead={() => {
              if (user) {
                markAllCloudNotificationsRead(user.uid, notifications);
              }
            }}
            hideChromeForReader={route.name === 'reader'}
          />

          {/* Moderator Warning / Mute Notice Strip */}
          {user &&
            userModeration &&
            !isBannedOrSuspended &&
            (userModeration.status === 'warned' ||
              (userModeration.status === 'muted' &&
                isSanctionCurrentlyActive(userModeration))) && (
              <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-200 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>
                    {userModeration.status === 'muted'
                      ? 'Account Muted:'
                      : 'Moderator Warning:'}
                  </strong>{' '}
                  {userModeration.reason || 'Please review our community rules.'}
                </span>
              </div>
            )}

          <main className="flex-1">
            {isBannedOrSuspended ? (
              <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <h1 className="font-display text-2xl font-bold text-slate-100 uppercase">
                  Account {userModeration?.status}
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Reason: {userModeration?.reason || 'Community guideline violation.'}
                </p>
                <p className="text-xs text-slate-400 font-mono">
                  {userModeration?.isPermanent
                    ? 'Duration: Permanent'
                    : `Expires: ${new Date(
                        userModeration?.expiresAtMs || Date.now()
                      ).toLocaleString()}`}
                </p>
                <button
                  type="button"
                  onClick={() => signOut(auth)}
                  className="h-10 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-red-300 inline-flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <>
                {route.name === 'home' && (
                  <HomeView
                    allSeries={mergedSeries}
                    historyMap={historyMap}
                    onNavigate={navigate}
                    onQuickReadSeries={handleQuickReadSeries}
                  />
                )}

                {route.name === 'directory' && (
                  <DirectoryView
                    allSeries={mergedSeries}
                    initialGenre={route.initialGenre}
                    initialSort={route.initialSort}
                    initialQuery={route.initialQuery}
                    initialType={route.initialType}
                    onNavigate={navigate}
                  />
                )}

                {route.name === 'latest' && (
                  <DirectoryView
                    allSeries={mergedSeries}
                    latestOnlyMode={true}
                    onNavigate={navigate}
                  />
                )}

                {route.name === 'series' && activeSeriesForRoute && (
                  <SeriesDetailView
                    series={activeSeriesForRoute}
                    user={user}
                    userProfile={userProfile}
                    userModeration={userModeration}
                    isStaffUser={isStaff}
                    isBookmarked={bookmarkSet.has(activeSeriesForRoute.id)}
                    historyItem={historyMap[activeSeriesForRoute.id]}
                    offlineMap={offlineMap}
                    onRefreshOffline={refreshOfflineVault}
                    onToggleBookmark={handleToggleBookmark}
                    onNavigate={navigate}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onToast={showToast}
                  />
                )}

                {route.name === 'reader' && (
                  <ReaderView
                    series={activeSeriesForRoute}
                    chapterId={route.chapterId}
                    user={user}
                    userProfile={userProfile}
                    userModeration={userModeration}
                    isStaffUser={isStaff}
                    historyItem={
                      activeSeriesForRoute ? historyMap[activeSeriesForRoute.id] : undefined
                    }
                    offlineMap={offlineMap}
                    onRefreshOffline={refreshOfflineVault}
                    onNavigate={navigate}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onToast={showToast}
                  />
                )}

                {route.name === 'library' && (
                  <LibraryView
                    user={user}
                    initialTab={route.tab}
                    bookmarks={bookmarks}
                    history={history}
                    notifications={notifications}
                    allSeries={mergedSeries}
                    onRemoveBookmark={async (seriesId) => {
                      const s = mergedSeries.find((item) => item.id === seriesId);
                      if (user && s) {
                        await toggleCloudBookmark(user, s, true);
                        showToast(`Removed ${s.title} from Cloud Bookmarks.`);
                      }
                    }}
                    onNavigate={navigate}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onToast={showToast}
                  />
                )}

                {route.name === 'downloads' && (
                  <DownloadsView
                    offlineChapters={offlineChapters}
                    onRefreshOffline={refreshOfflineVault}
                    onNavigate={navigate}
                    onToast={showToast}
                  />
                )}

                {route.name === 'profile' && (
                  <ProfileView
                    currentUser={user}
                    myProfile={userProfile}
                    staffRole={staffRole}
                    targetUserId={route.targetUserId}
                    bookmarks={bookmarks}
                    myHistory={history}
                    notifications={notifications}
                    allSeries={mergedSeries}
                    userModerationsMap={userModerationsMap}
                    myModeration={userModeration}
                    onNavigate={navigate}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onToast={showToast}
                  />
                )}

                {route.name === 'admin' && (
                  <AdminPortalView
                    user={user}
                    staffRole={staffRole}
                    allSeries={mergedSeries}
                    onNavigate={navigate}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onToast={showToast}
                  />
                )}
              </>
            )}
          </main>

          {route.name !== 'reader' && (
            <AppFooter isStaff={isStaff} onNavigate={navigate} />
          )}

          <AuthModal
            isOpen={authModalOpen}
            onClose={() => setAuthModalOpen(false)}
            onSuccessToast={showToast}
          />

          {toastMsg && (
            <div className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 max-w-sm bg-[#131822] border border-blue-500/40 text-slate-100 px-4 py-3 rounded-xl shadow-2xl text-xs font-medium">
              {toastMsg}
            </div>
          )}
        </div>
      </SiteSettingsProvider>
    </ErrorBoundary>
  );
}
