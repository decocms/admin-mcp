# Releases & Scheduled Changes — UX Design

**Date:** 2026-05-04
**Status:** Draft (brainstorm validated, ready for implementation plan)
**Owner:** rafavalls

## 1. Context

Today the admin uses **variants** as the conditional-rendering primitive on a section. Each section can be marked `isMultivariate` and carry an array of variants, where each variant has a `rule` (matcher: device, date range, location, random %, host, pathname) and a `value` (the section's content).

Users have started repurposing the **date-range matcher** as a campaign scheduler: set a variant's rule to `{ start, end }` and the variant renders only during that window. It works, but the UX of "go into multivariate mode → pick the date matcher → fill in the variant value" is not what scheduling a campaign should feel like, and the word *variant* leaks an A/B-testing mental model into a campaign-shipping task.

Underneath, the storage model is git-backed: each user gets a sandbox environment that is literally a branch (`api/tools/environments.ts`), saves write to its working tree, `git_publish` commits + pushes, and `promote_to_production` deploys a chosen commit SHA. None of this should ever be visible to the user.

## 2. Principles

1. **No git in the UX.** No branches, commits, merges, diffs, conflicts, push, pull, HEAD, main. Translate to product language: **Release**, **Live**, **Schedule**, **Draft**, **Revert**, **History**, **Compare to live**.
2. **Variants stay as a primitive — but the scheduling use case gets its own door.** A/B testing and device targeting still belong in the variants UI. Time-windowed campaigns get a first-class flow that happens to be implemented on top of variants.
3. **Keep the lightness of "lovable."** Default path for a single scheduled change is one click + a date — no new objects to manage, no mode-switching.
4. **Context lives at the section level, not globally.** The user is never "in Black Friday mode" across the whole admin. They only see Black Friday content when they've explicitly opened that section's release version.

## 3. Conceptual Model

- **Live** is the default context. Whatever is currently rendering in production.
- **Release** is the unit of "stuff that goes live together at a time." A release has:
  - An optional **name** (e.g. *Black Friday 2026*). If omitted, the release is identified by its scheduled date.
  - A **scheduled date** (start) — applies to the release as a whole; every section change inside the release goes live at this moment.
  - An optional **end date** — also applies to the release as a whole; omitted = permanent ship.
  - A **list of section changes** — one or more sections (across one or more pages) whose content changes when the release is live.
  - A **status**: *Scheduled · Live · Ended*.

End date being a release-level property (not per-section) means a campaign can't have inconsistent end dates across its sections, and the user only sets it once.

A release with end-date set behaves like a temporary overlay (auto-reverts when the window closes, because the underlying date-matched variant stops firing). A release with no end is a permanent ship.

**Single mental model, two natural shapes:** end-bounded campaigns and open-ended ships are the same thing with a different end value.

## 4. Authoring Flow — the Publish Chevron

The Publish button is the only way to put changes live. It **always opens a small popover** when clicked — there is no "click to publish instantly" path. Every publish is a deliberate choice.

```
┌─────────────────────────────────┐
│  ◉ Publish now                  │
│  ◯ Schedule for…    ▢ date     │
│                                 │
│  Release name (optional)        │
│  ┌────────────────────────────┐ │
│  │ Black Friday          ▾    │ │   ← suggests existing upcoming releases
│  └────────────────────────────┘ │
│                                 │
│              [ Cancel ] [ Save ]│
└─────────────────────────────────┘
```

**Behavior**

- *Publish now* → updates the section's base content, commits, and goes live. No release is created. No variant is created.
- *Schedule for…* + a date → creates (or attaches to) a release. Under the hood, this writes a date-matched variant on the section; we never expose the variant primitive in this flow.
- The **Release name** field is optional:
  - **Blank** → the change is grouped by its scheduled date in the Releases view (e.g. all blank-named changes scheduled for Nov 24 cluster under one *Nov 24* entry).
  - **Typed** → first time creates a release with that name; the dropdown then suggests existing upcoming releases so other section edits can join the same one.
- The chevron only sets the **start** date. The **end date** is a property of the release as a whole and is set/edited on the release detail page (Section 6). Default = no end date = permanent ship. This avoids per-section drift in campaign end times.

The chevron lives wherever Publish lives today. No new editing context is introduced for the simple case.

## 5. Cross-Page Campaigns

For a campaign like Black Friday that touches the home hero + category banner + nav CTA:

1. User edits the home hero, opens Publish chevron, picks *Schedule for Nov 24*, types **Black Friday** in the name field, hits Save.
2. User navigates to the category page, edits the banner, opens chevron, picks *Schedule for Nov 24*, the name field's dropdown now suggests **Black Friday** — they pick it.
3. Same for the nav CTA.

All three section changes belong to one *Black Friday* release. Visible together in the Releases view.

## 6. The Releases View

**Primary entry:** sidebar / top nav item labeled **Releases**.

**Default view:** list, sorted by scheduled date soonest-first. A toggle in the header switches to a calendar view (same data, visual layout). Search by name, filter by status.

**List rows show:**

- Name (or scheduled date if unnamed)
- Scheduled date (and end date if set)
- Count of section changes
- Status pill: *Scheduled · Live · Ended*

**Click a release → detail page/drawer:**

- Header: name (editable), **start date**, **end date** (optional, "Set end date" if blank), status, *Cancel release* action.
- **Changes in this release** — a list, one row per (page, section), with a snippet/preview of the new content.
- Per row actions: *Edit content · Remove from release*.

**Action semantics:**

- *Reschedule* = edit start or end date in the header. Applies to the whole release.
- *Cancel release* = remove all of the release's section changes; live content is unaffected (it was never overwritten because the release hadn't gone live yet, or — if currently live — falls back to base on next render). Confirmation required.
- *Remove from release* = drop just that one section's change; the release continues with its remaining sections.

Status transitions are derived from dates: *Scheduled* before start, *Live* between start and end, *Ended* after end. No manual state changes.

## 7. Editing a Release's Section

Clicking *Edit content* on a row in the release detail opens the section editor focused on that section, with a banner at the top:

```
┌─────────────────────────────────────────────────────────────┐
│  Editing: Black Friday version of Home / Hero               │
│  Scheduled Nov 24                            [ Switch to Live ]│
└─────────────────────────────────────────────────────────────┘
```

The Publish chevron in this context offers different options:

- *Update this release* (default — saves to the release; goes live at the release's scheduled time)
- *Publish to Live now* (promotes this section's release content to base immediately and removes it from the release; the rest of the release continues unchanged)

Rescheduling is done on the release detail page (start/end dates apply release-wide), not from the section editor.

## 8. Discoverability from the Section Editor

When a user opens a section normally (not via a release) and that section has any upcoming scheduled change, the section header shows a small badge:

```
Hero  ·  1 scheduled change · Nov 24  →
```

Click → jumps into that release's detail (or directly into editing that section's release version if there's only one).

This means an editor working on Live can never be surprised by a future change "appearing" — there's always a marker.

## 9. Editing a Currently-Live Release

A release whose window contains "now" is rendering on production. Editing its content updates what's live immediately.

**Decision:** Saving an edit to a currently-live release shows a small confirmation:

> *"This release is live now — your edit will go live immediately. Continue?"*

[ Cancel ] [ Update live ]

Tiny friction, prevents oops moments. The case is rare; the friction won't annoy.

## 10. Mapping to Existing Code (under the hood)

| UX concept | Underlying mechanism |
|---|---|
| *Publish now* | Edit base section content → `git_publish` → `promote_to_production` |
| *Schedule for…* | Create/extend a `CmsVariant` on the section with `rule = { start, end }`, `value = new content` → `git_publish` → `promote_to_production` |
| *Release* (named) | Logical grouping of date-matched variants by a shared name. Stored either as metadata on each variant or as a sidecar release index. **Decision deferred to plan phase.** |
| *Release* (unnamed) | Logical grouping by exact scheduled date. No new storage; computed at read time by clustering variants whose start date matches. |
| *Live* | Current production deployment (existing concept). |
| *Switch to Live* | Navigate to base content of that section. |
| *Cancel release* | Remove the date-matched variants from involved sections → `git_publish` → `promote_to_production`. |

## 11. Out of Scope (this design)

- A/B testing UX. Variants as a primitive remain for non-time matchers (device, location, random %, etc.). Their UI is not changed by this design.
- **Conflict handling** when two releases overlap on the same section. For v1, last-scheduled wins inside the overlap window (matches current variant array order semantics). Surface a passive warning ("Overlaps with *Cyber Monday*") in the release detail when detected; full conflict resolution UX is a follow-up.
- **Approval / review workflows** (multi-user signoff before scheduling).
- **Audit log** of who created/edited a release. Likely needed soon, but not part of this design.
- **Release templates** ("clone last year's Black Friday").

## 12. Open Question for the Plan Phase

How exactly to persist the *release* grouping — name, schedule, member sections — given the existing variant storage. Two viable shapes:

- **Embed on each variant:** add a `releaseId` / `releaseName` field to the variant rule metadata. Simple, no new files. Reads must aggregate across the file tree to list a release.
- **Sidecar release index:** a `.deco/releases/{id}.json` file listing the release's metadata + member references. Cheap to list, but two write-paths to keep consistent.

This is an implementation decision, not a UX one. Punt to the plan.
