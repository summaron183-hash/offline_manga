import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Bold,
  CornerDownRight,
  Edit2,
  Flag,
  Heart,
  ImagePlus,
  Italic,
  Loader2,
  MessageSquare,
  Reply,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import {
  COMMENT_EDIT_WINDOW_MS,
  compressImageBlobToWebP,
  deleteCloudComment,
  editCloudComment,
  isSanctionCurrentlyActive,
  postCloudComment,
  submitContentReport,
  subscribeSeriesComments,
  toggleCloudCommentLike,
} from '../services/cloudService';
import {
  CommentItem,
  Series,
  UserModerationRecord,
  UserProfile,
  ViewRoute,
} from '../types';
import { formatRelativeTime } from '../utils/time';

interface CommentSectionProps {
  series: Series;
  chapterId?: string;
  chapterNumber?: number;
  title?: string;
  user: User | null;
  userProfile: UserProfile | null;
  userModeration: UserModerationRecord | null;
  isStaffUser: boolean;
  onNavigate: (next: ViewRoute) => void;
  onOpenAuth: () => void;
  onToast: (msg: string) => void;
}

const REPORT_REASONS = [
  'Negative / Harassment',
  'Untagged Spoilers',
  'Spam / Self-Promotion',
  'Inappropriate Image / Content',
  'Other Rule Violation',
];

/**
 * Safely renders **bold**, __underline__, and *italic* formatting without dangerouslySetInnerHTML.
 */
export function renderRichCommentText(raw: string): React.ReactNode {
  if (!raw) return null;
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*\n]+\*(?!\*))/g;
  const parts = raw.split(pattern);

  return parts.map((segment, idx) => {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-100">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    if (segment.startsWith('__') && segment.endsWith('__') && segment.length > 4) {
      return (
        <span key={idx} className="underline decoration-slate-400 underline-offset-2">
          {segment.slice(2, -2)}
        </span>
      );
    }
    if (segment.startsWith('*') && segment.endsWith('*') && segment.length > 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {segment.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{segment}</React.Fragment>;
  });
}

function wrapTextareaSelection(
  textarea: HTMLTextAreaElement | null,
  currentValue: string,
  marker: '**' | '*' | '__',
  onChange: (next: string) => void
) {
  if (!textarea) {
    onChange(`${currentValue}${marker}text${marker}`);
    return;
  }
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? currentValue.length;
  const selected = currentValue.slice(start, end) || 'text';
  const next =
    currentValue.slice(0, start) + marker + selected + marker + currentValue.slice(end);
  onChange(next);
  window.setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + marker.length, start + marker.length + selected.length);
  }, 10);
}

interface RichComposerBoxProps {
  placeholder: string;
  submitLabel: string;
  initialText?: string;
  initialImage?: string;
  busy: boolean;
  onCancel?: () => void;
  onSubmit: (text: string, imageUrl: string, reset: () => void) => Promise<void>;
  onToast: (msg: string) => void;
}

const RichComposerBox: React.FC<RichComposerBoxProps> = ({
  placeholder,
  submitLabel,
  initialText = '',
  initialImage = '',
  busy,
  onCancel,
  onSubmit,
  onToast,
}) => {
  const [text, setText] = useState(initialText);
  const [imageUrl, setImageUrl] = useState(initialImage);
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [compressingImg, setCompressingImg] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingImg(true);
    try {
      const webp = await compressImageBlobToWebP(file, 720, 0.78);
      setImageUrl(webp);
    } catch {
      onToast('Could not process attached image.');
    } finally {
      setCompressingImg(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !imageUrl.trim()) return;
    await onSubmit(text, imageUrl, () => {
      setText('');
      setImageUrl('');
      setShowImageUrlInput(false);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-[#0B0E14] border border-slate-800 overflow-hidden">
      {/* Formatting & Image Attachment Toolbar */}
      <div className="px-3 py-1.5 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 bg-[#131822]/60">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Bold"
            onClick={() => wrapTextareaSelection(textareaRef.current, text, '**', setText)}
            className="h-7 w-7 rounded hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Italic"
            onClick={() => wrapTextareaSelection(textareaRef.current, text, '*', setText)}
            className="h-7 w-7 rounded hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Underline"
            onClick={() => wrapTextareaSelection(textareaRef.current, text, '__', setText)}
            className="h-7 w-7 rounded hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <span className="h-4 w-px bg-slate-800 mx-1" />
          <label
            title="Upload image in comment"
            className="h-7 px-2 rounded hover:bg-slate-800 text-slate-300 hover:text-blue-400 text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {compressingImg ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : (
              <ImagePlus className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span>Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageFile}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowImageUrlInput((v) => !v)}
            className="h-7 px-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px] transition-colors"
          >
            Image URL
          </button>
        </div>
        <span className="text-[10px] text-slate-500 font-mono tabular-nums">
          {text.length}/2000
        </span>
      </div>

      {showImageUrlInput && (
        <div className="px-3 py-2 border-b border-slate-800/80 bg-[#0B0E14]">
          <input
            type="url"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Paste image URL (https://...)"
            className="w-full h-8 px-2.5 rounded bg-[#131822] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      )}

      <textarea
        ref={textareaRef}
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full p-3 bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none"
      />

      {imageUrl && (
        <div className="px-3 pb-3">
          <div className="relative inline-block rounded-lg overflow-hidden border border-slate-700 bg-[#131822]">
            <img
              src={imageUrl}
              alt="Comment attachment preview"
              referrerPolicy="no-referrer"
              className="max-h-36 w-auto object-contain block"
            />
            <button
              type="button"
              onClick={() => setImageUrl('')}
              aria-label="Remove attached image"
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-2 border-t border-slate-800/70 flex items-center justify-end gap-2 bg-[#131822]/40">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || (!text.trim() && !imageUrl.trim())}
          className="h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{submitLabel}</span>
        </button>
      </div>
    </form>
  );
};

export const CommentSection: React.FC<CommentSectionProps> = ({
  series,
  chapterId = '',
  chapterNumber,
  title = 'Cloud Comments',
  user,
  userProfile,
  userModeration,
  isStaffUser,
  onNavigate,
  onOpenAuth,
  onToast,
}) => {
  const [allSeriesComments, setAllSeriesComments] = useState<CommentItem[]>([]);
  const [postingRoot, setPostingRoot] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [postingReply, setPostingReply] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [reportingComment, setReportingComment] = useState<CommentItem | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [likingIds, setLikingIds] = useState<Record<string, boolean>>({});
  const [expandedImageSrc, setExpandedImageSrc] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const unsub = subscribeSeriesComments(series.id, setAllSeriesComments);
    return () => unsub();
  }, [series.id]);

  // Tick every 15 seconds so the 10-minute edit window countdown updates and auto-expires accurately
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const scopedComments = useMemo(() => {
    if (chapterId) {
      return allSeriesComments.filter((c) => c.chapterId === chapterId);
    }
    return allSeriesComments;
  }, [allSeriesComments, chapterId]);

  const { roots, childrenMap } = useMemo(() => {
    const byId = new Set(scopedComments.map((c) => c.id));
    const map: Record<string, CommentItem[]> = {};
    const rootList: CommentItem[] = [];

    for (const c of scopedComments) {
      if (c.parentId && byId.has(c.parentId)) {
        if (!map[c.parentId]) map[c.parentId] = [];
        map[c.parentId].push(c);
      } else {
        rootList.push(c);
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.createdAtMs - b.createdAtMs);
    }
    return { roots: rootList, childrenMap: map };
  }, [scopedComments]);

  const sanctioned = isSanctionCurrentlyActive(userModeration);

  const handleToggleLike = async (commentId: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (sanctioned) {
      onToast('Your account is currently restricted from interacting with comments.');
      return;
    }
    if (likingIds[commentId]) return;
    setLikingIds((prev) => ({ ...prev, [commentId]: true }));
    try {
      await toggleCloudCommentLike(user, commentId);
    } finally {
      setLikingIds((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!reportingComment) return;
    setSubmittingReport(true);
    try {
      await submitContentReport(user, {
        targetType: 'comment',
        seriesId: series.id,
        seriesTitle: series.title,
        chapterId: reportingComment.chapterId || chapterId,
        chapterNumber: chapterNumber || 0,
        commentId: reportingComment.id,
        commentAuthorId: reportingComment.authorId,
        commentSnippet: reportingComment.content.slice(0, 280) || '[Image Comment]',
        reason: reportReason,
        details: reportDetails,
        reporterProfile: userProfile,
      });
      setReportingComment(null);
      setReportDetails('');
      onToast('Comment report submitted to Moderators & Admins.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const renderCommentNode = (cmt: CommentItem, depth: number): React.ReactNode => {
    const replies = childrenMap[cmt.id] || [];
    const isAuthor = Boolean(user && user.uid === cmt.authorId);
    const canDelete = isAuthor || isStaffUser;
    const elapsedMs = Math.max(0, nowTick - cmt.createdAtMs);
    const remainingEditMs = COMMENT_EDIT_WINDOW_MS - elapsedMs;
    const canEditNow = isAuthor && !sanctioned && remainingEditMs > 0;
    const remainingMins = Math.max(1, Math.ceil(remainingEditMs / 60000));
    const isEditingThis = editingCommentId === cmt.id;
    const isReplyingHere = replyingTo?.id === cmt.id;
    const isReportingThis = reportingComment?.id === cmt.id;

    // Anti-Pyramid Rule: Indent cleanly for depths 1..4; after 4 replies, start a fresh full-width column!
    const indentWrapperClass =
      depth === 0
        ? ''
        : depth <= 4
        ? 'ml-3 sm:ml-4 pl-3 border-l border-slate-800/90 mt-2.5'
        : 'ml-0 mt-3 pt-2.5 border-t border-slate-800/80';

    return (
      <div key={cmt.id} className={indentWrapperClass}>
        {depth > 4 && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-blue-400 font-medium">
            <CornerDownRight className="w-3 h-3 shrink-0" />
            <span>New Thread Column · Replying to @{cmt.replyToName || 'Reader'}</span>
          </div>
        )}

        <div className="rounded-xl bg-[#0B0E14]/85 border border-slate-800/80 p-3.5">
          {/* Header Row: Clickable Profile Avatar + Name + Timestamp + Actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <button
                type="button"
                onClick={() => onNavigate({ name: 'profile', targetUserId: cmt.authorId })}
                className="inline-flex items-center gap-2 min-w-0 group text-left"
                title="View reader profile & comment history"
              >
                {cmt.authorPhoto ? (
                  <img
                    src={cmt.authorPhoto}
                    alt={cmt.authorName}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover border border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 uppercase">
                    {cmt.authorName.slice(0, 1)}
                  </div>
                )}
                <span className="text-xs font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate">
                  {cmt.authorName}
                </span>
              </button>

              {cmt.replyToName && depth <= 4 && (
                <span className="text-[11px] text-slate-500 truncate">
                  → @{cmt.replyToName}
                </span>
              )}

              <span className="text-[11px] text-slate-500 font-mono tabular-nums shrink-0">
                {formatRelativeTime(cmt.createdAtMs)}
              </span>

              {cmt.isEdited && (
                <span className="text-[10px] text-slate-500 italic">(edited)</span>
              )}
            </div>

            {/* Delete Action */}
            {canDelete && (
              <div className="shrink-0">
                {confirmDeleteId === cmt.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteCloudComment(cmt.id);
                        setConfirmDeleteId(null);
                        onToast('Comment deleted.');
                      }}
                      className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(cmt.id)}
                    title="Delete comment"
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Comment Body or 10-Min Inline Editor */}
          {isEditingThis ? (
            <div className="mt-2.5">
              <RichComposerBox
                placeholder="Edit your comment..."
                submitLabel="Save Edit"
                initialText={cmt.content}
                initialImage={cmt.imageUrl}
                busy={savingEdit}
                onCancel={() => setEditingCommentId(null)}
                onToast={onToast}
                onSubmit={async (nextText, nextImg) => {
                  if (!user) return;
                  setSavingEdit(true);
                  try {
                    await editCloudComment(user, cmt, nextText, nextImg);
                    setEditingCommentId(null);
                    onToast('Comment updated.');
                  } catch (err: unknown) {
                    onToast(err instanceof Error ? err.message : 'Edit window expired.');
                    setEditingCommentId(null);
                  } finally {
                    setSavingEdit(false);
                  }
                }}
              />
            </div>
          ) : (
            <>
              {cmt.content && (
                <p className="mt-2 text-xs sm:text-sm text-slate-300 whitespace-pre-line break-words leading-relaxed">
                  {renderRichCommentText(cmt.content)}
                </p>
              )}

              {cmt.imageUrl && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedImageSrc(cmt.imageUrl)}
                    className="rounded-lg overflow-hidden border border-slate-800 hover:border-slate-600 bg-[#131822] inline-block text-left transition-colors"
                  >
                    <img
                      src={cmt.imageUrl}
                      alt="Comment image"
                      referrerPolicy="no-referrer"
                      className="max-h-56 w-auto object-contain block"
                    />
                  </button>
                </div>
              )}
            </>
          )}

          {/* Action Row: Like · Reply · Edit (10m) · Report */}
          <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <button
              type="button"
              disabled={Boolean(likingIds[cmt.id])}
              onClick={() => handleToggleLike(cmt.id)}
              className="inline-flex items-center gap-1 hover:text-rose-400 transition-colors font-mono tabular-nums"
            >
              <Heart className="w-3.5 h-3.5" />
              <span>{cmt.likesCount}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onOpenAuth();
                  return;
                }
                setReplyingTo(isReplyingHere ? null : cmt);
                setReportingComment(null);
              }}
              className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
            >
              <Reply className="w-3.5 h-3.5" />
              <span>Reply</span>
            </button>

            {canEditNow && !isEditingThis && (
              <button
                type="button"
                onClick={() => {
                  setEditingCommentId(cmt.id);
                  setReplyingTo(null);
                }}
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
                <span className="tabular-nums">Edit ({remainingMins}m left)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onOpenAuth();
                  return;
                }
                setReportingComment(isReportingThis ? null : cmt);
                setReplyingTo(null);
              }}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-amber-400 transition-colors ml-auto"
              title="Report negative or rule-breaking comment"
            >
              <Flag className="w-3 h-3" />
              <span>Report</span>
            </button>
          </div>

          {/* Inline Report Drawer */}
          {isReportingThis && (
            <form
              onSubmit={handleSubmitReport}
              className="mt-3 p-3 rounded-xl bg-[#131822] border border-amber-500/30 space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                <span>Report comment by {cmt.authorName}</span>
                <button
                  type="button"
                  onClick={() => setReportingComment(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                type="text"
                maxLength={400}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Additional details (optional)..."
                className="w-full h-9 px-2.5 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportingComment(null)}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-50"
                >
                  {submittingReport ? 'Sending...' : 'Submit Report'}
                </button>
              </div>
            </form>
          )}

          {/* Inline Reply Composer */}
          {isReplyingHere && !sanctioned && (
            <div className="mt-3">
              <RichComposerBox
                placeholder={`Replying to @${cmt.authorName}...`}
                submitLabel="Post Reply"
                busy={postingReply}
                onCancel={() => setReplyingTo(null)}
                onToast={onToast}
                onSubmit={async (replyText, replyImg, reset) => {
                  if (!user) {
                    onOpenAuth();
                    return;
                  }
                  setPostingReply(true);
                  try {
                    await postCloudComment(user, series, replyText, {
                      chapterId,
                      parentId: cmt.id,
                      replyToName: cmt.authorName,
                      imageUrl: replyImg,
                      authorProfile: userProfile,
                    });
                    reset();
                    setReplyingTo(null);
                    onToast('Reply posted.');
                  } finally {
                    setPostingReply(false);
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Recursive Child Replies */}
        {replies.length > 0 && (
          <div className="space-y-2">
            {replies.map((child) => renderCommentNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#131822] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <h2 className="font-display text-lg font-bold text-slate-100">{title}</h2>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            ({scopedComments.length})
          </span>
        </div>
        <span className="text-[11px] text-slate-500">10m Edit · Rich Text & Images</span>
      </div>

      {/* Top-Level Composer or Auth / Sanction Banner */}
      <div className="mb-5">
        {!user ? (
          <div className="rounded-xl bg-[#0B0E14] border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Continue with Google to post formatted comments, share reaction images, and reply to readers.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap self-start sm:self-center transition-colors"
            >
              Continue with Google
            </button>
          </div>
        ) : sanctioned ? (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-xs text-red-200 space-y-1">
            <p className="font-semibold">
              Account {userModeration?.status?.toUpperCase()} — Commenting Restricted
            </p>
            <p className="text-red-300/90">
              Reason: {userModeration?.reason || 'Community guideline violation.'}
            </p>
          </div>
        ) : (
          <RichComposerBox
            placeholder={
              chapterNumber
                ? `Discuss Chapter ${chapterNumber} of ${series.title}...`
                : `Share your thoughts on ${series.title}...`
            }
            submitLabel="Post Comment"
            busy={postingRoot}
            onToast={onToast}
            onSubmit={async (text, imageUrl, reset) => {
              setPostingRoot(true);
              try {
                await postCloudComment(user, series, text, {
                  chapterId,
                  imageUrl,
                  authorProfile: userProfile,
                });
                reset();
                onToast('Comment posted.');
              } finally {
                setPostingRoot(false);
              }
            }}
          />
        )}
      </div>

      {/* Threaded Comments Stream */}
      <div className="space-y-3.5 max-h-[680px] overflow-y-auto pr-1">
        {roots.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No comments yet. Start the discussion below!
          </div>
        ) : (
          roots.map((cmt) => renderCommentNode(cmt, 0))
        )}
      </div>

      {/* Lightbox for Attached Comment Images */}
      {expandedImageSrc && (
        <div
          onClick={() => setExpandedImageSrc(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <img
            src={expandedImageSrc}
            alt="Full size comment attachment"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[88vh] rounded-xl shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
