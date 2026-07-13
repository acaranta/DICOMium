<p align="center">
  <img src="assets/icon.png" alt="DICOMium" width="140" />
</p>

<h1 align="center">DICOMium</h1>

<p align="center">
  <strong>A private, self-hosted medical imaging viewer for the web.</strong>
</p>

<p align="center">
  Upload the CD or DVD handed to you by a radiology department and explore it directly in
  your browser — no desktop software, cloud account, or data leaving your machine.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-it-does">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="LICENSE">AGPL-3.0</a>
</p>

---

Runs as a single Docker container. Files are stored on a plain mounted volume, in a
directory tree you can read with `ls`.

## Screenshots

<p align="center">
  <img src="assets/screenshots/viewer.png" alt="The viewer: an abdominal CT slice with an ellipse ROI reading in Hounsfield units" width="900" />
  <br />
  <em>The viewer. On CT, ROI statistics read in real Hounsfield units.</em>
</p>

<p align="center">
  <img src="assets/screenshots/mpr.png" alt="MPR: linked axial, sagittal and coronal planes through one volume" width="900" />
  <br />
  <em>MPR — one volume, three linked planes, crosshairs in the radiology convention.</em>
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="assets/screenshots/library.png" alt="The study library with the upload drop zone" />
      <br />
      <em>Your library. Drop a DVD on it and it sorts itself out.</em>
    </td>
    <td width="50%" valign="top">
      <img src="assets/screenshots/account.png" alt="Account security: passkeys, authenticator app, recovery codes" />
      <br />
      <em>Passkeys, an authenticator app, and recovery codes.</em>
    </td>
  </tr>
</table>

> The exams pictured are real scans whose identifying tags were rewritten before they were
> loaded. **The patients shown are fictional.**

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

**Sign-in** — password, plus two optional factors you enable per account from `/account`:

- **Passkeys.** Fingerprint, face or device PIN — and that's the whole sign-in. No email,
  no password, no code. A passkey is *already* two factors (the device you hold, and the
  biometric that unlocks it), so it deliberately does not then ask for a TOTP code as well.
- **Authenticator app (TOTP).** A 6-digit code after your password, with **10 one-time
  recovery codes** for when your phone isn't to hand.

> Browsers only permit passkeys in a secure context: **HTTPS, or `localhost`**. They will
> not work over plain HTTP on a LAN address — the UI says so rather than failing silently.
> Password and TOTP work everywhere.

## Quick start

```bash
git clone <this repo> && cd dicomium
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
/dicomfiles/jane/DOE_JANE__ANON-00417/20240115_ABDO_PELVIS_f9d6120c/
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
| `TOTP_ISSUER` | `DICOMium` | The label your authenticator app shows |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | — | Optional: pin the passkey domain. Derived from the request otherwise |

### Locked out?

Recovery codes are the normal way back in. If a sole administrator loses their
authenticator *and* their recovery codes, clear their factors from inside the container:

```bash
docker compose exec dicomium python -m app.cli list-users
docker compose exec dicomium python -m app.cli reset-mfa you@example.com
```

They can then sign in with their password alone, and re-enrol.

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
- `test_mfa_login.py` — while a user owes a second factor they must hold **no session at
  all**, so the tests try to reach a protected route from that half-authenticated state and
  assert 401. A "pending" flag on the real session would fail open the first time a route
  forgot to check it; a separate short-lived cookie cannot.
- `test_totp.py` — a code cannot be replayed inside its own 30-second window. Verifying a
  code is the easy half; recording which step it consumed is the half that gets skipped,
  and skipping it turns a second factor back into a single one.

## Not a medical device

This is a personal tool for reading your own exams. It is not certified for diagnostic
use, and nothing here should be relied on for clinical decisions.

## Licence

Copyright © 2026 Arthur Caranta.

**GNU Affero General Public License v3.0 or later** — see [LICENSE](LICENSE).

The AGPL is the GPL plus one extra obligation, and it is the one that matters for a
self-hosted web app: under **section 13**, if you run a *modified* version of dicomium as a
network service, you must offer its source code to the people using it over the network.
Running it unmodified — for yourself, your family, your clinic — obliges you nothing beyond
the usual GPL terms.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
