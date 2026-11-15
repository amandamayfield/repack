# RePack — CLAUDE.md

Ground truth for agents working in this repo, verified against the code as of commit `cbc10fe`. When they disagree, the code wins.

## What the app is

**RePack** is a personal packing assistant. A user builds reusable **saved lists** (templates, e.g. "Camping"), creates a **trip**, and **imports** saved lists into it. Trip items are independent, checkable copies: packing a trip never changes the list it came from. **Categories** group items on both. The core value is the template → copy split plus per-trip packing progress.

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
- **The baseline is `.claude/initial-user-audit.md`** (2026-11-14). The newest file in `.claude/user-audits/` replaces it once that folder exists. Its top fixes:
  1. Duplicate a trip / save a trip as a list.
  2. Re-sync a trip from an edited list, and handle duplicate items on import (today each list can be imported only once, and same-name items are copied twice).
  3. Unpack all / hide packed.
  4. Friendlier sign-up: show password rules up front, add password recovery, guide the first visit.
  5. Larger controls that are always visible, plus undo after delete.

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
| `models.py` | `Category`, `SavedList`, `SavedListItem`, `Trip`, `TripItem` |
| `serializers.py` | Model serializers; `OwnedCategoryMixin` limits `category` to the user's own |
| `views.py` | ViewSets; `next_order()` assigns item/category `order` server-side |
| `auth.py` | `UserSerializer` (runs password validators), `AuthThrottle`, register/login/logout/me/csrf views |
| `authentication.py` | `SessionAuthentication401`, kept separate from `auth.py` to avoid a circular import |
| `admin.py` | All models registered |

### Data model
- **Category**: `{user, name, order}`.
- **SavedList**: `{user, name, description, created_at, updated_at}`, with many `items`.
- **SavedListItem**: `{saved_list, category?, name, quantity?, order}`. It has no `packed` field.
- **Trip**: `{user, name, start_date?, end_date?, imported_lists (M2M → SavedList), created_at, updated_at}`. Trips use dates only (the `days` field was removed), and `end_date >= start_date` is validated.
- **TripItem**: `{trip, category?, name, quantity?, packed, order}`.
- `quantity` must be ≥ 1 when set.

### API (all under `/api/`)

Auth:
- `POST auth/register/`, `POST auth/login/`, `POST auth/logout/`, `GET auth/me/`, `GET auth/csrf/`.
- Register and login are throttled to 10 per minute per IP (429 after that).

Status codes, which the frontend relies on:
- **401** means not logged in.
- **403** means a CSRF failure or not allowed.
- **404** means another user's object. Cross-user access is always 404, never 403.

CRUD (DRF routers):
- `categories/`, `saved-lists/`, `saved-list-items/`, `trips/`, `trip-items/`.
- List vs detail:
  - `GET saved-lists/` returns summaries without items; the detail view embeds `items`.
  - `GET trips/` returns `packed_count` and `total_count` (computed in the database); the detail view embeds `items` and `imported_lists`.
- `order` is assigned by the server on create (appended last). Clients don't send it.
- Child items check that you own the parent (`saved_list` / `trip`) and the `category`.

Custom action:
- `POST trips/{id}/import-list/` with `{saved_list_id}` returns 201. It copies the list's items into the trip, unpacked and appended after existing items.
- A list can be imported into a given trip **only once**; a repeat returns **409**.

## Frontend (`frontend/src/`)

- **`api/client.js`**: `api(path, {method, body})`.
  - Sends cookies, and fetches the CSRF cookie only if it's missing.
  - Throws an `ApiError` (`api/ApiError.js`) with `.status`, `.body` and `.messages()`. `errorMessage(err, fallback)` turns a 400 into the server's messages.
  - On any 401 it calls the handler `AuthProvider` registers via `setUnauthorizedHandler`, which clears the user so `RequireAuth` redirects to `/login`. **Pages never handle 401 themselves.**
- **Routes** (`App.jsx`):
  - `/login`
  - `/trips` (luggage-tag cards with a progress bar)
  - `/trips/:id` (progress ring hero, items grouped by category, edit/delete trip and items, add item, import a list)
  - `/lists`, `/lists/:id` (editor, edit details)
  - `/categories` (add, rename, delete)
- **Shared components:**
  - `ItemRow`: view, inline edit and delete; it renders the checkbox only when given `onToggle`.
  - `ItemForm`, `TripForm`, `ListForm`: create mode when there's no `onCancel`, edit mode with it.
  - `ProgressBar` (dashboard) and `ProgressRing` (trip page). Both use `role="progressbar"` and show "All packed" at 100%.
- **`hooks/useDialog.jsx`**: `const { confirm, alert, dialog } = useDialog()`, then `await confirm({title, message, confirmLabel})`. It renders `components/Dialog.jsx`, a native `<dialog>`. **Use it in place of `window.confirm` / `window.alert`.**
- **`hooks/useFetch.js`**: `{data, error, loading, reload}` for GETs.
- **`lib/grouping.js`**: client-side progress counts and grouping by category. **`lib/dates.js`**: `formatDateRange` (UTC-safe).
- **Progress is computed two ways on purpose.** The dashboard uses the server counts so it doesn't download every item. The trip page computes from the items it already has, and checking an item updates it optimistically (rolling back if the save fails).

### Styling
- All styling is in `src/App.css`. It uses plain CSS with tokens on `:root` and a `prefers-color-scheme: dark` override. Fonts are Zilla Slab (headings) and Atkinson Hyperlegible (body), loaded from Google Fonts in `index.html`.
- **Direction (chosen by the user): outdoorsy & warm.** Canvas off-white, pine ink, forest-green actions, berry for destructive actions.
  - Trail-blaze **ochre is reserved** for the 100% "All packed" moment on the ring.
  - Trip cards are styled as luggage tags.
- Class naming is BEM-ish (`trip-card__name`, `item-row--packed`). Layout helpers: `.panel`, `.form`, `.field`, `.field--grow`/`--narrow`, `.form__actions`, `.button` plus `--ghost`/`--small`/`--danger`/`--quiet-danger`.

## Conventions & gotchas

- **AI-generated files live in `.claude/`:** audits (`.claude/initial-user-audit.md`, `.claude/user-audits/`), design docs (`.claude/specs/`), plans (`.claude/plans/`). This overrides any skill's default location, such as `docs/superpowers/`. `CLAUDE.md` stays at the repo root.
- **Commits:** one line in the form `feat|fix|test: short description`, with **no `Co-Authored-By` or other trailers**. Don't commit unless asked.
- **Formatting:**
  - Backend uses ruff (`backend/pyproject.toml`): tabs, line length 120, import sorting, RUF012 ignored for Django's list class attributes, migrations excluded.
  - Frontend uses Prettier defaults plus ESLint.
- **Tests:**
  - Backend tests need the Postgres container (`docker compose up -d db`). Shared fixtures (`client_for`, `auth_client`, `other_client`) are in `api/tests/conftest.py`.
  - Frontend tests mock `api/client` as `{ api: vi.fn(), setUnauthorizedHandler: vi.fn() }`; reject with `new ApiError(status, body)`.
  - Dropdown options load in their own requests, so **wait for an option** (`findAllByRole("option", …)`) before `selectOptions`, or the test will be flaky.
  - `src/test/setup.js` polyfills `<dialog>` for jsdom.
- **CI:** none is set up yet.
