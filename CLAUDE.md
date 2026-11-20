# RePack — CLAUDE.md

Ground truth for agents working in this repo, verified against the code as of commit `56aed6c`. When they disagree, the code wins.

## What the app is

**RePack** is a personal packing assistant. A user builds reusable **saved lists** (templates, e.g. "Toiletries"), creates a **trip**, and adds lists to it. A trip is an ordered set of headed **sections**: each is either **synced** to a saved list or a **trip-only** heading (e.g. "Wedding"). Items are a name plus an optional amount. Synced sections follow later edits to their list on current and upcoming trips, one way only; ticks, trip-only amounts, deletions and extras stay on the trip. The core value is per-trip packing progress over reusable lists.

## User personas

Judge user-facing changes against three fixed personas. Each file has the full profile and journey.

| Persona | Who | Stands for |
|---|---|---|
| **Maya** (`maya.md`) | 26, experienced traveler, month-long multi-city Europe trip | Power users: complex trips, reusing lists, bulk actions |
| **Harold** (`harold.md`) | 78, first-time app user, low vision, hand tremor | Accessibility, first-run clarity, plain wording, forgiving controls |
| **Priya** (`priya.md`) | 41, business traveler, 2–3 trips a month | Speed: fewest taps, repeat trips, using it on a phone |

- The persona files are in `.claude/skills/persona-audit/personas/`. Treat them as the source of truth; this table is only a summary.
- **When designing or reviewing a UI or flow change,** say which personas it affects and how. When a change fixes or touches a finding from the latest audit, say so.
- **The `/persona-audit` skill re-runs the audit.** Pass persona names to run a subset (e.g. `/persona-audit harold`), plus any free text to focus on one area. It saves a dated report to `.claude/user-audits/YYYY-MM-DD.md` and marks each earlier finding as fixed, still open, or worse. Suggest running it after a user-facing change lands.

## Architecture

```
React 19 (Vite) → Django 5.2 + DRF → PostgreSQL 16
```

- **Same origin.** In production Django serves the built React bundle (WhiteNoise) and the API lives under `/api/`. Auth is **Django session cookies**, so every write needs a CSRF token.
- **Dev:** two servers. Django on `:8000`, Vite on `:5173`, and Vite proxies `/api` to Django. Setup, tests, linting and the production build are in `README.md`.
- `backend/` is the Django project `repack` with one app, `api`. `frontend/` is the Vite app.

## Backend (`backend/api/`)

| File | Role |
|---|---|
| `models.py` | `SavedList`, `SavedListItem`, `Trip`, `TripSection`, `TripItem` |
| `serializers.py` | Model serializers; the trip-side edit rules live in `TripItemSerializer.validate` and `TripSectionSerializer.validate` |
| `views.py` | ViewSets; `next_order()` assigns `order` server-side; views call `sync.py` inside `transaction.atomic()` |
| `sync.py` | All list → trip sync rules, past-trip catch-up and `duplicate_trip`. Called explicitly; there are no signals |
| `auth.py` | `UserSerializer` (runs password validators), `AuthThrottle`, register/login/logout/me/csrf views |
| `authentication.py` | `SessionAuthentication401`, kept separate from `auth.py` to avoid a circular import |
| `admin.py` | All models registered |

### Data model
- **SavedList**: `{user, name, description, created_at, updated_at}`, with many `items`.
- **SavedListItem**: `{saved_list, name, quantity?, order}`. It has no `packed` field and can't move to another list.
- **Trip**: `{user, name, start_date, end_date, created_at, updated_at}`. Both dates are required (migration `0010` deleted older trips missing either), and `end_date >= start_date` is validated. Names are unique per user, ignoring case, on create, edit and duplicate (a 400 on `name`). `validate_name` gives the message; the `unique_trip_name_per_user` constraint catches two saves at once, and `saving_trip_name` in `views.py` turns that into the same 400.
- **TripSection**: `{trip, saved_list?, custom_name, order}`. `saved_list` null means trip-only. One section per list per trip (unique constraint). `display_name` is `custom_name`, else the list's name, else "Deleted list".
- **TripItem**: `{section, source_item?, from_list, name, quantity?, packed, quantity_overridden, removed, order}`.
  - `from_list` marks a synced item; `False` is a trip-only extra. Use it, not `source_item is None`, which also happens when a past trip's list item was deleted.
  - `removed` is a tombstone for a synced item deleted on the trip: left out of `items` and the counts (only its section's `removed_items` shows it, for restoring), and it stops sync adding the item back.
- `saved_list` and `source_item` are `SET_NULL`, so past trips keep their copies when lists change.
- `quantity` must be ≥ 1 when set.

### Sync rules (`sync.py`)
- A trip is **current** when its `end_date` is today or later (server date, UTC). Only current trips sync; past trips stay as they were.
- Removed items still get list renames and amount changes, so a restored item matches the list as it is now.
- List item added → appended after the section's synced items, before extras. Renamed → renamed and unticked. Amount changed → updated, and unticked only if it went up (a blank amount counts as 1), unless the trip set its own amount (`quantity_overridden`), which wins and keeps its tick. Deleted → removed from current trips.
- List renamed → past sections keep the old name. List deleted → removed from current trips; past trips keep it as a trip-only section whose items become extras.
- A trip whose end date moves from past to current catches up (`catch_up_trip`).
- Duplicate trip rebuilds synced sections from the list as it is now, then reapplies the trip's own amounts and deletions; extras and trip-only sections are copied; nothing is ticked. The copy takes the name and dates it's given; with no name it's the next free "Copy of …", then "(2)", "(3)"… (`sync.copy_name`, also sent as the detail's `copy_name` for the form to prefill).

### API (all under `/api/`)

Auth:
- `POST auth/register/`, `POST auth/login/`, `POST auth/logout/`, `GET auth/me/`, `GET auth/csrf/`.
- Register and login are throttled to 10 per minute per IP (429 after that).

Status codes, which the frontend relies on:
- **401** means not logged in.
- **403** means a CSRF failure or not allowed.
- **404** means another user's object. Cross-user access is always 404, never 403. Pointing a field at someone else's trip, list or section is a 400.

CRUD (DRF routers):
- `saved-lists/`, `saved-list-items/`, `trips/`, `trip-sections/`, `trip-items/`.
- List vs detail:
  - `GET saved-lists/` returns summaries without items; the detail view embeds `items`.
  - `GET trips/` returns `packed_count` and `total_count` (computed in the database, `removed` left out); the detail view embeds `sections`, each `{id, name, saved_list, is_synced, order, items, removed_items}` (`removed_items` is `[{id, name}]`).
- `order` is assigned by the server on create (appended last). Clients don't send it.
- `PATCH saved-list-items/{id}/` also returns `unticked_trips`: the names of current trips where that edit unticked the item. The list editor shows them.

Trip sections:
- `POST trip-sections/` with `{trip, saved_list}` copies the list in; with `{trip, name}` makes a trip-only heading. The same list twice on one trip is a **400** `{saved_list: ["This list is already on this trip."]}`.
- `PATCH {name}` renames on this trip only (blank restores the list's name on a synced section). `trip` and `saved_list` can't change. `DELETE` removes the section and its items; adding the list again gives a fresh copy.
- `POST trips/{id}/reorder-sections/` with `{section_ids}` → 204: every section of the trip, once each, else 400.
- `POST trips/{id}/duplicate/` with `{start_date, end_date}` and an optional `name` (validated like a new trip) → 201 with the copy's detail.
- `POST trips/{id}/add-lists/` with `{saved_lists}` → 204. Adds a synced section per list, in the order given, all or none: any id that isn't the user's, a repeat, or a list already on the trip is a 400. `POST trips/` accepts the same `saved_lists` to start a trip with them.
- `POST trips/{id}/untick-all/` → 204. Unticks every item on the trip, or only one section's with `{section}` (a section of another trip is a 400). Removed items are left alone.

Trip items (`trip-items/`):
- `POST {section, name, quantity?}` adds an extra.
- On a synced item: changing `quantity` sets `quantity_overridden`; changing `name` is a 400; `DELETE` sets `removed`. Resending unchanged values is fine. On an extra, edits and `DELETE` act normally.
- `POST trip-items/{id}/restore/` → 200 with the item: clears `removed` and unticks it (a live item is left as it is).
- Items can't move between sections.

## Frontend (`frontend/src/`)

- **`api/client.js`**: `api(path, {method, body})`.
  - Sends cookies, and fetches the CSRF cookie only if it's missing.
  - Throws an `ApiError` (`api/ApiError.js`) with `.status`, `.body` and `.messages()`. `errorMessage(err, fallback)` turns a 400 into the server's messages.
  - On any 401 it calls the handler `AuthProvider` registers via `setUnauthorizedHandler`, which clears the user so `RequireAuth` redirects to `/login`. **Pages never handle 401 themselves.**
  - `AuthProvider` exposes `signOutReason`: `"expired"` (a 401 while signed in), `"logout"`, or `null`. `RequireAuth` passes `state.from` unless the user logged out, and `LoginPage` returns there after sign-in and shows "You were signed out" on expiry. Sessions renew on every request (`SESSION_SAVE_EVERY_REQUEST`).
- **Routes** (`App.jsx`):
  - `/login`
  - `/trips` (luggage-tag cards with a progress bar; the New trip form can tick saved lists, then opens the trip)
  - `/trips/:id` (progress ring hero; sections with Hide/Show, rename, move, remove, items and their own Add item form; "Add a section" ticks any number of saved lists or makes a heading; duplicate (asks for a name and dates, prefilled with the same length from today by `sameLengthFromToday` in `lib/dates.js`)/edit/delete trip)
  - `/lists`, `/lists/:id` (editor, edit details)
- **Shared components:**
  - `ItemRow`: view, inline edit and delete; it renders the checkbox only when given `onToggle`. Amounts show as `×3`, read aloud as ", quantity 3".
  - `ItemForm`, `TripForm`, `ListForm`: create mode when there's no `onCancel`, edit mode with it. `lockName` on `ItemForm`/`ItemRow` limits a synced trip item's edit to its amount.
  - `ListChecklist`: checkboxes for picking saved lists, used by `TripForm` (given `lists`) and `AddSectionForm`.
  - `TripSection` and `AddSectionForm` (trip page). `TripSection` remembers Hide/Show per browser in `localStorage` (`repack.section-collapsed.<id>`).
  - `ProgressBar` (dashboard) and `ProgressRing` (trip page). Both use `role="progressbar"`; only the ring shows "All packed" at 100%.
- **`hooks/useDialog.jsx`**: `const { confirm, alert, prompt, dialog } = useDialog()`, then `await confirm({title, message, confirmLabel})`; `prompt` resolves to the text or `null`. It renders `components/Dialog.jsx`, a native `<dialog>`. **Use it in place of `window.confirm` / `window.alert`.**
- **`hooks/useFetch.js`**: `{data, error, loading, reload}` for GETs.
- **`lib/progress.js`**: `computeProgress(items)`. **`lib/dates.js`**: `formatDateRange` (UTC-safe).
- **Progress is computed two ways on purpose.** The dashboard uses the server counts so it doesn't download every item. The trip page computes from the sections it already has, and checking an item updates it optimistically (rolling back if the save fails).
- **Deletes on a trip ask first.** A synced item's message says the list keeps it; an extra's says it can't be undone.

### Styling
- All styling is in `src/App.css`. It uses plain CSS with tokens on `:root` and a `prefers-color-scheme: dark` override. Fonts are Zilla Slab (headings) and Atkinson Hyperlegible (body), loaded from Google Fonts in `index.html`.
- **Direction (chosen by the user): outdoorsy & warm.** Canvas off-white, pine ink, forest-green actions, berry for destructive actions.
  - Trail-blaze **ochre is reserved** for the 100% "All packed" moment on the ring.
  - Trip cards are styled as luggage tags.
- Class naming is BEM-ish (`trip-card__name`, `item-row--packed`). Layout helpers: `.panel`, `.form`, `.field`, `.field--grow`/`--narrow`, `.form__actions`, `.button` plus `--ghost`/`--small`/`--danger`/`--quiet-danger`.

## Conventions & gotchas

- **AI-generated files live in `.claude/`:** audits (`.claude/user-audits/`), design docs (`.claude/specs/`), plans (`.claude/plans/`). This overrides any skill's default location, such as `docs/superpowers/`. The whole `.claude/` folder is git-ignored and never committed. `CLAUDE.md` stays at the repo root.
- **Commits:** one line in the form `feat|fix|test: short description`, with **no `Co-Authored-By` or other trailers**. Don't commit unless asked.
- **Formatting:**
  - Backend uses ruff (`backend/pyproject.toml`): tabs, line length 120, import sorting, RUF012 ignored for Django's list class attributes, migrations excluded.
  - Frontend uses Prettier defaults plus ESLint.
- **Tests:**
  - Backend tests need the Postgres container (`docker compose up -d db`). Shared fixtures (`client_for`, `auth_client`, `other_client`) are in `api/tests/conftest.py`.
  - Frontend tests mock `api/client` as `{ api: vi.fn(), setUnauthorizedHandler: vi.fn() }`; reject with `new ApiError(status, body)`.
  - Saved-list checkboxes load in their own request, so **wait for one** (`findByRole("checkbox", { name: … })`) before clicking it, or the test will be flaky.
  - `src/test/setup.js` polyfills `<dialog>` for jsdom, and restores jsdom's `localStorage` when Node 25+'s own experimental one shadows it.
- **CI:** none is set up yet.
