import React, { useEffect, useMemo, useState } from 'react';
import { User, signOut } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BookOpen,
  Camera,
  Check,
  Clock,
  Edit3,
  Gavel,
  History,
  ImagePlus,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  clearAllCloudNotifications,
  clearAllReadingHistoryCloud,
  compressImageBlobToWebP,
  deleteCloudComment,
  deleteCloudNotification,
  deleteSeriesReadingHistoryCloud,
  fetchTargetUserReadingHistory,
  fetchUserPrivateEmail,
  isSanctionCurrentlyActive,
  markAllCloudNotificationsRead,
  saveUserProfileCloud,
  setCloudNotificationReadState,
  setUserModerationCloud,
  subscribeAuthorComments,
  subscribeUserProfile,
} from '../services/cloudService';
import {
  ALL_GENRES,
  BookmarkItem,
  CommentItem,
  ModerationStatus,
  NotificationItem,
  ReadingHistoryItem,
  Series,
  StaffRole,
  UserModerationRecord,
  UserProfile,
  ViewRoute,
} from '../types';
import { formatRelativeTime } from '../utils/time';
import { renderRichCommentText } from '../components/CommentSection';
import { MangaCover } from '../components/MangaCover';
import { ResetProgressModal } from '../components/ResetProgressModal';

interface ProfileViewProps {
  currentUser: User | null;
  myProfile: UserProfile | null;
  staffRole: StaffRole;
  targetUserId?: string;
  bookmarks: BookmarkItem[];
  myHistory: ReadingHistoryItem[];
  notifications: NotificationItem[];
  allSeries: Series[];
  userModerationsMap: Record<string, UserModerationRecord>;
  myModeration: UserModerationRecord | null;
  onNavigate: (next: ViewRoute) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}

type ProfileTab = 'comments' | 'edit' | 'history' | 'notifications' | 'moderation';

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  myProfile,
  staffRole,
  targetUserId,
  bookmarks,
  myHistory,
  notifications,
  allSeries,
  userModerationsMap,
  myModeration,
  onNavigate,
  onOpenAuth,
  onToast,
}) => {
  const inspectUid = targetUserId || currentUser?.uid || '';
  const isOwnProfile = Boolean(currentUser && inspectUid === currentUser.uid);
  const isStaffViewer = staffRole === 'admin' || staffRole === 'moderator';

  const [inspectedProfile, setInspectedProfile] = useState<UserProfile | null>(
    isOwnProfile ? myProfile : null
  );
  const [authorComments, setAuthorComments] = useState<CommentItem[]>([]);
  const [staffTargetHistory, setStaffTargetHistory] = useState<ReadingHistoryItem[]>([]);
  const [staffTargetEmail, setStaffTargetEmail] = useState<string | null>(null);
  const [loadingTargetHistory, setLoadingTargetHistory] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTab>(isOwnProfile ? 'edit' : 'comments');

  // Cloud Profile Editor State
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [location, setLocation] = useState('');
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [readingModePref, setReadingModePref] = useState<'webtoon' | 'single'>('webtoon');
  const [chapterAlertsEnabled, setChapterAlertsEnabled] = useState(true);
  const [showReadingStatsPublic, setShowReadingStatsPublic] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // History & Notifications Management State
  const [resetModalTarget, setResetModalTarget] = useState<{
    series: Series;
    history?: ReadingHistoryItem;
  } | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [confirmClearNotifs, setConfirmClearNotifs] = useState(false);

  // Staff Moderation Controls State
  const [modStatus, setModStatus] = useState<ModerationStatus>('active');
  const [modReason, setModReason] = useState('');
  const [modDuration, setModDuration] = useState<number | 'permanent'>(24);
  const [savingMod, setSavingMod] = useState(false);

  useEffect(() => {
    setActiveTab(isOwnProfile ? 'edit' : 'comments');
  }, [inspectUid, isOwnProfile]);

  useEffect(() => {
    if (!inspectUid) return;
    const unsubProf = subscribeUserProfile(inspectUid, (p) => {
      setInspectedProfile(p);
    });
    const unsubCmts = subscribeAuthorComments(inspectUid, setAuthorComments);
    return () => {
      unsubProf();
      unsubCmts();
    };
  }, [inspectUid]);

  // Populate editor form when own profile updates
  useEffect(() => {
    if (!isOwnProfile) return;
    const src = inspectedProfile || myProfile;
    if (src) {
      setDisplayName(src.displayName || currentUser?.displayName || '');
      setUsername(src.username || '');
      setPhotoURL(src.photoURL || currentUser?.photoURL || '');
      setBannerUrl(src.bannerUrl || '');
      setBio(src.bio || '');
      setPronouns(src.pronouns || '');
      setLocation(src.location || '');
      setFavoriteGenres(src.favoriteGenres || []);
      setReadingModePref(src.readingModePref || 'webtoon');
      setChapterAlertsEnabled(src.chapterAlertsEnabled);
      setShowReadingStatsPublic(src.showReadingStatsPublic);
    } else if (currentUser) {
      setDisplayName(currentUser.displayName || currentUser.email?.split('@')[0] || '');
      setPhotoURL(currentUser.photoURL || '');
    }
  }, [isOwnProfile, inspectedProfile, myProfile, currentUser]);

  // Load reading history + private email when Staff inspects another user
  useEffect(() => {
    if (!inspectUid || isOwnProfile || !isStaffViewer) return;
    let cancelled = false;
    setLoadingTargetHistory(true);
    Promise.all([
      fetchTargetUserReadingHistory(inspectUid),
      fetchUserPrivateEmail(inspectUid),
    ])
      .then(([hist, email]) => {
        if (!cancelled) {
          setStaffTargetHistory(hist);
          setStaffTargetEmail(email);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTargetHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inspectUid, isOwnProfile, isStaffViewer]);

  const targetModeration = isOwnProfile
    ? myModeration
    : userModerationsMap[inspectUid] || null;

  useEffect(() => {
    if (targetModeration) {
      setModStatus(targetModeration.status);
      setModReason(targetModeration.reason || '');
      setModDuration(targetModeration.isPermanent ? 'permanent' : 24);
    } else {
      setModStatus('active');
      setModReason('');
      setModDuration(24);
    }
  }, [targetModeration, inspectUid]);

  const displayedHistory = isOwnProfile ? myHistory : staffTargetHistory;

  const totalChaptersReadCount = useMemo(
    () =>
      displayedHistory.reduce(
        (acc, item) => acc + (item.readChapterIds?.length || 1),
        0
      ),
    [displayedHistory]
  );

  const filteredNotifications = useMemo(() => {
    if (notifFilter === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, notifFilter]);

  if (!currentUser && !targetUserId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center mx-auto">
          <UserIcon className="w-8 h-8 text-blue-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-100">
          Your Cloud Reader Profile
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Continue with Google to customize your profile picture, display name, bio, reading preferences, notifications, and multi-device reading history.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
        >
          Continue with Google
        </button>
      </div>
    );
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const webp = await compressImageBlobToWebP(file, 420, 0.84);
      setPhotoURL(webp);
      onToast('Profile picture ready — click Save Cloud Profile to publish.');
    } catch {
      onToast('Could not process profile picture.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      const webp = await compressImageBlobToWebP(file, 1180, 0.78);
      setBannerUrl(webp);
      onToast('Profile banner ready — click Save Cloud Profile to publish.');
    } catch {
      onToast('Could not process banner image.');
    } finally {
      setUploadingBanner(false);
      e.target.value = '';
    }
  };

  const toggleGenre = (genre: string) => {
    setFavoriteGenres((prev) => {
      if (prev.includes(genre)) return prev.filter((g) => g !== genre);
      if (prev.length >= 8) {
        onToast('You can select up to 8 favorite genres.');
        return prev;
      }
      return [...prev, genre];
    });
  };

  const handleSaveCloudProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSavingProfile(true);
    try {
      await saveUserProfileCloud(currentUser, {
        displayName,
        username,
        photoURL,
        bannerUrl,
        bio,
        pronouns,
        location,
        favoriteGenres,
        readingModePref,
        chapterAlertsEnabled,
        showReadingStatsPublic,
      });
      onToast('Profile synced to Cloud!');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isStaffViewer || !inspectUid) return;
    setSavingMod(true);
    try {
      await setUserModerationCloud(currentUser, inspectUid, {
        status: modStatus,
        reason: modReason || (modStatus === 'active' ? 'Account in good standing' : 'Rule violation'),
        warningMessage: modReason,
        durationHours: modDuration,
      });
      onToast(
        modStatus === 'active'
          ? 'All sanctions lifted for this user.'
          : `Applied ${modStatus.toUpperCase()} status to user.`
      );
    } finally {
      setSavingMod(false);
    }
  };

  const activeName =
    (isOwnProfile ? displayName : inspectedProfile?.displayName) || 'MGeko Reader';
  const activeHandle = isOwnProfile ? username : inspectedProfile?.username || '';
  const activeAvatar = isOwnProfile ? photoURL : inspectedProfile?.photoURL || '';
  const activeBanner = isOwnProfile ? bannerUrl : inspectedProfile?.bannerUrl || '';
  const activeBio = isOwnProfile ? bio : inspectedProfile?.bio || '';
  const activePronouns = isOwnProfile ? pronouns : inspectedProfile?.pronouns || '';
  const activeLocation = isOwnProfile ? location : inspectedProfile?.location || '';
  const activeGenres = isOwnProfile
    ? favoriteGenres
    : inspectedProfile?.favoriteGenres || [];

  const openResetForHistoryItem = (item: ReadingHistoryItem) => {
    const foundSeries =
      allSeries.find((s) => s.id === item.seriesId) ||
      ({
        id: item.seriesId,
        visibility: 'public',
        title: item.seriesTitle,
        altTitles: [],
        synopsis: '',
        author: '',
        artist: '',
        coverUrl: item.coverUrl,
        status: 'Ongoing',
        type: 'Manhwa',
        releaseYear: 2025,
        genres: ['Action'],
        views: 1,
        ratingSum: 5,
        ratingCount: 1,
        ratingAvg: 5,
        latestChapterNum: item.lastChapterNum,
        latestChapterTitle: item.lastChapterTitle,
        chapterCount: Math.max(22, item.lastChapterNum),
        isFeatured: false,
        createdBy: '',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      } as Series);
    setResetModalTarget({ series: foundSeries, history: item });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {!isOwnProfile && (
        <button
          type="button"
          onClick={() => onNavigate({ name: isStaffViewer ? 'admin' : 'home' })}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{isStaffViewer ? 'Back to Staff Portal' : 'Back to Home'}</span>
        </button>
      )}

      {/* Moderation Warning / Sanction Banner */}
      {targetModeration && targetModeration.status !== 'active' && (
        <div
          className={`rounded-xl border p-4 flex items-start gap-3 ${
            isSanctionCurrentlyActive(targetModeration)
              ? 'bg-red-500/10 border-red-500/40 text-red-200'
              : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
          }`}
        >
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold uppercase tracking-wider">
              Account Status: {targetModeration.status}
              {targetModeration.status !== 'warned' &&
                (targetModeration.isPermanent
                  ? ' (Permanent)'
                  : ` · Until ${new Date(targetModeration.expiresAtMs).toLocaleString()}`)}
            </p>
            {targetModeration.reason && (
              <p className="opacity-90">Reason: {targetModeration.reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Profile Hero Card */}
      <div className="rounded-2xl bg-[#131822] border border-slate-800 overflow-hidden">
        {/* Banner */}
        <div className="relative h-36 sm:h-48 bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/70 overflow-hidden">
          {activeBanner && (
            <img
              src={activeBanner}
              alt="Profile banner"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#131822] via-transparent to-black/20" />

          {isOwnProfile && (
            <label className="absolute top-3 right-3 h-8 px-3 rounded-lg bg-black/65 hover:bg-black/85 border border-white/15 text-xs font-medium text-slate-100 inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm transition-colors">
              {uploadingBanner ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              ) : (
                <ImagePlus className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span>Change Banner</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleBannerUpload}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Avatar + Bio + Stats */}
        <div className="px-5 sm:px-7 pb-6 -mt-12 sm:-mt-14 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="relative shrink-0">
                {activeAvatar ? (
                  <img
                    src={activeAvatar}
                    alt={activeName}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-[#131822] bg-[#0B0E14] shadow-xl"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-[#131822] bg-blue-600/20 text-blue-400 font-display text-3xl font-bold flex items-center justify-center uppercase shadow-xl">
                    {activeName.slice(0, 1)}
                  </div>
                )}

                {isOwnProfile && (
                  <label
                    title="Upload profile picture"
                    className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg cursor-pointer transition-colors"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="pb-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-100 truncate">
                    {activeName}
                  </h1>
                  {isOwnProfile && staffRole !== 'user' && (
                    <span className="text-xs font-mono uppercase tracking-wider text-blue-400">
                      · {staffRole}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 text-xs text-slate-400 flex-wrap mt-0.5">
                  {activeHandle && <span className="font-mono">@{activeHandle}</span>}
                  {activePronouns && <span>· {activePronouns}</span>}
                  {activeLocation && (
                    <span className="inline-flex items-center gap-1">
                      · <MapPin className="w-3 h-3 text-slate-500" />
                      {activeLocation}
                    </span>
                  )}
                  {isStaffViewer && !isOwnProfile && staffTargetEmail && (
                    <span className="font-mono text-blue-400">· {staffTargetEmail}</span>
                  )}
                </div>
              </div>
            </div>

            {isOwnProfile && (
              <button
                type="button"
                onClick={async () => {
                  await signOut(auth);
                  onToast('Signed out.');
                  onNavigate({ name: 'home' });
                }}
                className="h-9 px-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-red-400 inline-flex items-center gap-1.5 self-start sm:self-end transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>

          {activeBio && (
            <p className="mt-4 text-xs sm:text-sm text-slate-300 max-w-3xl whitespace-pre-line leading-relaxed">
              {activeBio}
            </p>
          )}

          {activeGenres.length > 0 && (
            <p className="mt-3 text-xs text-slate-400">
              <span className="text-slate-500 mr-1.5">Favorite Genres:</span>
              <span className="text-slate-200">{activeGenres.join(' · ')}</span>
            </p>
          )}

          {/* Key Reader Metrics */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="font-mono tabular-nums font-bold text-slate-100 text-sm">
                {authorComments.length}
              </span>{' '}
              <span className="text-slate-400">Comments Posted</span>
            </div>

            {(isOwnProfile ||
              isStaffViewer ||
              inspectedProfile?.showReadingStatsPublic !== false) && (
              <>
                {isOwnProfile && (
                  <div>
                    <span className="font-mono tabular-nums font-bold text-slate-100 text-sm">
                      {bookmarks.length}
                    </span>{' '}
                    <span className="text-slate-400">Bookmarked Series</span>
                  </div>
                )}
                {(isOwnProfile || isStaffViewer) && (
                  <div>
                    <span className="font-mono tabular-nums font-bold text-slate-100 text-sm">
                      {totalChaptersReadCount}
                    </span>{' '}
                    <span className="text-slate-400">Chapters Read</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800/80">
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`h-10 px-4 rounded-t-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors ${
              activeTab === 'edit'
                ? 'border-blue-500 text-blue-400 bg-blue-600/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            <span>Profile Settings</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          className={`h-10 px-4 rounded-t-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'comments'
              ? 'border-blue-500 text-blue-400 bg-blue-600/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="tabular-nums">Comment History ({authorComments.length})</span>
        </button>

        {(isOwnProfile || isStaffViewer) && (
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`h-10 px-4 rounded-t-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-400 bg-blue-600/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="tabular-nums">
              {isOwnProfile ? 'Reading History & Re-Read' : 'User Reading History'} (
              {displayedHistory.length})
            </span>
          </button>
        )}

        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`h-10 px-4 rounded-t-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors ${
              activeTab === 'notifications'
                ? 'border-blue-500 text-blue-400 bg-blue-600/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span className="tabular-nums">Notifications ({notifications.length})</span>
          </button>
        )}

        {isStaffViewer && !isOwnProfile && (
          <button
            type="button"
            onClick={() => setActiveTab('moderation')}
            className={`h-10 px-4 rounded-t-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors ${
              activeTab === 'moderation'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gavel className="w-4 h-4" />
            <span>Ban & Punishments</span>
          </button>
        )}
      </div>

      {/* TAB 1: EDIT CLOUD PROFILE */}
      {isOwnProfile && activeTab === 'edit' && (
        <form
          onSubmit={handleSaveCloudProfile}
          className="rounded-2xl bg-[#131822] border border-slate-800 p-5 sm:p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-100">
                Customize Cloud Profile
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                All profile changes sync in real time across every device where you sign in.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-center transition-colors"
            >
              {savingProfile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{savingProfile ? 'Saving to Cloud...' : 'Save Cloud Profile'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Display Name</label>
              <input
                type="text"
                required
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your reader display name"
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Username (@handle)</label>
              <input
                type="text"
                maxLength={40}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. shadow_monarch"
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Pronouns</label>
              <input
                type="text"
                maxLength={40}
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                placeholder="e.g. he/him, she/her, they/them"
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Location</label>
              <input
                type="text"
                maxLength={80}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Tokyo · Seoul · Global"
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Profile Picture URL (or click camera icon above to upload)
              </label>
              <input
                type="text"
                value={photoURL.startsWith('data:') ? '' : photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder={
                  photoURL.startsWith('data:')
                    ? 'Custom uploaded image active (paste URL to replace)'
                    : 'https://...'
                }
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Profile Banner URL (or click Change Banner above to upload)
              </label>
              <input
                type="text"
                value={bannerUrl.startsWith('data:') ? '' : bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                placeholder={
                  bannerUrl.startsWith('data:')
                    ? 'Custom uploaded banner active (paste URL to replace)'
                    : 'https://...'
                }
                className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              About / Reader Bio ({bio.length}/600)
            </label>
            <textarea
              rows={3}
              maxLength={600}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell fellow readers what manga, manhwa, or manhua worlds you love..."
              className="w-full p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Favorite Genres */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Favorite Genres (Select up to 8)
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_GENRES.map((genre) => {
                const selected = favoriteGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
                      selected
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-[#0B0E14] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cloud Preferences */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
            <div className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 space-y-2">
              <span className="block text-xs font-semibold text-slate-200">
                Default Chapter Reader Mode
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setReadingModePref('webtoon')}
                  className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                    readingModePref === 'webtoon'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Webtoon Strip
                </button>
                <button
                  type="button"
                  onClick={() => setReadingModePref('single')}
                  className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                    readingModePref === 'single'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Single Page
                </button>
              </div>
            </div>

            <label className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="block text-xs font-semibold text-slate-200">
                  New Chapter Cloud Alerts
                </span>
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Notify when bookmarked series release chapters
                </span>
              </div>
              <input
                type="checkbox"
                checked={chapterAlertsEnabled}
                onChange={(e) => setChapterAlertsEnabled(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>

            <label className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="block text-xs font-semibold text-slate-200">
                  Public Reading Statistics
                </span>
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Show read count on your public profile
                </span>
              </div>
              <input
                type="checkbox"
                checked={showReadingStatsPublic}
                onChange={(e) => setShowReadingStatsPublic(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>
          </div>
        </form>
      )}

      {/* TAB 2: COMMENT HISTORY */}
      {activeTab === 'comments' && (
        <div className="rounded-2xl bg-[#131822] border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-100">
              Comment History ({authorComments.length})
            </h2>
            <span className="text-xs text-slate-400">Sorted newest first</span>
          </div>

          {authorComments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No comments posted yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {authorComments.map((c) => (
                <div key={c.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          c.chapterId
                            ? onNavigate({
                                name: 'reader',
                                seriesId: c.seriesId,
                                chapterId: c.chapterId,
                              })
                            : onNavigate({ name: 'series', seriesId: c.seriesId })
                        }
                        className="font-semibold text-blue-400 hover:underline"
                      >
                        {c.seriesTitle || c.seriesId}
                        {c.chapterId ? ' · Chapter Discussion' : ''}
                      </button>
                      <span className="text-slate-500 font-mono tabular-nums">
                        · {formatRelativeTime(c.createdAtMs)}
                      </span>
                      {c.isEdited && (
                        <span className="text-[11px] text-slate-500 italic">(edited)</span>
                      )}
                    </div>

                    {(isOwnProfile || isStaffViewer) && (
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteCloudComment(c.id);
                          onToast('Comment deleted.');
                        }}
                        className="text-xs text-slate-500 hover:text-red-400 inline-flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>

                  {c.content && (
                    <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-line leading-relaxed">
                      {renderRichCommentText(c.content)}
                    </p>
                  )}

                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt="Comment attachment"
                      referrerPolicy="no-referrer"
                      className="max-h-44 rounded-lg border border-slate-800 object-contain"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: READING HISTORY & RE-READ PROGRESS RESET */}
      {(isOwnProfile || isStaffViewer) && activeTab === 'history' && (
        <div className="rounded-2xl bg-[#131822] border border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-100">
                {isOwnProfile ? 'Manage Reading History & Re-Read Progress' : 'User Reading History'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isOwnProfile
                  ? 'Reset any series back to Chapter 1, Chapter 2, or any chapter to enjoy a fresh re-read.'
                  : 'Cloud-synced series and chapter progress for this account.'}
              </p>
            </div>

            {isOwnProfile && displayedHistory.length > 0 && (
              <div>
                {confirmClearHistory ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!currentUser) return;
                        await clearAllReadingHistoryCloud(currentUser.uid, displayedHistory);
                        setConfirmClearHistory(false);
                        onToast('Cleared all reading history.');
                      }}
                      className="h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold"
                    >
                      Confirm Clear All
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearHistory(false)}
                      className="h-8 px-2.5 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearHistory(true)}
                    className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-red-400 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All History</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {loadingTargetHistory ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span>Loading reading history...</span>
            </div>
          ) : displayedHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No reading history recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedHistory.map((item) => (
                <div
                  key={item.seriesId}
                  className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onNavigate({ name: 'series', seriesId: item.seriesId })}
                      className="w-12 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-800"
                    >
                      <MangaCover
                        src={item.coverUrl}
                        title={item.seriesTitle}
                        className="w-full h-full"
                      />
                    </button>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onNavigate({ name: 'series', seriesId: item.seriesId })}
                        className="text-sm font-semibold text-slate-100 hover:text-blue-400 truncate block text-left"
                      >
                        {item.seriesTitle}
                      </button>
                      <p className="text-xs text-blue-400 font-mono tabular-nums mt-0.5">
                        Progress: Ch. {item.lastChapterNum} · {item.readChapterIds.length} chapters read
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono tabular-nums">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(item.updatedAtMs)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          name: 'reader',
                          seriesId: item.seriesId,
                          chapterId: item.lastChapterId,
                        })
                      }
                      className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Resume Ch. {item.lastChapterNum}</span>
                    </button>

                    {isOwnProfile && currentUser && (
                      <>
                        <button
                          type="button"
                          onClick={() => openResetForHistoryItem(item)}
                          className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                          <span>Reset / Re-Read</span>
                        </button>
                        <button
                          type="button"
                          title="Delete from reading history"
                          onClick={async () => {
                            await deleteSeriesReadingHistoryCloud(currentUser.uid, item.seriesId);
                            onToast(`Removed ${item.seriesTitle} from history.`);
                          }}
                          className="h-8 w-8 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: NOTIFICATIONS MANAGER */}
      {isOwnProfile && currentUser && activeTab === 'notifications' && (
        <div className="rounded-2xl bg-[#131822] border border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotifFilter('all')}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  notifFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#0B0E14] text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setNotifFilter('unread')}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                  notifFilter === 'unread'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#0B0E14] text-slate-400 hover:text-slate-200'
                }`}
              >
                Unread ({notifications.filter((n) => !n.isRead).length})
              </button>
            </div>

            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => markAllCloudNotificationsRead(currentUser.uid, notifications)}
                  className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 text-blue-400" />
                  <span>Mark All Read</span>
                </button>
                {confirmClearNotifs ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        await clearAllCloudNotifications(currentUser.uid, notifications);
                        setConfirmClearNotifs(false);
                        onToast('All notifications cleared.');
                      }}
                      className="h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold"
                    >
                      Confirm Clear All
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearNotifs(false)}
                      className="h-8 px-2 text-xs text-slate-400"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearNotifs(true)}
                    className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-red-400 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No notifications in this view.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                    n.isRead
                      ? 'bg-[#0B0E14]/60 border-slate-800/70'
                      : 'bg-blue-600/10 border-blue-500/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      if (!n.isRead) {
                        await setCloudNotificationReadState(currentUser.uid, n.id, true);
                      }
                      onNavigate({
                        name: 'reader',
                        seriesId: n.seriesId,
                        chapterId: n.chapterId,
                      });
                    }}
                    className="text-left min-w-0 flex-1"
                  >
                    <p className="text-xs sm:text-sm font-medium text-slate-100">{n.message}</p>
                    <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                      {formatRelativeTime(n.createdAtMs)}
                    </p>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setCloudNotificationReadState(currentUser.uid, n.id, !n.isRead)
                      }
                      className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 whitespace-nowrap transition-colors"
                    >
                      {n.isRead ? 'Mark Unread' : 'Mark Read'}
                    </button>
                    <button
                      type="button"
                      title="Delete notification"
                      onClick={() => deleteCloudNotification(currentUser.uid, n.id)}
                      className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: STAFF MODERATION & PUNISHMENTS ON USER PROFILE */}
      {isStaffViewer && !isOwnProfile && activeTab === 'moderation' && (
        <form
          onSubmit={handleSaveModeration}
          className="rounded-2xl bg-[#131822] border border-slate-800 p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-slate-100">
                User Moderation & Punishments
              </h2>
              <p className="text-xs text-slate-400">
                Issue warnings, temporary mutes/suspensions, or permanent bans for rule violations.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Action / Status</label>
              <select
                value={modStatus}
                onChange={(e) => setModStatus(e.target.value as ModerationStatus)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="active">Active (Good Standing / Lift Punishments)</option>
                <option value="warned">Official Warning Banner</option>
                <option value="muted">Muted (Cannot Comment or Like)</option>
                <option value="suspended">Suspended (Account Restricted)</option>
                <option value="banned">Banned</option>
              </select>
            </div>

            {['muted', 'suspended', 'banned'].includes(modStatus) && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Duration</label>
                <select
                  value={String(modDuration)}
                  onChange={(e) =>
                    setModDuration(
                      e.target.value === 'permanent' ? 'permanent' : Number(e.target.value)
                    )
                  }
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="1">1 Hour</option>
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="168">7 Days</option>
                  <option value="720">30 Days</option>
                  <option value="permanent">Permanent</option>
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Reason / Moderation Note (Visible to User)
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={modReason}
              onChange={(e) => setModReason(e.target.value)}
              placeholder="Explain the rule violation or warning clearly..."
              className="w-full p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={savingMod}
            className="h-10 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {savingMod ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Gavel className="w-4 h-4" />
            )}
            <span>{savingMod ? 'Updating...' : 'Apply Moderation Decision'}</span>
          </button>
        </form>
      )}

      {resetModalTarget && currentUser && (
        <ResetProgressModal
          series={resetModalTarget.series}
          currentHistory={resetModalTarget.history}
          user={currentUser}
          onClose={() => setResetModalTarget(null)}
          onToast={onToast}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
};
