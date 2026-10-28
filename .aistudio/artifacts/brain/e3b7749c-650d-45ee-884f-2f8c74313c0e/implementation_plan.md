# MGeko — Hybrid Cloud & Offline Manga Reader PWA

MGeko is an installable Progressive Web Application that replicates the complete reading, discovery, community, and publishing experience of `mgeko.cc`. It pairs a live Firebase cloud backend for cross-device account synchronization, real-time comments, ratings, notifications, and browser-based ZIP chapter publishing with a dedicated IndexedDB local storage engine reserved strictly for offline chapter downloads.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core architectural questions from Phase 1 have been confirmed and integrated into this blueprint. Upon approval, the first build step will open the Firebase setup prompt to provision your live free-tier Firestore database and Google Authentication.

- **Confirmed — Live Firebase Backend**: Provision AI Studio's free-tier Firebase (Firestore + Google Authentication via popup, alongside Email/Password authentication support) for real-time cloud bookmarks, reading history, star ratings, nested comments, notifications, and admin publishing.
- **Confirmed — Pre-Seeded Starter Catalog**: Automatically seed an initial library of original manga, manhwa, and manhua series complete with custom cover art and multi-page illustrated chapters so the Hero Carousel, Rankings, Directory filters, Reader modes, and Offline Downloader work immediately on first launch.
- **Confirmed — Zero-Billing Cloud Page Storage**: Unpack uploaded chapter `.zip` archives directly in the browser via JSZip, compress each page into lightweight WebP format via HTML5 Canvas, and store individual pages in a dedicated Firestore subcollection alongside optional external CDN URLs—staying 100% within the free tier and safely below Firestore's 1 MB document ceiling.
- **Confirmed — Dual-Path Admin & Moderator Verification**: Grant automatic admin privileges to the verified owner Google account (`summaron183@gmail.com`) enforced by Firestore security rules, paired with an in-app Moderator Passkey verification flow for authorized session access.

---

## 1. Overview & Core Concept

- **What It Does**: Delivers a distraction-free, content-first manga, manhwa, and manhua platform featuring rich discovery feeds, advanced multi-criteria catalog filtering, a dual-mode reader (vertical Webtoon scroll and paginated Single Page flip), real-time community discussions, cloud-synced reading progress, an Admin ZIP publisher, and true offline reading via IndexedDB.
- **Target Audience / Persona**:
  - *avid Readers & Commuters* who switch between desktop monitors and mobile phones, expecting instant cross-device reading position sync and reliable offline chapter access without mobile data.
  - *Community Members* who rate series, reply to chapter discussions, and track new chapter release alerts.
  - *Scanlation Admins & Moderators* who publish new series, batch-upload chapter image ZIP archives directly from the browser, and moderate community comments.
- **Key Value**: Eliminates reading friction across devices and network conditions—combining instant cloud synchronization when online with deterministic, user-controlled IndexedDB chapter caching when offline, all with zero paid APIs or external storage billing.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Discovery & Global Search**: Users land on the MGeko homepage featuring a Featured Hero Carousel (top spotlight series with synopsis snippets and direct *Read Now* CTA), a *Popular Today / Weekly* ranking section, a chronological *Latest Releases* chapter feed with relative timestamps, and an interactive *Genre Sidebar*. Typing in the sticky Global Search bar opens a real-time auto-suggestion dropdown matching titles, alternative titles, and authors.
2. **Advanced Directory Filtering**: Navigating to the Manga Directory lets users combine search queries with interactive filter controls for *Sort Order* (Latest, Popularity, A–Z, Rating), *Status* (All, Ongoing, Completed), *Format Type* (Manga, Manhwa, Manhua), and *Genre* tags, updating the responsive cover grid instantaneously.
3. **Series Inspection & Community Engagement**: Selecting a series opens a dynamic blurred-backdrop header displaying cover art, full metadata (Alt Titles, Author, Artist, Status, Type, Year, Average Rating), interactive 1–5 star rating controls, expandable synopsis, primary actions (*Read First*, *Read Latest*, *Cloud Bookmark*, *Download Whole Series*, *Share*), a searchable/sortable Chapter Table showing read checkmarks and per-chapter offline download buttons, and a real-time Cloud Comment thread with replies and likes.
4. **Immersive Reading & Offline Caching**: Opening a chapter launches the distraction-free Reader View. Users switch seamlessly between *Webtoon Mode* (continuous zero-gap vertical scroll) and *Single Page Mode* (tap left/right edges or use keyboard arrow keys), adjust image fit/zoom, toggle fullscreen, jump between chapters, or save the active chapter to IndexedDB in one click. Completing or advancing through a chapter automatically syncs last-read progress to Firestore.
5. **Offline Download Management & PWA Installation**: Users click *Install App* in the navigation bar to install MGeko to their home screen or desktop. Visiting the *Download Manager* displays real-time IndexedDB storage consumption, lists all locally cached series and chapters with instant offline reader links, and provides granular delete buttons to reclaim device space.
6. **Admin ZIP Publishing & Moderation**: Verified admins open the *Admin Portal* to create or edit series metadata, select a series to upload a `.zip` archive of chapter pages (seeing live per-page extraction, WebP compression, and cloud upload progress), automatically trigger cloud notifications to all users who bookmarked that series, and moderate chapters or user comments.

### Visual Identity & Theme

- **Aesthetic Direction**: Reader-centric, late-night editorial dark mode inspired by `mgeko.cc`—prioritizing crisp cover artwork, high-contrast legibility, generous breathing room, and tactile thumb-zone ergonomics without visual clutter or decorative chrome.
- **Color Palette & Mood (60-30-10 Dark Reader System)**:
  - *60% Dominant Neutral Canvas*: Deep Charcoal Obsidian (`#0B0E14` / `slate-950`) engineered to eliminate glare during extended reading sessions and frame vertical comic panels seamlessly.
  - *30% Structural Surfaces & Typography*: Elevated Slate (`#131822` / `slate-900`) for surfaces, subtle hairline dividers (`rgba(255,255,255,0.07)`), crisp Alabaster primary text (`#F1F5F9` / `slate-100`), and cool muted slate metadata (`#94A3B8` / `slate-400`).
  - *10% High-Intent Accent Budget*: Electric Cobalt (`#3B82F6` / `blue-500`) reserved strictly for primary CTAs (*Read Now*, *Install App*), active filter states, unread notification indicators, and active reader controls—paired with warm Amber (`#F59E0B`) exclusively for star ratings.
- **Typography & Hierarchy**:
  - *Display & Section Headings*: `Outfit` (SemiBold 600 / Bold 700, `text-wrap: balance`, `clamp(2rem, 3.5vw, 3.25rem)` for hero titles) for crisp, modern editorial authority.
  - *Body & UI Controls*: `Plus Jakarta Sans` (Regular 400 / Medium 500, `15px–16px`, `1.6` line-height) with slight dark-mode optical tracking compensation.
  - *Metrics, Chapter Numbers & Storage Counters*: `JetBrains Mono` with `tabular-nums` for aligned chapter indices, view counts, ratings, page counters (`Page 05 / 18`), and megabyte storage readouts.
- **Component Styling & Layout**:
  - *Desktop-to-Mobile Responsive Architecture*: Full `1440px` desktop presence (`max-w-7xl` container with a 12-column main feed + genre/ranking sidebar split) that adapts cleanly on mobile (`375px–430px`) into ergonomic 2-column cover grids and a fixed 4-destination bottom thumb bar while keeping total sticky header + bottom bar height strictly $\le 15\%$ of the mobile viewport.
  - *Zero-Pill Metadata Discipline*: Series metadata (format type, publication status, release year, relative timestamps, view counts) renders as clean, unboxed inline text separated by subtle typographic dots (`Manhwa · Ongoing · 4.9 ★`), avoiding cluttered badge sandwiches on cover cards.
  - *Touch & Accessibility Standards*: Minimum $44 \times 44\text{px}$ interactive hitboxes on all mobile navigation icons, chapter download triggers, and reader tap zones, paired with measured gradient scrims (`from-slate-950 via-slate-950/75 to-transparent`) over hero backdrops for guaranteed WCAG AA contrast.
- **Interactive Feedback & Motion**:
  - Fast, compositor-only transitions (`transform`, `opacity` settling within `150ms–200ms`) on cover card hover lifts, auto-hiding reader toolbars during vertical scroll, determinate progress bars for ZIP unpacking and offline chapter downloads, and a non-intrusive offline connectivity banner when network access drops.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Chunked Firestore Page Subcollections + Canvas WebP Compression for ZIP Uploads**
  - *Chosen Approach*: Unpack `.zip` files client-side with JSZip, sort filenames naturally (`001.jpg`, `002.png`, etc.), resize/compress high-resolution scans into crisp WebP data payloads ($\le 350\text{ KB}$ per page) via HTML5 Canvas, and write each page as an individual document inside a `pages` subcollection under the chapter.
  - *Why*: Eliminates any requirement for paid Firebase Blaze billing or third-party S3 API keys while completely avoiding Firestore's 1 MB per-document limit, allowing chapters of arbitrary length (e.g., 20–60+ vertical webtoon panels) to stream and cache reliably.
  - *Alternatives Considered*: Storing all chapter images in a single Firestore array (rejected—hits the 1 MB limit after 3–5 pages) or requiring Firebase Cloud Storage buckets (rejected—requires credit card billing setup on new projects).

- **Decision 2: Strict Separation Between Cloud Firestore State and Local IndexedDB Offline Storage**
  - *Chosen Approach*: Keep account identity, bookmarks, reading history, ratings, comments, notifications, and catalog data in Firestore with real-time `onSnapshot` listeners, while dedicating a custom IndexedDB database (`mgeko_offline_vault`) exclusively to downloaded chapter metadata and binary/WebP image blobs.
  - *Why*: Ensures users see identical bookmarks and last-read chapters whether logging in on laptop or phone, while giving each physical device explicit, transparent control over heavy offline image storage and instant zero-network chapter rendering.
  - *Alternatives Considered*: Relying solely on opaque Service Worker HTTP runtime caches for manga pages (rejected—cannot reliably enumerate downloaded chapters, calculate exact per-series storage size, or guarantee eviction resistance).

- **Decision 3: Hybrid Dual-Verification Admin Portal**
  - *Chosen Approach*: Enforce server-side Firestore security rules recognizing the bootstrapped owner email (`summaron183@gmail.com` with verified email token) and registered moderator documents in `/admins/{uid}`, supplemented by a Moderator Passkey elevation flow that registers verified signed-in moderators.
  - *Why*: Protects catalog integrity with zero-trust Firestore rules while making moderator testing and publishing effortless without external backend scripts.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        MGEKO CLIENT APPLICATION (PWA)                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐  │
│  │ Top Navigation Bar   │  │ Global Search &         │  │ PWA Install &   │  │
│  │ & Mobile Thumb Nav   │  │ Auto-Suggest Dropdown   │  │ Offline Banner  │  │
│  └──────────┬───────────┘  └────────────┬────────────┘  └────────┬────────┘  │
│             ▼                           ▼                        ▼           │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                         VIEW ROUTER & WORKSPACES                       │  │
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────┐ ┌─────────────┐  │  │
│  │  │ Home Discovery │ │ Manga Directory│ │ Series     │ │ Dual-Mode   │  │  │
│  │  │ • Hero Banner  │ │ • Sort/Status  │ │ Detail     │ │ Reader View │  │  │
│  │  │ • Popular Grid │ │ • Type/Genres  │ │ • Metadata │ │ • Webtoon   │  │  │
│  │  │ • Latest Feed  │ │ • Search Grid  │ │ • Chapters │ │ • Paginated │  │  │
│  │  │ • Genre Cloud  │ └────────────────┘ │ • Comments │ │ • Zoom/Full │  │  │
│  │  └────────────────┘                    └────────────┘ └─────────────┘  │  │
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────────────────┐  │  │
│  │  │ User Library   │ │ Notifications  │ │ Offline Download Manager   │  │  │
│  │  │ • Cloud Saved  │ │ • New Chapter  │ │ • Storage Quota Meter      │  │  │
│  │  │ • Read History │ │   Alerts       │ │ • Offline Read & Delete    │  │  │
│  │  └────────────────┘ └────────────────┘ └────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Admin & Moderator Cloud Portal                                   │  │  │
│  │  │ • Series Creator/Editor  • JSZip Chapter Unpacker & WebP Engine  │  │  │
│  │  │ • Chapter Manager        • Real-Time Comment Moderation          │  │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────┬───────────────────────────────────┬─────────────────┘  │
└─────────────────────┼───────────────────────────────────┼────────────────────┘
                      │ Online Real-Time Sync             │ Offline Binary I/O
                      ▼                                   ▼
┌──────────────────────────────────────────┐  ┌────────────────────────────────┐
│     FIREBASE CLOUD BACKEND (FREE TIER)   │  │  LOCAL DEVICE STORAGE (PWA)    │
│  • Firebase Auth (Google + Email/Pass)   │  │  • IndexedDB Offline Vault     │
│  • Firestore Collections:                │  │    - Downloaded Series Index   │
│    - /series/{id}                        │  │    - Offline Chapter Pages     │
│    - /series/{id}/chapters/{chId}        │  │    - Byte Size & Quota Stats   │
│    - /series/{id}/chapters/{chId}/pages  │  │  • Service Worker Shell Cache  │
│    - /series/{id}/ratings/{uid}          │  │    - App Bundle, Fonts, Icons  │
│    - /comments/{commentId}               │  │    - Standalone Manifest       │
│    - /users/{uid}/bookmarks/{seriesId}   │  └────────────────────────────────┘
│    - /users/{uid}/history/{seriesId}     │
│    - /users/{uid}/notifications/{notifId}│
│    - /admins/{uid}                       │
└──────────────────────────────────────────┘
```

### Data Model & State

- **Public Catalog Entities (Firestore)**:
  - *Series*: Title, alternative titles, slug, synopsis, author, artist, cover image URL/data, status (`Ongoing` | `Completed`), format (`Manga` | `Manhwa` | `Manhua`), bounded genre list, release year, view count, rating sum/count/average, latest chapter number/title, and timestamps.
  - *Chapters*: Parent series reference, chapter number (numeric for sorting), chapter title, page count, uploader UID, and upload timestamp.
  - *Chapter Pages*: Ordered page index (`1..N`) and either an optimized WebP image payload or external CDN image URL, keeping individual documents small and fast to query.
  - *Comments & Ratings*: Global real-time comments linked to `seriesId` (and optional `chapterId` or `parentCommentId` for nested replies) with author display name, avatar, body text, like count, and timestamps; deterministic per-user rating documents (`/series/{seriesId}/ratings/{uid}`) preventing duplicate votes.
- **Private Per-User Sync Entities (Firestore)**:
  - *Public User Profile & Isolated Private Info*: Follows strict PII isolation so user email addresses are never exposed to blanket reads.
  - *Bookmarks*: Saved series snapshot (title, cover, latest chapter) inside `/users/{uid}/bookmarks/{seriesId}` paired with a lightweight subscriber reference `/series/{seriesId}/subscribers/{uid}` so chapter uploads can fan out notifications cleanly.
  - *Reading History*: Tracks `lastChapterId`, `lastChapterNumber`, `lastPageIndex`, `readChapterIds` (bounded recent set), and `updatedAt` across devices.
  - *Notifications*: Alerts inside `/users/{uid}/notifications/{notifId}` triggered when a bookmarked series receives a new chapter, with `read` boolean status.
- **Local Offline Vault (IndexedDB)**:
  - `offline_chapters` store keyed by `chapterId`: Stores series metadata snapshot, chapter number/title, total byte size, download timestamp, and ordered array of Blob/data-URI pages for zero-latency offline reading.

### Interactive Component & State Mapping

- **Global Header & Search Auto-Suggest**: Debounced input filters loaded series in real time by title, alt title, and author; keyboard/click selection navigates directly to Series Detail; clicking outside dismisses cleanly.
- **Series Detail Actions**:
  - *Bookmark Toggle*: Optimistically toggles saved state and writes/deletes both `/users/{uid}/bookmarks/{seriesId}` and `/series/{seriesId}/subscribers/{uid}` (prompting Auth Modal if signed out).
  - *Star Rating Control*: Hovering previews 1–5 stars; clicking writes the user's rating and atomically updates the series aggregate rating.
  - *Download Whole Series / Chapter*: Fetches chapter page documents sequentially with a live progress percentage indicator, persists blobs into IndexedDB, and switches the button state to *Downloaded (Read Offline)*.
- **Dual-Mode Manga Reader**:
  - *Mode Switcher*: Toggles between continuous vertical Webtoon flow (`max-w-3xl mx-auto` zero-margin image stack) and Single Page mode (centered viewport-fitted panel with left/right click zones and `ArrowLeft`/`ArrowRight` keyboard listeners).
  - *Source Resolution*: Automatically checks IndexedDB `offline_chapters` first; if cached locally, renders directly from device storage (working seamlessly offline), otherwise streams ordered pages from Firestore.
  - *Progress Sync*: Opening a chapter and scrolling/turning pages updates the user's cloud Reading History (`lastReadChapter` and read checkmark state).
- **Admin ZIP Chapter Publisher**:
  - Validates admin role (`summaron183@gmail.com` or passkey-verified `/admins/{uid}` entry), accepts either `.zip` archive files or multi-image selection, extracts and sorts image entries via JSZip, converts each image onto an offscreen `<canvas>` to bounded WebP quality, uploads page documents with a step-by-step progress bar, updates the parent Series `latestChapter` timestamp, and writes new-chapter notification documents for subscribed readers.
