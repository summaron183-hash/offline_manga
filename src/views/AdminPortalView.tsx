import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  CloudUpload,
  Edit3,
  ExternalLink,
  FileArchive,
  Flag,
  FolderPlus,
  Gavel,
  History,
  Layers,
  Loader2,
  Mail,
  MessageSquareWarning,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { MangaCover } from '../components/MangaCover';
import { SearchableSeriesSelect } from '../components/SearchableSeriesSelect';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { BOOTSTRAP_ADMIN_EMAIL } from '../firebase';
import {
  compressImageBlobToWebP,
  deleteChapterFromCloud,
  deleteCloudComment,
  deleteContentReport,
  deleteSeriesFromCloud,
  fetchTargetUserReadingHistory,
  fetchUserPrivateEmail,
  isSanctionCurrentlyActive,
  publishChapterToCloud,
  removeStaffMemberByGmail,
  saveSeriesMetadataCloud,
  saveSiteSettingsCloud,
  seedFullStarterCatalogToCloud,
  setUserModerationCloud,
  subscribeAllUserModerations,
  subscribeAllUserProfiles,
  subscribeContentReports,
  subscribeSeriesChapters,
  subscribeSeriesComments,
  subscribeStaffDirectory,
  unpackChapterZipFile,
  updateContentReportStatus,
  upsertStaffMemberByGmail,
} from '../services/cloudService';
import {
  ALL_GENRES,
  Chapter,
  CommentItem,
  ContentReportItem,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_UI_COPY,
  MangaStatus,
  MangaType,
  ModerationStatus,
  ReadingHistoryItem,
  Series,
  StaffEntry,
  StaffRole,
  THEME_PRESETS,
  UserModerationRecord,
  UserProfile,
  ViewRoute,
} from '../types';
import { formatRelativeTime } from '../utils/time';

interface AdminPortalViewProps {
  user: User | null;
  staffRole: StaffRole;
  allSeries: Series[];
  onNavigate: (next: ViewRoute) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}

type PortalTab = 'zip-upload' | 'series-form' | 'users' | 'management' | 'site-settings';

const UI_COPY_LABELS: Array<{ key: string; label: string }> = [
  { key: 'nav_home', label: 'Nav: Home' },
  { key: 'nav_directory', label: 'Nav: Manga List' },
  { key: 'nav_updates', label: 'Nav: Updates' },
  { key: 'nav_library', label: 'Nav: Library' },
  { key: 'nav_downloads', label: 'Nav: Downloads' },
  { key: 'nav_profile', label: 'Nav: Profile' },
  { key: 'nav_portal', label: 'Nav: Portal' },
  { key: 'search_placeholder', label: 'Header Search Placeholder' },
  { key: 'auth_signin', label: 'Header Sign In Button' },
  { key: 'hero_badge', label: 'Hero Spotlight Label' },
  { key: 'hero_read_now', label: 'Hero Read Now Button' },
  { key: 'hero_details', label: 'Hero Series Details Button' },
  { key: 'home_popular_title', label: 'Home: Popular Heading' },
  { key: 'home_popular_subtitle', label: 'Home: Popular Subtitle' },
  { key: 'home_latest_title', label: 'Home: Latest Releases Heading' },
  { key: 'home_latest_subtitle', label: 'Home: Latest Releases Subtitle' },
  { key: 'home_view_all_updates', label: 'Home: View All Updates Link' },
  { key: 'home_genres_title', label: 'Sidebar: Browse Genres Heading' },
  { key: 'home_leaderboard_title', label: 'Sidebar: Leaderboard Heading' },
  { key: 'series_synopsis_title', label: 'Series Page: Synopsis Heading' },
  { key: 'series_chapters_title', label: 'Series Page: Chapters Heading' },
  { key: 'series_comments_title', label: 'Series Page: Comments Heading' },
  { key: 'reader_report_chapter', label: 'Reader: Report Chapter Button' },
  { key: 'reader_chapter_discussion', label: 'Reader: Chapter Discussion Heading' },
];

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  user,
  staffRole,
  allSeries,
  onNavigate,
  onOpenAuth,
  onToast,
}) => {
  const { settings, setLiveTextEditMode } = useSiteSettings();

  const isAdmin = staffRole === 'admin';
  const isStaff = staffRole === 'admin' || staffRole === 'moderator';
  const hasPortalAccess = Boolean(user && isStaff);

  const [activeTab, setActiveTab] = useState<PortalTab>('zip-upload');

  // Ensure moderators never land on admin-only tabs
  useEffect(() => {
    if (!isAdmin && (activeTab === 'management' || activeTab === 'site-settings')) {
      setActiveTab('zip-upload');
    }
  }, [isAdmin, activeTab]);

  // =========================================================================
  // 1. CHAPTER & ZIP UPLOADER STATE (Search-Then-Select Series Combobox)
  // =========================================================================
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(allSeries[0]?.id || '');
  const [chapterNum, setChapterNum] = useState<string>(
    String((allSeries[0]?.latestChapterNum || 22) + 1)
  );
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [externalUrlsText, setExternalUrlsText] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
    stage: string;
  } | null>(null);

  // =========================================================================
  // 2. ADD / EDIT SERIES STATE
  // =========================================================================
  const [editingSeriesId, setEditingSeriesId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [altTitlesRaw, setAltTitlesRaw] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [author, setAuthor] = useState('');
  const [artist, setArtist] = useState('');
  const [status, setStatus] = useState<MangaStatus>('Ongoing');
  const [type, setType] = useState<MangaType>('Manhwa');
  const [releaseYear, setReleaseYear] = useState<number>(2026);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Action', 'Fantasy']);
  const [isFeatured, setIsFeatured] = useState<boolean>(false);
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [seriesSaving, setSeriesSaving] = useState(false);

  // =========================================================================
  // 3. USER MANAGEMENT & CONTENT REPORTS STATE (Admin & Moderator)
  // =========================================================================
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [allComments, setAllComments] = useState<CommentItem[]>([]);
  const [moderationsMap, setModerationsMap] = useState<Record<string, UserModerationRecord>>({});
  const [reports, setReports] = useState<ContentReportItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [reportFilter, setReportFilter] = useState<'open' | 'all'>('open');

  // Inline Reading History & Punishment Inspector Modal
  const [historyInspectUser, setHistoryInspectUser] = useState<UserProfile | null>(null);
  const [inspectedUserHistory, setInspectedUserHistory] = useState<ReadingHistoryItem[]>([]);
  const [inspectedUserEmail, setInspectedUserEmail] = useState<string | null>(null);
  const [loadingUserHistory, setLoadingUserHistory] = useState(false);

  const [punishTargetUser, setPunishTargetUser] = useState<UserProfile | null>(null);
  const [punishStatus, setPunishStatus] = useState<ModerationStatus>('warned');
  const [punishDuration, setPunishDuration] = useState<number | 'permanent'>(24);
  const [punishReason, setPunishReason] = useState('');
  const [savingPunishment, setSavingPunishment] = useState(false);

  // =========================================================================
  // 4. ADMIN-ONLY: STAFF ROLES BY GMAIL & CATALOG MANAGEMENT
  // =========================================================================
  const [staffEntries, setStaffEntries] = useState<StaffEntry[]>([]);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'moderator' | 'admin'>('moderator');
  const [savingStaff, setSavingStaff] = useState(false);

  const [inspectSeriesId, setInspectSeriesId] = useState<string>(allSeries[0]?.id || '');
  const [inspectChapters, setInspectChapters] = useState<Chapter[]>([]);
  const [confirmDeleteSeriesId, setConfirmDeleteSeriesId] = useState<string | null>(null);
  const [seedProgress, setSeedProgress] = useState<{ done: number; total: number } | null>(null);

  // =========================================================================
  // 5. ADMIN-ONLY: SITE SETTINGS (THEME, NAME, LOGO, ANY TEXT)
  // =========================================================================
  const [siteName, setSiteName] = useState(settings.siteName);
  const [siteTagline, setSiteTagline] = useState(settings.siteTagline);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl);
  const [announcementBanner, setAnnouncementBanner] = useState(settings.announcementBanner);
  const [themePreset, setThemePreset] = useState(settings.themePreset);
  const [bgCanvasHex, setBgCanvasHex] = useState(settings.bgCanvasHex);
  const [bgSurfaceHex, setBgSurfaceHex] = useState(settings.bgSurfaceHex);
  const [accentHex, setAccentHex] = useState(settings.accentHex);
  const [textPrimaryHex, setTextPrimaryHex] = useState(settings.textPrimaryHex);
  const [uiCopyDraft, setUiCopyDraft] = useState<Record<string, string>>(settings.uiCopy);
  const [textReplacementsDraft, setTextReplacementsDraft] = useState<string[]>(
    settings.textReplacements
  );
  const [findFromText, setFindFromText] = useState('');
  const [replaceToText, setReplaceToText] = useState('');
  const [savingSiteSettings, setSavingSiteSettings] = useState(false);

  useEffect(() => {
    setSiteName(settings.siteName);
    setSiteTagline(settings.siteTagline);
    setLogoUrl(settings.logoUrl);
    setAnnouncementBanner(settings.announcementBanner);
    setThemePreset(settings.themePreset);
    setBgCanvasHex(settings.bgCanvasHex);
    setBgSurfaceHex(settings.bgSurfaceHex);
    setAccentHex(settings.accentHex);
    setTextPrimaryHex(settings.textPrimaryHex);
    setUiCopyDraft(settings.uiCopy);
    setTextReplacementsDraft(settings.textReplacements);
  }, [settings]);

  useEffect(() => {
    if (!selectedSeriesId && allSeries.length > 0) {
      setSelectedSeriesId(allSeries[0].id);
      setChapterNum(String(allSeries[0].latestChapterNum + 1));
    }
    if (!inspectSeriesId && allSeries.length > 0) {
      setInspectSeriesId(allSeries[0].id);
    }
  }, [allSeries, selectedSeriesId, inspectSeriesId]);

  useEffect(() => {
    if (!hasPortalAccess) return;
    const unsubUsers = subscribeAllUserProfiles(setUserProfiles);
    const unsubComments = subscribeSeriesComments(null, setAllComments);
    const unsubMods = subscribeAllUserModerations(setModerationsMap);
    const unsubReports = subscribeContentReports(setReports);
    return () => {
      unsubUsers();
      unsubComments();
      unsubMods();
      unsubReports();
    };
  }, [hasPortalAccess]);

  useEffect(() => {
    if (!hasPortalAccess || !isAdmin) return;
    const unsubStaff = subscribeStaffDirectory(setStaffEntries);
    return () => unsubStaff();
  }, [hasPortalAccess, isAdmin]);

  useEffect(() => {
    if (!hasPortalAccess || !isAdmin || !inspectSeriesId) return;
    const unsub = subscribeSeriesChapters(inspectSeriesId, setInspectChapters);
    return () => unsub();
  }, [hasPortalAccess, isAdmin, inspectSeriesId]);

  // Exact comment counts per author
  const commentCountByAuthor = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of allComments) {
      map[c.authorId] = (map[c.authorId] || 0) + 1;
    }
    return map;
  }, [allComments]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return userProfiles;
    return userProfiles.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [userProfiles, userSearch]);

  const openReportsCount = useMemo(
    () => reports.filter((r) => r.status === 'open').length,
    [reports]
  );

  const visibleReports = useMemo(
    () => (reportFilter === 'open' ? reports.filter((r) => r.status === 'open') : reports),
    [reports, reportFilter]
  );

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const loadSeriesIntoEditor = (s: Series) => {
    setEditingSeriesId(s.id);
    setTitle(s.title);
    setAltTitlesRaw(s.altTitles.join(', '));
    setSynopsis(s.synopsis);
    setAuthor(s.author);
    setArtist(s.artist);
    setStatus(s.status);
    setType(s.type);
    setReleaseYear(s.releaseYear);
    setSelectedGenres(s.genres);
    setIsFeatured(s.isFeatured);
    setCoverUrl(s.coverUrl);
    setActiveTab('series-form');
  };

  const resetSeriesForm = () => {
    setEditingSeriesId('');
    setTitle('');
    setAltTitlesRaw('');
    setSynopsis('');
    setAuthor('');
    setArtist('');
    setStatus('Ongoing');
    setType('Manhwa');
    setReleaseYear(2026);
    setSelectedGenres(['Action']);
    setIsFeatured(false);
    setCoverUrl('');
  };

  const handleCoverFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageBlobToWebP(file, 720, 0.82);
    setCoverUrl(compressed);
    onToast('Cover image compressed to WebP.');
  };

  const handleSaveSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.emailVerified) {
      onOpenAuth();
      return;
    }
    if (!coverUrl.trim()) {
      onToast('Please upload a cover image or enter a cover URL.');
      return;
    }
    setSeriesSaving(true);
    try {
      const id = await saveSeriesMetadataCloud(user, {
        existingId: editingSeriesId || undefined,
        title,
        altTitles: altTitlesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        synopsis,
        author,
        artist: artist || author,
        coverUrl,
        status,
        type,
        releaseYear,
        genres: selectedGenres,
        isFeatured,
      });
      onToast(editingSeriesId ? 'Series updated in Cloud!' : 'New series published to Cloud!');
      setSelectedSeriesId(id);
      resetSeriesForm();
    } finally {
      setSeriesSaving(false);
    }
  };

  const handlePublishChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.emailVerified) {
      onOpenAuth();
      return;
    }
    const targetSeries = allSeries.find((s) => s.id === selectedSeriesId);
    if (!targetSeries) {
      onToast('Select a target manga series first.');
      return;
    }
    const parsedNum = Number(chapterNum);
    if (Number.isNaN(parsedNum) || parsedNum < 0) {
      onToast('Enter a valid chapter number.');
      return;
    }

    let pagesToUpload: string[] = [];
    setUploadProgress({ done: 0, total: 1, stage: 'Preparing chapter assets...' });
    try {
      if (zipFile) {
        pagesToUpload = await unpackChapterZipFile(zipFile, (done, total, stage) =>
          setUploadProgress({ done, total, stage })
        );
      } else if (imageFiles.length > 0) {
        const sortedFiles = [...imageFiles].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        for (let i = 0; i < sortedFiles.length; i++) {
          setUploadProgress({
            done: i + 1,
            total: sortedFiles.length,
            stage: `Compressing ${sortedFiles[i].name}...`,
          });
          pagesToUpload.push(await compressImageBlobToWebP(sortedFiles[i], 1050, 0.78));
        }
      } else if (externalUrlsText.trim()) {
        pagesToUpload = externalUrlsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }

      if (pagesToUpload.length === 0) {
        onToast('Attach a chapter .ZIP archive, select image files, or enter page image URLs.');
        setUploadProgress(null);
        return;
      }

      const newChapterId = await publishChapterToCloud(
        user,
        targetSeries,
        parsedNum,
        chapterTitle,
        pagesToUpload,
        (done, total, stage) => setUploadProgress({ done, total, stage })
      );

      setZipFile(null);
      setImageFiles([]);
      setExternalUrlsText('');
      setChapterTitle('');
      setChapterNum(String(parsedNum + 1));
      onToast(
        `Chapter ${parsedNum} (${pagesToUpload.length} pages) published to Cloud & subscribers notified!`
      );
      onNavigate({ name: 'reader', seriesId: targetSeries.id, chapterId: newChapterId });
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Chapter upload failed.');
    } finally {
      setUploadProgress(null);
    }
  };

  const openUserHistoryModal = async (u: UserProfile) => {
    setHistoryInspectUser(u);
    setLoadingUserHistory(true);
    setInspectedUserHistory([]);
    setInspectedUserEmail(null);
    try {
      const [hist, email] = await Promise.all([
        fetchTargetUserReadingHistory(u.uid),
        fetchUserPrivateEmail(u.uid),
      ]);
      setInspectedUserHistory(hist);
      setInspectedUserEmail(email);
    } finally {
      setLoadingUserHistory(false);
    }
  };

  const openPunishModal = (u: UserProfile) => {
    const existing = moderationsMap[u.uid];
    setPunishTargetUser(u);
    setPunishStatus(existing ? existing.status : 'warned');
    setPunishDuration(existing?.isPermanent ? 'permanent' : 24);
    setPunishReason(existing?.reason || '');
  };

  const handleApplyPunishment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !punishTargetUser) return;
    setSavingPunishment(true);
    try {
      await setUserModerationCloud(user, punishTargetUser.uid, {
        status: punishStatus,
        reason:
          punishReason ||
          (punishStatus === 'active' ? 'Sanctions lifted' : 'Community rule violation'),
        warningMessage: punishReason,
        durationHours: punishDuration,
      });
      onToast(
        punishStatus === 'active'
          ? `Lifted sanctions for ${punishTargetUser.displayName}.`
          : `Updated ${punishTargetUser.displayName} to ${punishStatus.toUpperCase()}.`
      );
      setPunishTargetUser(null);
    } finally {
      setSavingPunishment(false);
    }
  };

  const handleAddStaffByGmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;
    setSavingStaff(true);
    try {
      await upsertStaffMemberByGmail(user, newStaffEmail, newStaffRole, staffEntries);
      onToast(`Granted ${newStaffRole.toUpperCase()} access to ${newStaffEmail.trim().toLowerCase()}!`);
      setNewStaffEmail('');
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not update staff Gmail.');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webp = await compressImageBlobToWebP(file, 360, 0.88);
      setLogoUrl(webp);
      onToast('Logo image prepared — click Save Site Settings to publish.');
    } catch {
      onToast('Could not process logo file.');
    } finally {
      e.target.value = '';
    }
  };

  const applyThemePreset = (presetId: string) => {
    const found = THEME_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setThemePreset(found.id);
    setBgCanvasHex(found.bgCanvasHex);
    setBgSurfaceHex(found.bgSurfaceHex);
    setAccentHex(found.accentHex);
    setTextPrimaryHex(found.textPrimaryHex);
  };

  const handleAddTextReplacementRule = () => {
    const from = findFromText.trim();
    const to = replaceToText;
    if (!from) return;
    const filtered = textReplacementsDraft.filter((r) => !r.startsWith(`${from}:::`));
    setTextReplacementsDraft([`${from}:::${to}`, ...filtered]);
    setFindFromText('');
    setReplaceToText('');
  };

  const handleSaveSiteSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;
    setSavingSiteSettings(true);
    try {
      await saveSiteSettingsCloud(user, {
        siteName,
        siteTagline,
        logoUrl,
        announcementBanner,
        themePreset,
        bgCanvasHex,
        bgSurfaceHex,
        accentHex,
        textPrimaryHex,
        uiCopy: uiCopyDraft,
        textReplacements: textReplacementsDraft,
      });
      onToast('Site theme, branding, and custom copy published globally!');
    } finally {
      setSavingSiteSettings(false);
    }
  };

  // =========================================================================
  // UNAUTHORIZED GUARD
  // =========================================================================
  if (!hasPortalAccess) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 pb-24">
        <div className="bg-[#131822] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-bold text-slate-100">
            Authorized Staff Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Portal access is restricted to verified Administrator and Moderator Gmail accounts. Normal readers can customize their account and manage history inside Profile.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold transition-colors"
              >
                Continue with Google
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate({ name: 'profile' })}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold transition-colors"
              >
                Open My Profile
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate({ name: 'home' })}
              className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium transition-colors"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
      {/* Portal Top Header + Role-Scoped Navigation */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-blue-400 font-semibold mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {isAdmin ? 'Verified Cloud Administrator' : 'Verified Cloud Moderator'} ·{' '}
              {user?.email}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
            {settings.siteName || 'MGeko'} Staff Portal
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#131822] border border-slate-800 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setActiveTab('zip-upload')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'zip-upload'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>Upload Chapter</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('series-form')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'series-form'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{editingSeriesId ? 'Edit Series' : 'Add Series'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              User Management{openReportsCount > 0 ? ` (${openReportsCount})` : ''}
            </span>
          </button>

          {/* Strictly Admin-Only Tabs (Hidden for Moderators) */}
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('management')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'management'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Management & Staff</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('site-settings')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'site-settings'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Site Settings</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: CHAPTER & ZIP UPLOADER (Search-Then-Select Series Combobox)
         ===================================================================== */}
      {activeTab === 'zip-upload' && (
        <form
          onSubmit={handlePublishChapter}
          className="bg-[#131822] border border-slate-800/80 rounded-2xl p-6 sm:p-8 space-y-6 max-w-3xl"
        >
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Upload Chapter Archive (.ZIP) or Image Set
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Click the series dropdown below to search and select your target manga series, then attach a chapter ZIP or image set.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Manga Series (Click to Search & Select)
              </label>
              <SearchableSeriesSelect
                allSeries={allSeries}
                selectedSeriesId={selectedSeriesId}
                onSelect={(s) => {
                  setSelectedSeriesId(s.id);
                  setChapterNum(String(s.latestChapterNum + 1));
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Chapter Number
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                required
                value={chapterNum}
                onChange={(e) => setChapterNum(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Chapter Title (Optional)
            </label>
            <input
              type="text"
              maxLength={200}
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder="e.g. Awakening at the Crimson Gate"
              className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-dashed border-slate-700 hover:border-blue-500/70 transition-colors space-y-3">
            <div className="flex items-center gap-3">
              <FileArchive className="w-6 h-6 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  Option A — Chapter Image .ZIP Archive (Recommended)
                </p>
                <p className="text-xs text-slate-400">
                  Contains numbered `.jpg`, `.png`, or `.webp` scans (`001.jpg`, `002.jpg`, ...)
                </p>
              </div>
            </div>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setZipFile(f);
                if (f) setImageFiles([]);
              }}
              className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500"
            />
            {zipFile && (
              <p className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ready to unpack: {zipFile.name}
              </p>
            )}
          </div>

          <div className="p-5 rounded-2xl bg-[#0B0E14] border border-slate-800 space-y-2.5">
            <p className="text-xs font-semibold text-slate-200">
              Option B — Select Multiple Image Files Directly
            </p>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files: File[] = Array.from(e.target.files || []);
                setImageFiles(files);
                if (files.length > 0) setZipFile(null);
              }}
              className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
            />
            {imageFiles.length > 0 && (
              <p className="text-xs text-emerald-400">
                {imageFiles.length} image files queued for WebP processing.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Option C — Or Paste External CDN Image URLs (One URL per line)
            </label>
            <textarea
              rows={3}
              value={externalUrlsText}
              onChange={(e) => setExternalUrlsText(e.target.value)}
              placeholder="https://cdn.example.com/manga/ch23/001.webp&#10;https://cdn.example.com/manga/ch23/002.webp"
              className="w-full p-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {uploadProgress && (
            <div className="p-4 rounded-xl bg-blue-600/10 border border-blue-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-200">
                <span>{uploadProgress.stage}</span>
                <span className="font-mono tabular-nums">
                  {uploadProgress.done} / {uploadProgress.total}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#0B0E14] overflow-hidden">
                <div
                  style={{
                    width: `${Math.round(
                      (uploadProgress.done / Math.max(1, uploadProgress.total)) * 100
                    )}%`,
                  }}
                  className="h-full bg-blue-500 transition-all duration-200"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={Boolean(uploadProgress)}
            className="min-h-[46px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <CloudUpload className="w-4 h-4" />
            <span>
              {uploadProgress ? 'Unpacking & Uploading to Cloud...' : 'Publish Chapter to Cloud'}
            </span>
          </button>
        </form>
      )}

      {/* =====================================================================
          TAB 2: ADD / EDIT MANGA SERIES
         ===================================================================== */}
      {activeTab === 'series-form' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleSaveSeries}
            className="lg:col-span-8 bg-[#131822] border border-slate-800/80 rounded-2xl p-6 sm:p-8 space-y-6"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  {editingSeriesId ? 'Edit Manga Series Metadata' : 'Create New Manga Series'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Saves series details directly to Cloud Firestore `/series` catalog.
                </p>
              </div>
              {editingSeriesId && (
                <button
                  type="button"
                  onClick={resetSeriesForm}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 hover:text-white"
                >
                  Switch to New Series
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-8 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Series Title *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Sword of the Eternal Horizon"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Alternative Titles (Comma separated)
                  </label>
                  <input
                    type="text"
                    value={altTitlesRaw}
                    onChange={(e) => setAltTitlesRaw(e.target.value)}
                    placeholder="Yeongwon-ui Geom, Horizon Blade"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Author *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="Author name"
                      className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Artist
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      placeholder="Studio / Artist name"
                      className="w-full h-11 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Format Type
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as MangaType)}
                      className="w-full h-11 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="Manhwa">Manhwa</option>
                      <option value="Manga">Manga</option>
                      <option value="Manhua">Manhua</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as MangaStatus)}
                      className="w-full h-11 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="Ongoing">Ongoing</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Release Year
                    </label>
                    <input
                      type="number"
                      min={1950}
                      max={2100}
                      value={releaseYear}
                      onChange={(e) => setReleaseYear(Number(e.target.value) || 2026)}
                      className="w-full h-11 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Synopsis / Description *
                  </label>
                  <textarea
                    rows={4}
                    required
                    maxLength={4000}
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    placeholder="Write series synopsis..."
                    className="w-full p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Genres (Select up to 10)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_GENRES.map((g) => {
                      const active = selectedGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (active) {
                              if (selectedGenres.length > 1) {
                                setSelectedGenres((prev) => prev.filter((item) => item !== g));
                              }
                            } else if (selectedGenres.length < 10) {
                              setSelectedGenres((prev) => [...prev, g]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#0B0E14] border border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="inline-flex items-center gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-xs font-medium text-slate-300">
                    Feature in Homepage Hero Spotlight Carousel
                  </span>
                </label>
              </div>

              <div className="md:col-span-4 space-y-4">
                <label className="block text-xs font-medium text-slate-300">Cover Artwork *</label>
                <div className="w-44 aspect-[3/4] rounded-xl overflow-hidden bg-[#0B0E14] border border-slate-800 mx-auto">
                  <MangaCover
                    src={coverUrl}
                    title={title || 'Cover Preview'}
                    className="w-full h-full"
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-blue-400" />
                    <span>Upload Cover File</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCoverFileSelect}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="Or paste cover image URL..."
                    className="w-full h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={seriesSaving}
              className="min-h-[46px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {seriesSaving
                ? 'Saving Series...'
                : editingSeriesId
                ? 'Save Series Changes'
                : 'Publish New Series'}
            </button>
          </form>

          {/* Quick Select Existing Series to Edit */}
          <div className="lg:col-span-4 bg-[#131822] border border-slate-800/80 rounded-2xl p-5 space-y-4 self-start">
            <h3 className="text-sm font-bold text-slate-100">
              Load Existing Series to Edit ({allSeries.length})
            </h3>
            <div className="divide-y divide-slate-800/70 max-h-[540px] overflow-y-auto">
              {allSeries.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadSeriesIntoEditor(s)}
                  className="w-full py-2.5 first:pt-0 flex items-center justify-between gap-3 text-left hover:bg-slate-800/40 rounded-lg px-2 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MangaCover
                      src={s.coverUrl}
                      title={s.title}
                      className="w-8 h-11 rounded shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate">{s.title}</p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {s.type} · Ch. {s.latestChapterNum}
                      </p>
                    </div>
                  </div>
                  <Edit3 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: USER MANAGEMENT & REPORTS (Visible to Admin & Moderator)
         ===================================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-8">
          {/* A. User Directory: Comment Counts, View Profile, Reading History, Bans & Punishments */}
          <section className="bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" />
                  <span>User Management ({userProfiles.length})</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inspect comment counts, open user profiles (with full comment history), inspect reading history, and manage warnings, mutes, suspensions, or bans.
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user name, @handle, or ID..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
                No cloud user profiles matching your search yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredUsers.map((u) => {
                  const cmtCount = commentCountByAuthor[u.uid] || 0;
                  const mod = moderationsMap[u.uid];
                  const activeSanction = isSanctionCurrentlyActive(mod);

                  return (
                    <div
                      key={u.uid}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {u.photoURL ? (
                          <img
                            src={u.photoURL}
                            alt={u.displayName}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-blue-600/20 text-blue-400 font-bold text-sm flex items-center justify-center uppercase shrink-0">
                            {u.displayName.slice(0, 1)}
                          </div>
                        )}

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-100 truncate">
                              {u.displayName}
                            </span>
                            {u.username && (
                              <span className="text-xs font-mono text-slate-400">
                                @{u.username}
                              </span>
                            )}
                            {mod && mod.status !== 'active' && (
                              <span
                                className={`text-[11px] font-mono uppercase font-semibold ${
                                  activeSanction ? 'text-red-400' : 'text-amber-400'
                                }`}
                              >
                                · {mod.status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                            <span className="text-blue-400 font-semibold">
                              {cmtCount} comment{cmtCount === 1 ? '' : 's'}
                            </span>
                            <span>·</span>
                            <span>Active {formatRelativeTime(u.updatedAtMs)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onNavigate({ name: 'profile', targetUserId: u.uid })}
                          className="h-9 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-100 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                          <span>View Profile & Comments</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openUserHistoryModal(u)}
                          className="h-9 px-3.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <History className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Reading History</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openPunishModal(u)}
                          className="h-9 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <Gavel className="w-3.5 h-3.5" />
                          <span>Ban / Punish</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* B. Reported Comments & Chapter Missing-Page Reports Queue */}
          <section className="bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Flag className="w-5 h-5 text-amber-400" />
                  <span className="tabular-nums">
                    Comment & Chapter Reports ({openReportsCount} open)
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Review reader-submitted reports for negative comments or missing/corrupted chapter pages.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setReportFilter('open')}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    reportFilter === 'open'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#0B0E14] text-slate-400 border border-slate-800'
                  }`}
                >
                  Open ({openReportsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setReportFilter('all')}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    reportFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#0B0E14] text-slate-400 border border-slate-800'
                  }`}
                >
                  All ({reports.length})
                </button>
              </div>
            </div>

            {visibleReports.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
                No {reportFilter === 'open' ? 'open ' : ''}reports in the queue.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleReports.map((rpt) => (
                  <div
                    key={rpt.id}
                    className="p-4 rounded-xl bg-[#0B0E14] border border-slate-800 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span
                          className={`font-mono uppercase font-bold ${
                            rpt.targetType === 'chapter' ? 'text-amber-400' : 'text-rose-400'
                          }`}
                        >
                          [{rpt.targetType === 'chapter' ? 'Chapter Issue' : 'Comment Report'}]
                        </span>
                        <span className="font-semibold text-slate-200">{rpt.reason}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">
                          Reported by {rpt.reporterName} · {formatRelativeTime(rpt.createdAtMs)}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="font-mono uppercase text-[11px] text-blue-400">
                          {rpt.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {rpt.chapterId ? (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                name: 'reader',
                                seriesId: rpt.seriesId,
                                chapterId: rpt.chapterId,
                              })
                            }
                            className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-blue-400 whitespace-nowrap"
                          >
                            Open Ch. {rpt.chapterNumber || ''}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({ name: 'series', seriesId: rpt.seriesId })
                            }
                            className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-blue-400 whitespace-nowrap"
                          >
                            Open Series
                          </button>
                        )}

                        {rpt.targetType === 'comment' && rpt.commentId && (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteCloudComment(rpt.commentId);
                              await updateContentReportStatus(rpt.id, 'resolved');
                              onToast('Reported comment deleted & report resolved.');
                            }}
                            className="h-7 px-2.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-[11px] font-semibold whitespace-nowrap transition-colors"
                          >
                            Delete Comment
                          </button>
                        )}

                        {rpt.targetType === 'comment' && rpt.commentAuthorId && (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                name: 'profile',
                                targetUserId: rpt.commentAuthorId,
                              })
                            }
                            className="h-7 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-semibold whitespace-nowrap"
                          >
                            Inspect Author
                          </button>
                        )}

                        {rpt.status === 'open' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await updateContentReportStatus(rpt.id, 'resolved');
                              onToast('Report marked resolved.');
                            }}
                            className="h-7 px-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[11px] font-semibold whitespace-nowrap transition-colors"
                          >
                            Resolve
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            title="Delete report entry"
                            onClick={() => deleteContentReport(rpt.id)}
                            className="p-1 text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-300">
                      <span className="text-slate-500">Target:</span> {rpt.seriesTitle}
                      {rpt.chapterNumber ? ` — Chapter ${rpt.chapterNumber}` : ''}
                    </p>

                    {rpt.commentSnippet && (
                      <blockquote className="pl-3 border-l-2 border-slate-700 text-xs text-slate-400 italic">
                        "{rpt.commentSnippet}"
                      </blockquote>
                    )}

                    {rpt.details && (
                      <p className="text-xs text-slate-200">
                        <span className="text-slate-500">Details:</span> {rpt.details}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 4: MANAGEMENT & STAFF ROLES (Strictly Admin-Only!)
         ===================================================================== */}
      {isAdmin && activeTab === 'management' && (
        <div className="space-y-8">
          {/* 1. Add / Remove Admins & Moderators by Gmail */}
          <section className="bg-[#131822] border border-slate-800/80 rounded-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <UserPlus className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  Manage Admins & Moderators by Gmail
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Type any user's Gmail below to grant Admin or Moderator access immediately. When they sign in with Google, the Portal button will appear beside their Profile automatically.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleAddStaffByGmail}
              className="grid grid-cols-1 sm:grid-cols-12 gap-3"
            >
              <div className="sm:col-span-6 relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="Enter user Gmail (e.g. moderator@gmail.com)"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as 'moderator' | 'admin')}
                  className="w-full h-11 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={savingStaff || !newStaffEmail.trim()}
                  className="w-full h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  {savingStaff ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  <span>Add / Update Staff</span>
                </button>
              </div>
            </form>

            {/* Active Staff Roster */}
            <div className="divide-y divide-slate-800/80 bg-[#0B0E14] border border-slate-800 rounded-xl px-4">
              {/* Permanent Owner Row */}
              <div className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-mono font-semibold text-slate-100 truncate">
                    {BOOTSTRAP_ADMIN_EMAIL}
                  </p>
                  <p className="text-[11px] text-blue-400">Primary Owner Administrator</p>
                </div>
                <span className="text-xs font-mono uppercase text-blue-400 font-semibold">
                  Owner Admin
                </span>
              </div>

              {staffEntries.map((entry) => (
                <div
                  key={entry.email}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-mono font-semibold text-slate-100 truncate">
                      {entry.email}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Role: <strong className="uppercase text-slate-200">{entry.role}</strong> ·
                      Added by {entry.addedByEmail || 'Admin'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return;
                        const nextRole = entry.role === 'admin' ? 'moderator' : 'admin';
                        await upsertStaffMemberByGmail(user, entry.email, nextRole, staffEntries);
                        onToast(`Switched ${entry.email} to ${nextRole.toUpperCase()}.`);
                      }}
                      className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors"
                    >
                      Make {entry.role === 'admin' ? 'Moderator' : 'Admin'}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return;
                        await removeStaffMemberByGmail(user, entry.email, staffEntries);
                        onToast(`Removed ${entry.email} from staff.`);
                      }}
                      className="h-8 px-3 rounded-lg bg-red-600/15 hover:bg-red-600 text-red-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Starter Library Cloud Persistence */}
          <div className="bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Starter Library Cloud Persistence
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Persist all 6 starter series and their 22 chapters each directly into Cloud Firestore documents.
              </p>
            </div>
            <button
              type="button"
              disabled={Boolean(seedProgress)}
              onClick={async () => {
                if (!user) return;
                setSeedProgress({ done: 0, total: 6 });
                try {
                  await seedFullStarterCatalogToCloud(user, (done, total) =>
                    setSeedProgress({ done, total })
                  );
                  onToast('Starter catalog persisted to Cloud Firestore!');
                } finally {
                  setSeedProgress(null);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-60"
            >
              {seedProgress
                ? `Syncing ${seedProgress.done}/${seedProgress.total}...`
                : 'Sync Starter Catalog to Cloud'}
            </button>
          </div>

          {/* 3. Catalog Deletion & Global Comments */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
              <h2 className="text-base font-bold text-slate-100">
                Catalog & Chapter Deletion ({allSeries.length})
              </h2>

              <div className="divide-y divide-slate-800/70 max-h-96 overflow-y-auto">
                {allSeries.map((s) => (
                  <div
                    key={s.id}
                    className="py-3 first:pt-0 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MangaCover
                        src={s.coverUrl}
                        title={s.title}
                        className="w-10 h-14 rounded-md shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {s.title}
                        </p>
                        <p className="text-xs text-slate-400 tabular-nums">
                          {s.type} · {s.status} · {s.chapterCount} chs
                          {s.isSeedOnly ? ' · Local Seed' : ' · Cloud'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setInspectSeriesId(s.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                          inspectSeriesId === s.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#0B0E14] border border-slate-800 text-slate-300'
                        }`}
                      >
                        Chapters
                      </button>
                      <button
                        type="button"
                        onClick={() => loadSeriesIntoEditor(s)}
                        title="Edit series"
                        className="p-2 rounded-lg bg-[#0B0E14] border border-slate-800 text-slate-300 hover:text-blue-400"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {!s.isSeedOnly && (
                        <>
                          {confirmDeleteSeriesId === s.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteSeriesFromCloud(s.id);
                                setConfirmDeleteSeriesId(null);
                                onToast(`Deleted ${s.title} from Cloud.`);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSeriesId(s.id)}
                              title="Delete cloud series"
                              className="p-2 rounded-lg bg-[#0B0E14] border border-slate-800 text-slate-400 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {inspectSeriesId && (
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-300">
                    Chapters for{' '}
                    {allSeries.find((s) => s.id === inspectSeriesId)?.title || inspectSeriesId}
                  </h3>
                  <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto bg-[#0B0E14] rounded-xl border border-slate-800 px-3">
                    {inspectChapters.map((ch) => {
                      const parentS = allSeries.find((s) => s.id === inspectSeriesId);
                      return (
                        <div
                          key={ch.id}
                          className="py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-slate-200 font-mono tabular-nums truncate">
                            Ch. {ch.chapterNumber}
                            {ch.title ? ` — ${ch.title}` : ''} ({ch.pageCount}p)
                          </span>
                          {!ch.isSeedOnly && parentS && (
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteChapterFromCloud(parentS, ch);
                                onToast(`Removed Chapter ${ch.chapterNumber} from Cloud.`);
                              }}
                              className="text-red-400 hover:text-red-300 inline-flex items-center gap-1 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-[#131822] border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-100 inline-flex items-center gap-2">
                <MessageSquareWarning className="w-4 h-4 text-blue-400" />
                <span>Recent Comments Stream ({allComments.length})</span>
              </h2>

              {allComments.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No cloud comments posted yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/70 max-h-[460px] overflow-y-auto">
                  {allComments.map((cmt) => (
                    <div key={cmt.id} className="py-3 first:pt-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({ name: 'profile', targetUserId: cmt.authorId })
                          }
                          className="text-xs font-semibold text-slate-200 hover:text-blue-400 truncate text-left"
                        >
                          {cmt.authorName}{' '}
                          <span className="text-slate-500 font-normal">
                            on {cmt.seriesTitle}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteCloudComment(cmt.id);
                            onToast('Comment removed.');
                          }}
                          className="text-slate-400 hover:text-red-400 p-1 shrink-0"
                          title="Delete comment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2 break-words">
                        {cmt.content || '[Attached Image]'}
                      </p>
                      <p className="text-[10px] text-slate-500 tabular-nums">
                        {formatRelativeTime(cmt.createdAtMs)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: SITE SETTINGS (Strictly Admin-Only — Theme, Name, Logo, Any Text)
         ===================================================================== */}
      {isAdmin && activeTab === 'site-settings' && (
        <form onSubmit={handleSaveSiteSettings} className="space-y-8">
          {/* Top Save Action Bar */}
          <div className="bg-[#131822] border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Global Site Settings — Brand, Custom Theme & Sitewide Text
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Every setting saved here updates live across the entire site for all visitors.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setLiveTextEditMode(true);
                  onNavigate({ name: 'home' });
                }}
                className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-blue-500/40 text-blue-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>Click-to-Edit Any Text Live</span>
              </button>
              <button
                type="submit"
                disabled={savingSiteSettings}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap transition-colors"
              >
                {savingSiteSettings ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{savingSiteSettings ? 'Publishing...' : 'Save Site Settings'}</span>
              </button>
            </div>
          </div>

          {/* 1. Brand Name, Logo & Announcement */}
          <section className="bg-[#131822] border border-slate-800 rounded-2xl p-6 space-y-5">
            <h3 className="text-base font-bold text-slate-100">1. Site Name, Logo & Banner</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Site Name</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="MGeko"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Footer Tagline / Description
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={siteTagline}
                  onChange={(e) => setSiteTagline(e.target.value)}
                  placeholder="Cloud Synced & Offline-Capable Manga Reader PWA"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">Site Logo</label>
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-xl object-contain bg-[#0B0E14] border border-slate-800 p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                      Logo
                    </div>
                  )}

                  <label className="h-10 px-3.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-2 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-blue-400" />
                    <span>Upload Logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="h-10 px-3 rounded-xl bg-slate-800 text-xs text-red-400 hover:text-red-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={logoUrl.startsWith('data:') ? '' : logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder={
                    logoUrl.startsWith('data:')
                      ? 'Uploaded logo image active (or paste URL to replace)'
                      : 'Or paste logo image URL...'
                  }
                  className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Top Announcement Strip (Leave blank to hide)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={announcementBanner}
                  onChange={(e) => setAnnouncementBanner(e.target.value)}
                  placeholder="e.g. Weekend Mass Release: 15 new chapters live now!"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* 2. Custom Site Theme & Palette */}
          <section className="bg-[#131822] border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-slate-100">2. Custom Site Theme</h3>
              </div>
              <button
                type="button"
                onClick={() => applyThemePreset('midnight-blue')}
                className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Default Palette</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyThemePreset(preset.id)}
                  className={`p-3 rounded-xl border text-left space-y-2 transition-colors ${
                    themePreset === preset.id
                      ? 'border-blue-500 bg-blue-600/10'
                      : 'border-slate-800 bg-[#0B0E14] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{ backgroundColor: preset.bgCanvasHex }}
                      className="w-4 h-4 rounded-full border border-white/20"
                    />
                    <span
                      style={{ backgroundColor: preset.bgSurfaceHex }}
                      className="w-4 h-4 rounded-full border border-white/20"
                    />
                    <span
                      style={{ backgroundColor: preset.accentHex }}
                      className="w-4 h-4 rounded-full border border-white/20"
                    />
                  </div>
                  <p className="text-xs font-semibold text-slate-100 truncate">{preset.name}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Background Canvas
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgCanvasHex}
                    onChange={(e) => {
                      setBgCanvasHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="w-10 h-10 rounded-lg bg-transparent border border-slate-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={bgCanvasHex}
                    onChange={(e) => {
                      setBgCanvasHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="flex-1 h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Card & Header Surface
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgSurfaceHex}
                    onChange={(e) => {
                      setBgSurfaceHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="w-10 h-10 rounded-lg bg-transparent border border-slate-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={bgSurfaceHex}
                    onChange={(e) => {
                      setBgSurfaceHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="flex-1 h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Primary Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentHex}
                    onChange={(e) => {
                      setAccentHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="w-10 h-10 rounded-lg bg-transparent border border-slate-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accentHex}
                    onChange={(e) => {
                      setAccentHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="flex-1 h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Primary Text Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={textPrimaryHex}
                    onChange={(e) => {
                      setTextPrimaryHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="w-10 h-10 rounded-lg bg-transparent border border-slate-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={textPrimaryHex}
                    onChange={(e) => {
                      setTextPrimaryHex(e.target.value);
                      setThemePreset('custom');
                    }}
                    className="flex-1 h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs font-mono text-slate-100"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 3. Edit Any Text Anywhere on the Site */}
          <section className="bg-[#131822] border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    3. Change Any Text Anywhere on the Site
                  </h3>
                  <p className="text-xs text-slate-400">
                    Replace any word, button, or sentence across every page — or edit structured labels below.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setUiCopyDraft({ ...DEFAULT_UI_COPY });
                  setTextReplacementsDraft([]);
                  onToast('Reset draft text overrides — click Save Site Settings to apply.');
                }}
                className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Text Overrides</span>
              </button>
            </div>

            {/* Universal Find & Replace Rules */}
            <div className="p-4 rounded-xl bg-[#0B0E14] border border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-slate-200">
                Global Text Replacement Rules (Matches anywhere on the site)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <input
                  type="text"
                  value={findFromText}
                  onChange={(e) => setFindFromText(e.target.value)}
                  placeholder="Exact text on site to replace (e.g. Browse Manga Directory)"
                  className="sm:col-span-5 h-10 px-3 rounded-lg bg-[#131822] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={replaceToText}
                  onChange={(e) => setReplaceToText(e.target.value)}
                  placeholder="New replacement text (e.g. Explore Catalog)"
                  className="sm:col-span-5 h-10 px-3 rounded-lg bg-[#131822] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddTextReplacementRule}
                  disabled={!findFromText.trim()}
                  className="sm:col-span-2 h-10 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Rule</span>
                </button>
              </div>

              {textReplacementsDraft.length > 0 && (
                <div className="divide-y divide-slate-800/80 pt-2">
                  {textReplacementsDraft.map((rule) => {
                    const idx = rule.indexOf(':::');
                    const from = idx > 0 ? rule.slice(0, idx) : rule;
                    const to = idx > 0 ? rule.slice(idx + 3) : '';
                    return (
                      <div
                        key={rule}
                        className="py-2 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-mono text-slate-400">"{from}"</span>
                          <span className="mx-2 text-blue-400">→</span>
                          <span className="font-mono text-emerald-300">"{to}"</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setTextReplacementsDraft((prev) => prev.filter((r) => r !== rule))
                          }
                          className="text-slate-500 hover:text-red-400 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Structured Section & Navigation Copy Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {UI_COPY_LABELS.map((item) => (
                <div key={item.key} className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-400">
                    {item.label}
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={uiCopyDraft[item.key] ?? DEFAULT_UI_COPY[item.key] ?? ''}
                    onChange={(e) =>
                      setUiCopyDraft((prev) => ({
                        ...prev,
                        [item.key]: e.target.value,
                      }))
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          </section>
        </form>
      )}

      {/* =====================================================================
          MODAL A: STAFF USER READING HISTORY INSPECTOR
         ===================================================================== */}
      {historyInspectUser && (
        <div
          onClick={() => setHistoryInspectUser(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl bg-[#131822] border border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-100 truncate">
                  Reading History — {historyInspectUser.displayName}
                </h3>
                {inspectedUserEmail && (
                  <p className="text-xs font-mono text-blue-400 truncate">
                    {inspectedUserEmail}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setHistoryInspectUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-2.5">
              {loadingUserHistory ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Loading user reading history...</span>
                </div>
              ) : inspectedUserHistory.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  This user has no recorded chapter history yet.
                </p>
              ) : (
                inspectedUserHistory.map((h) => (
                  <div
                    key={h.seriesId}
                    className="p-3 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MangaCover
                        src={h.coverUrl}
                        title={h.seriesTitle}
                        className="w-10 h-14 rounded shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                          {h.seriesTitle}
                        </p>
                        <p className="text-xs text-blue-400 font-mono tabular-nums">
                          Last Read: Ch. {h.lastChapterNum} · {h.readChapterIds.length} chapters read
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {formatRelativeTime(h.updatedAtMs)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setHistoryInspectUser(null);
                        onNavigate({
                          name: 'reader',
                          seriesId: h.seriesId,
                          chapterId: h.lastChapterId,
                        });
                      }}
                      className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1 shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                      <span>Open</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL B: STAFF BAN / PUNISHMENT MODAL
         ===================================================================== */}
      {punishTargetUser && (
        <div
          onClick={() => setPunishTargetUser(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleApplyPunishment}
            className="w-full max-w-md rounded-2xl bg-[#131822] border border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Moderate {punishTargetUser.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPunishTargetUser(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Moderation Action
                </label>
                <select
                  value={punishStatus}
                  onChange={(e) => setPunishStatus(e.target.value as ModerationStatus)}
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="active">Active (Lift All Sanctions)</option>
                  <option value="warned">Official Warning Banner</option>
                  <option value="muted">Muted (Block Commenting & Likes)</option>
                  <option value="suspended">Suspended (Temporary Account Restriction)</option>
                  <option value="banned">Banned</option>
                </select>
              </div>

              {['muted', 'suspended', 'banned'].includes(punishStatus) && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Duration</label>
                  <select
                    value={String(punishDuration)}
                    onChange={(e) =>
                      setPunishDuration(
                        e.target.value === 'permanent' ? 'permanent' : Number(e.target.value)
                      )
                    }
                    className="w-full h-10 px-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="1">1 Hour</option>
                    <option value="24">24 Hours (1 Day)</option>
                    <option value="168">7 Days</option>
                    <option value="720">30 Days</option>
                    <option value="permanent">Permanent</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Reason / Rule Broken
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={punishReason}
                  onChange={(e) => setPunishReason(e.target.value)}
                  placeholder="Describe the rule violation..."
                  className="w-full p-3 rounded-xl bg-[#0B0E14] border border-slate-800 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPunishTargetUser(null)}
                  className="h-9 px-3.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPunishment}
                  className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingPunishment ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm Action</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
