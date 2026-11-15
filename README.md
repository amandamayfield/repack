# RePack

by Amanda Mayfield

---

### About

A packing app with reusable lists to streamline packing for trips.

Build **saved lists** of the things you always bring (e.g. "Camping"), then create a **trip** and import a list into it. Trip items are independent copies you check off as you pack, so packing a trip never changes the list it came from. Group items with **categories** and track progress per trip.

**Stack:** React (Vite) → Django + Django REST Framework → PostgreSQL, with session-cookie auth. In production Django serves the built React app from the same origin.

### Run Locally

**Prerequisites:** Python 3.13, Node 22+, Docker (for Postgres).

1. **Start Postgres** (from the repo root):

   ```bash
   docker compose up -d db
   ```

2. **Backend** (from `backend/`):

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements-dev.txt
   cp .env.example .env   # then set DJANGO_SECRET_KEY (the file shows how to generate one)
   python manage.py migrate
   python manage.py runserver
   ```

   The API runs at `http://127.0.0.1:8000/api/`.

3. **Frontend** (from `frontend/`, in a second terminal):

   ```bash
   npm install
   npm run dev
   ```

   Open `http://localhost:5173`. Vite proxies `/api` to Django, so create an account on the sign-in page and you're in.

### Tests, linting & formatting

| | Backend (`backend/`, venv active) | Frontend (`frontend/`) |
|---|---|---|
| Tests | `pytest` (needs the Postgres container running) | `npm test` (watch) or `npx vitest run` |
| Lint | `ruff check .` | `npm run lint` |
| Format | `ruff format .` | `npm run format` |

### Production build

Django serves the React bundle itself (via WhiteNoise), so there's a single server:

```bash
cd frontend && npm run build          # writes to backend/frontend_build/
cd ../backend && python manage.py collectstatic --noinput
gunicorn repack.wsgi
```

With `DJANGO_DEBUG` unset or `False`, Django turns on HTTPS redirects, secure cookies and HSTS. Set `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` and, behind a proxy that sets `X-Forwarded-Proto`, `DJANGO_BEHIND_PROXY=True`. See `backend/.env.example` for every setting.
