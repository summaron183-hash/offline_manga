import fs from 'node:fs';
import assert from 'node:assert/strict';

const rules = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

// Verify v2 Zero-Trust & Dirty Dozen Security Gates
assert.ok(rules.includes("rules_version = '2';"), 'Must enforce rules_version 2');
assert.ok(rules.includes('allow read, write: if false;'), 'Must enforce default-deny safety net');
assert.ok(rules.includes('request.auth.token.email_verified == true'), 'Must enforce email_verified');
assert.ok(rules.includes("request.auth.token.email == 'summaron183@gmail.com'"), 'Must include bootstrap admin');
assert.ok(rules.includes('match /staff/{emailId}'), 'Must secure Gmail staff assignments');
assert.ok(rules.includes('match /siteConfig/settings'), 'Must secure admin site settings');
assert.ok(rules.includes('match /userModeration/{targetUserId}'), 'Must secure user moderation punishments');
assert.ok(rules.includes('match /reports/{reportId}'), 'Must secure content and chapter reports');
assert.ok(rules.includes("duration.value(10, 'm')"), 'Must enforce 10-minute comment edit window');
assert.ok(rules.includes('.data.readChapterIds.size() >= 20'), 'Must enforce 20-chapter minimum read gate for ratings');

console.log('All v2 Dirty Dozen security gates verified: true');
