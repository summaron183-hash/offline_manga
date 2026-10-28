# MGeko Firestore Zero-Trust Security Specification (v2)

## 1. Data Invariants & RBAC Hierarchy
1. **Default-Deny Safety Net**: Every path not explicitly matched is rejected (`allow read, write: if false;`).
2. **Gmail-Keyed Multi-Role RBAC (`Admin` vs `Moderator` vs `User`)**:
   - **Bootstrap Admin**: `request.auth.token.email_verified == true && request.auth.token.email == 'summaron183@gmail.com'`.
   - **Admin**: Bootstrap Admin OR verified Google user whose lowercase email exists at `/staff/$(request.auth.token.email)` with `role == 'admin'`. Only Admins can add/remove Admins & Moderators (`/staff/{emailId}` and `/siteConfig/staffDirectory`), edit `/siteConfig/settings`, and delete series/chapters.
   - **Moderator**: Verified Google user whose email exists at `/staff/$(request.auth.token.email)` with `role == 'moderator'`. Moderators (`isStaff() = isAdmin() || isModerator()`) can publish chapters/series, view user profiles & reading histories, manage user sanctions (`/userModeration/{targetUserId}`), and resolve/delete reported comments (`/reports/{reportId}`, `/comments/{commentId}`).
3. **Active Sanction Gate (`isNotSanctioned()`)**: Users with an active `muted`, `suspended`, or `banned` status in `/userModeration/$(request.auth.uid)` (where `isPermanent == true || request.time < expiresAt`) are blocked at the database rule layer from posting comments, ratings, or reports.
4. **10-Minute Comment Author Edit Window**: Authors can update `content`, `imageUrl`, `isEdited`, and `updatedAt` on `/comments/{commentId}` ONLY when `request.time < existing().createdAt + duration.value(10, 'm')`.
5. **20-Chapter Minimum Read Gate for Series Ratings**: Creating or updating `/series/{seriesId}/ratings/{ratingUserId}` requires `/users/$(request.auth.uid)/history/$(seriesId)` to exist with `readChapterIds.size() >= 20`.
6. **PII Isolation**: User emails reside exclusively in `/users/{userId}/private/info` (`get` restricted to `owner || isStaff()`) and `/staff/{emailId}` (`get` restricted to matching email owner or `isAdmin()`, zero `list` rule).
7. **Zero `get()`/`exists()` inside `allow list`**: Every `allow list` rule evaluates `existing()` directly (`visibility == 'public'`, `scope == 'moderation'`, or `userId == userId`) with zero database lookups.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Admin Email Spoof**: `email == 'summaron183@gmail.com'` with `email_verified == false` attempting to write `/siteConfig/settings` -> `PERMISSION_DENIED`.
2. **Moderator Escalation to Admin**: A `moderator` attempting to write `/staff/friend@gmail.com` or `/siteConfig/settings` -> `PERMISSION_DENIED` (`isAdmin()` strictly required).
3. **Self-Unban Attempt**: Sanctioned user attempting to update/delete `/userModeration/{ownUid}` -> `PERMISSION_DENIED` (`isStaff()` strictly required).
4. **Banned User Comment Post**: User with active `banned` or `muted` status in `/userModeration/{uid}` attempting `create` on `/comments/{id}` -> `PERMISSION_DENIED`.
5. **Expired 10-Minute Comment Edit**: Comment author attempting `update` on `/comments/{id}` 11 minutes after `createdAt` -> `PERMISSION_DENIED`.
6. **Premature Series Rating (< 20 Chapters Read)**: Verified user with only 3 chapters in `readChapterIds` attempting `create` on `/series/{seriesId}/ratings/{uid}` -> `PERMISSION_DENIED`.
7. **Shadow Field Injection on Profile**: User adding `"role": "admin"` to `/users/{uid}` -> `PERMISSION_DENIED` (`hasOnly` key whitelist).
8. **PII Scrape on `/users/{otherUid}/private/info`**: Regular user attempting `get` on another user's private email doc -> `PERMISSION_DENIED`.
9. **Staff Email Scrape (`list /staff`)**: Regular user or moderator attempting `list` on `/staff` -> `PERMISSION_DENIED` (`list` omitted/denied).
10. **Orphaned Comment Like Counter**: Incrementing `likesCount` on `/comments/{id}` without atomically writing `/comments/{id}/likes/{uid}` (`existsAfter`) -> `PERMISSION_DENIED`.
11. **Forged Timestamp Injection**: Client passing past/future `createdAt` instead of `serverTimestamp()` (`request.time`) -> `PERMISSION_DENIED`.
12. **Oversized Payload / ID Poisoning**: Passing 2MB image string or 200-char slash-injected document ID -> `PERMISSION_DENIED`.
