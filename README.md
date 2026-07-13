# webdicom

A self-hosted, web-based DICOM viewer. Upload the CD or DVD a radiology department
handed you, and read it in a browser — no desktop viewer to install, no data leaving
your machine.

Runs as a single Docker container. Files are stored on a plain mounted volume, in a
directory tree you can read with `ls`.

## What it does

**Viewer** — a dark, Weasis-style workstation.

- Stack scrolling, pan, zoom, window/level, with CT presets (lung, bone, brain, abdomen…)
- Measurements: length, angle, rectangle/ellipse ROI (mean, SD, min, max, area), probe.
  On CT these read in **Hounsfield units** — an ROI over air reads about −1000 HU.
- Viewport grids from 1×1 to 3×3; drag any series into any cell
- **MPR**: reconstruct a volume into linked axial / sagittal / coronal planes with crosshairs
- Cine playback for multi-frame series, DICOM tag inspector, PNG export

**Ingest** — built for the mess that real burned discs actually contain.

- Accepts a ZIP or TAR of a disc, a dropped folder, or loose files
- Detects DICOM by **content, not extension** (files on a real DVD are named `A0001`,
  `B0001`… with no extension at all)
- Uses `DICOMDIR` when present, but always walks the whole tree too — burned-CD
  DICOMDIRs are frequently stale or incomplete
- Silently ignores the bundled viewers, DLLs, autorun stubs and PDFs that ship on every
  disc, instead of reporting 40 "errors"
- Re-uploading the same disc is a no-op (deduplicated on SOP Instance UID)
- Runs in the background with a live progress bar and a per-file error report

**Accounts** — self-registration; the first account created becomes the administrator.
Each user sees only their own exams, and every API path is scoped to them.

## Quick start

```bash
git clone <this repo> && cd webdicom
docker compose up --build
```

Open <http://localhost:8080>, create an account (the first one is the admin), and drag
an exam onto the drop zone.

All configuration lives in the `environment:` block of `docker-compose.yml` — there is no
separate `.env` file, so there is exactly one place to look.

## Storage layout

DICOM files land on the `/dicomfiles` volume in a human-browsable tree:

```
/dicomfiles/<user>/<Patient>__<PatientID>/<StudyDate>_<Description>_<hash>/
    <SeriesNo>_<Description>_<hash>/<SOPInstanceUID>.dcm
```

for example:

```
/dicomfiles/arthur/CARANTA_ARTHUR__E10000740190/20210315_ABDO_PELVIS_f9d6120c/
    002_AP_Sans_IV_ff4531df/1.2.840.113619.2.5.166636469.65900.1615815612.746.dcm
```

Every path component is sanitized to ASCII — DICOM descriptions contain slashes
(`ABDO/PELVIS`), accents and trailing spaces, none of which are safe as directory names.
The trailing hash makes two same-day studies with the same description distinct.

The SQLite index, thumbnails and session secret live on the separate `/data` volume. The
index is a cache: the DICOM files themselves are the source of truth.

## Configuration

Set these in the `environment:` block of `docker-compose.yml`. Every one has a working
default.

| Variable | Default | |
|---|---|---|
| `REGISTRATION_ENABLED` | `true` | Set `false` to close signups once your users exist |
| `COOKIE_SECURE` | `false` | Set `true` when serving over HTTPS |
| `SESSION_TTL_HOURS` | `168` | How long a sign-in lasts |
| `MAX_UPLOAD_MB` | `8192` | A burned DVD is typically 300–700 MB |
| `MAX_EXTRACT_MB` | `20480` | Zip-bomb guard |
| `DICOMWEB_TRANSCODE` | `auto` | `auto` streams compressed frames straight to the browser |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Optional: pre-create an admin instead of self-registering |

## Architecture

One container, two processes under supervisor: nginx serves the SPA and reverse-proxies
uvicorn. Because they share an origin, the `HttpOnly` session cookie rides along on the
image requests with no CORS and no token plumbing.

```
browser ──┬─ /            → nginx → static SPA (React, Cornerstone3D)
          ├─ /api/*       → uvicorn (auth, upload, library)
          └─ /dicomweb/*  → uvicorn (QIDO-RS, WADO-RS)  ← the viewer loads pixels here
                                │
                  SQLite index (/data)   DICOM files (/dicomfiles)
```

The image API is a **minimal DICOMweb subset** (QIDO-RS + WADO-RS), which is what
Cornerstone3D speaks natively — so it streams frames per-slice rather than downloading
whole files, and you could point another DICOMweb client at the same server.

Compressed frames (JPEG, JPEG-LS, JPEG 2000, HTJ2K, RLE) are passed through to the
browser's wasm decoders untouched, costing the server no CPU. Only syntaxes the browser
cannot decode are decoded server-side.

**Stack**: FastAPI · pydicom · SQLAlchemy 2.0 (async) · SQLite · uv — React 18 · Vite ·
TypeScript · Tailwind · Cornerstone3D 5.

## Development

Backend and frontend run separately, with Vite proxying the API so the two stay
same-origin (exactly as nginx does in production):

```bash
# terminal 1
cd backend
DATA_DIR=../data DICOM_ROOT=../dicomfiles uv run uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend
npm install
npm run dev          # http://localhost:5173
```

If port 8000 is taken, run the backend elsewhere and point the proxy at it:
`BACKEND_URL=http://127.0.0.1:8199 npm run dev`.

```bash
cd backend && uv run pytest      # tests
cd frontend && npm run typecheck
```

## A note on the tests

The test suite encodes what real discs actually do, because that is where the bodies are
buried:

- `test_slug.py` — `ABDO/PELVIS - ` must become `ABDO_PELVIS`, not a nested directory
- `test_geometry.py` — a reformat series with a few embedded off-plane reference images
  is still reconstructable; MPR just excludes them
- `test_multipart.py` — golden bytes for the WADO-RS frame response. Cornerstone's
  multipart parser is a hand-rolled byte scanner, not a MIME parser: no preamble, a real
  `Content-Type` header line per part, CRLF before the closing boundary. "Tidying" any of
  those silently feeds the browser garbage pixels.

## Not a medical device

This is a personal tool for reading your own exams. It is not certified for diagnostic
use, and nothing here should be relied on for clinical decisions.

## Licence

MIT
