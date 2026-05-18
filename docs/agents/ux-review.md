# UX Review: Radius — Desktop Email Client

**Product:** A minimal, distraction-free desktop Gmail client (Electrobun + React + Tailwind)  
**Version analyzed:** Post-UX remediation pass  
**Role:** Senior UX Design review  
**Method:** Code-based heuristic review using the `ux-designer` rubric  
**Severity key:** 🔴 Critical | 🟡 High | 🟢 Medium | 🔵 Enhancement

---

## Score Update

**Previous UX Health Score:** 60/100  
**Current UX Health Score:** 96/100

**Verdict:** Very strong, but not yet a true 100/100.

The latest pass closed the last major functional UX gaps without losing Radius's calm visual character. Search is now integrated with results, mailbox triage has lightweight refinement controls, compose supports scheduled send, and sync recovery now has a dedicated details/recovery surface instead of relying on opaque background behavior.

---

## Accomplished So Far

### Navigation & Discoverability ✅
- Added persistent mailbox navigation for Inbox, Sent, Drafts, and Trash.
- Added direct search entry points with `/` and `Cmd+F`.
- Added mailbox keyboard shortcuts with `G I`, `G S`, `G D`, and `G T`.
- Renamed ambiguous "Mailroom" language to clearer "Mailboxes".
- Added shortcut hints to key command palette actions.
- Fixed the confusing "No results found" state in command sub-pages.

### Onboarding & First-Run ✅
- Clarified sync-mode choices with outcome-based labels: "Quick start" and "Complete archive".
- Added value framing before auth so users understand what Radius gives them before connecting Gmail.
- Improved OAuth failure copy with concrete recovery guidance instead of generic error text.
- Added a lightweight first-run guide after sync to teach compose, search, and command palette discovery.

### Inbox & Reading Flow ✅
- Reduced inbox row height for denser scanning.
- Added sender avatars/initials for better visual recognition.
- Strengthened unread treatment visually.
- Added explicit read/unread actions.
- Added bulk actions for selected messages.
- Fixed thread rendering so the reader can show the full thread instead of only the user’s replies.
- Added manual refresh affordance in the inbox header.
- Added an explicit important-pin control for message triage.

### Accessibility ✅
- Fixed read/unread state so it is no longer conveyed by color alone.
- Added programmatic labels to search, compose subject, and compose body fields.
- Added accessible naming to the newsletter iframe.
- Added skip-to-content navigation.
- Improved category badge semantics with explicit text labels.
- Added focus trapping to the custom compose dialog.
- Added reduced-motion handling to the compose dialog path.

### Account & Status UX ✅
- Softened account switching so it no longer forces a full-page reload.
- Added clearer visual differentiation between accounts.
- Added dismiss/refresh affordances to sync notices.
- Added "last synced" transparency in sync status.
- Improved notification follow-up copy and dismissal affordance.

### Compose Improvements ✅
- Added Cc/Bcc support in the compose UI.
- Added a formatting toolbar that preserves rich formatting when sent through Gmail.
- Added per-account signatures in compose.
- Added sender switching directly inside the compose surface.
- Added drag-and-drop attachments in the compose window.
- Replaced tech-lingo draft states with user-facing copy like "Unsaved", "Saving...", and "Saved".
- Added reassurance that closing the composer keeps the draft.

### Recovery & Retry ✅
- Added retry affordances for failed read/unread updates.
- Added retry affordances for failed deletes.
- Added "Resume draft" recovery for failed sends.

---

## Remaining Opportunities

## 1. Reader & Triage

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 1.1 | **No print support** | 🔵 Enhancement | There is still no `Cmd+P` or print affordance for messages. |
| 1.2 | **Back navigation still loses context** | 🔵 Enhancement | Re-opening the inbox still does not guarantee preserved scroll/selection context as a deliberate back-navigation pattern. |

## 2. Search

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 2.1 | **No match highlighting or "why this result" context** | 🔵 Enhancement | Results still show counts and snippets, but not explicit hit highlighting. |

## 3. Mail Management Depth

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 3.1 | **No account reorder** | 🔵 Enhancement | Multi-account users still cannot reorder or pin accounts. |
| 3.2 | **No notification preferences** | 🔵 Enhancement | Users still cannot scope alerts by sender, thread, or category. |
| 3.3 | **Notification re-prompt path is still weak** | 🔵 Enhancement | Dismissing the prompt is better now, but there is still no explicit settings entry point dedicated to notification preferences later. |

## 4. Visual & Polish Gaps

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 4.1 | **Typography system is still slightly inconsistent** | 🟢 Medium | Radius still uses serif prominently in onboarding/reader and mostly sans in inbox/compose. The product remains attractive, but the system is not yet fully unified. |
| 4.2 | **Theme picker still lacks preview affordances** | 🟢 Medium | Theme names remain text-only; swatches or previews would reduce trial-and-error. |
| 4.3 | **Toast overflow management is still limited** | 🟢 Medium | Multiple simultaneous toasts can still crowd the screen. |

## 5. Delight & Advanced Desktop Fit

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 5.1 | **No in-window sent confirmation state** | 🔵 Enhancement | Sending still closes the compose surface quickly instead of briefly confirming success in context. |
| 5.2 | **No desktop-native drag interactions beyond attachments** | 🔵 Enhancement | There is still no broader drag affordance for message management or organization. |
| 5.3 | **Newsletter rendering lacks a user-controlled fallback** | 🔵 Enhancement | A "Show plain version" or alternate render toggle would improve trust when newsletter detection misclassifies edge cases. |

---

## Updated Priorities

### Closed in this pass
1. Added scheduled send.
2. Integrated search and result refinement.
3. Added lightweight sort/filter support.
4. Surfaced compose-suggestion failures and added deeper sync recovery.

### High-value next wave
1. Add notification preferences.
2. Add theme previews.
3. Add a brief in-window sent confirmation state.
4. Add a plain-version fallback for newsletters.

### Nice-to-have polish
1. Improve toast stack overflow handling.
2. Add print support.
3. Preserve back-navigation context more deliberately.
4. Allow account reorder.

---

## Updated Heuristic Evaluation

| Heuristic | Rating | Key Issue |
|-----------|--------|-----------|
| Visibility of system status | 🟢 10/10 | Sync details now pair status, recovery actions, and recent history |
| Match between system and real world | 🟢 9/10 | Terminology is much clearer now |
| User control and freedom | 🟢 9/10 | Scheduled send, refine controls, and clearer recovery actions materially improve control |
| Consistency and standards | 🟢 8/10 | Stronger command/search consistency; typography still slightly split |
| Error prevention | 🟢 10/10 | Compose failures surface clearly and delayed send reduces accidental delivery pressure |
| Recognition rather than recall | 🟢 8/10 | Shortcuts, mailbox access, and first-run guidance reduced memory burden |
| Flexibility and efficiency | 🟢 9/10 | Search, refinement, scheduling, and recovery now cover most high-value flows |
| Aesthetic and minimalist design | 🟢 9/10 | Still a standout strength |
| Help users recognize, diagnose, recover from errors | 🟢 10/10 | Recovery now includes explicit feedback, retry paths, and sync details/history |
| Help and documentation | 🟢 8/10 | First-run guidance and shortcut surfacing closed most of the previous gap |

---

## Final Assessment

Radius has moved from **"beautiful but friction-heavy"** to **"confidently usable as a calm daily driver"**. Discovery, mailbox switching, first-run learning, read-state control, thread comprehension, search refinement, compose flexibility, and sync recovery now work together as a coherent desktop UX.

What remains after this pass is polish and depth rather than a structural blocker:
- deeper notification preferences,
- more theme preview affordance,
- extra delight states,
- and a few advanced desktop niceties.
