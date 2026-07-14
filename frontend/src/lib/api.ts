// Typed fetch client. Every request carries the session cookie; the SPA and the API are
// same-origin (nginx in prod, the Vite proxy in dev), so nothing else is needed.

import i18n from './i18n'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The backend's catalogue key, when it sent one. Empty for a plain-text error. */
    public code = '',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * The message to show for a failed response.
 *
 * The backend sends `{code, message, params}`. We translate the code and interpolate the params,
 * because the sentence around a number is a different shape in every language. If the code is one
 * we do not know — an older client against a newer server — we fall back to the backend's English
 * rather than printing a raw key at the user.
 */
function describe(body: unknown, fallback: string): { message: string; code: string } {
  const detail = (body as { detail?: unknown })?.detail

  if (detail && typeof detail === 'object' && 'code' in detail) {
    const { code, message, params } = detail as {
      code: string
      message?: string
      params?: Record<string, unknown>
    }
    const english = message ?? fallback
    return {
      code,
      message: i18n.t(code, { ns: 'errors', defaultValue: english, ...params }),
    }
  }

  // A plain string, or FastAPI's list of {loc, msg} from a route we have not coded yet.
  if (typeof detail === 'string') return { message: detail, code: '' }
  if (Array.isArray(detail)) {
    return { message: detail.map((d: { msg?: string }) => d.msg).join(', '), code: '' }
  }
  return { message: fallback, code: '' }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
    ...init,
  })

  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* not JSON; describe() falls back to the status text */
    }
    const { message, code } = describe(body, res.statusText)
    throw new ApiError(res.status, message, code)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  upload: <T>(path: string, files: File[], onProgress?: (fraction: number) => void) =>
    // XHR rather than fetch: fetch still cannot report upload progress, and a 600 MB DVD
    // needs a progress bar.
    new Promise<T>((resolve, reject) => {
      const form = new FormData()
      files.forEach((f) => form.append('files', f, f.name))

      const xhr = new XMLHttpRequest()
      xhr.open('POST', path, true)
      xhr.withCredentials = true

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as T)
        } else {
          let body: unknown = null
          try {
            body = JSON.parse(xhr.responseText)
          } catch {
            /* keep status text */
          }
          const { message, code } = describe(body, xhr.statusText)
          reject(new ApiError(xhr.status, message, code))
        }
      }
      xhr.onerror = () => reject(new ApiError(0, i18n.t('network', { ns: 'errors' })))
      xhr.send(form)
    }),
}

// ---- types -------------------------------------------------------------------

export interface User {
  id: number
  email: string
  slug: string
  is_admin: boolean
  is_active: boolean

  // Avatar and language ride along on /api/auth/me, so the header needs no second request.
  avatar_style: string | null
  avatar_color: string | null
  use_gravatar: boolean
  gravatar_hash: string | null
  /** null = follow the browser. */
  language: string | null
}

export interface Preferences {
  avatar_style: string
  avatar_color: string
  use_gravatar: boolean
  gravatar_hash: string
  language: string | null
  // The server tells us what it will accept, rather than the UI hardcoding a list that could
  // drift out of sync with the backend's validation.
  available_styles: string[]
  available_colors: string[]
  available_languages: string[]
}

export interface AuthConfig {
  registration_enabled: boolean
  has_users: boolean
  min_password_length: number
}

/** The answer to a sign-in attempt: either you're in, or you owe a second factor. */
export interface LoginResult {
  mfa_required: boolean
  user: User | null
  methods: string[]
}

export interface Passkey {
  id: number
  nickname: string
  backed_up: boolean
  transports: string[]
  created_at: string
  last_used_at: string | null
}

export interface SecurityStatus {
  totp_enabled: boolean
  passkeys: Passkey[]
  recovery_codes_remaining: number
  passkeys_supported: boolean
  passkeys_unsupported_reason: string
}

export interface TotpBegin {
  secret: string
  uri: string
  qr_data_url: string
}

export interface RecoveryCodes {
  codes: string[]
}

export interface Series {
  series_instance_uid: string
  series_number: number | null
  series_description: string | null
  modality: string
  body_part_examined: string | null
  num_instances: number
  num_frames_total: number
  rows: number | null
  columns: number | null
  is_multiframe: boolean
  is_viewable: boolean
  is_reconstructable: boolean
  mpr_instance_count: number
  slice_spacing: number | null
  has_thumbnail: boolean
}

export interface Study {
  study_instance_uid: string
  patient_name: string
  patient_id: string
  patient_birth_date: string | null
  patient_sex: string | null
  study_date: string | null
  study_time: string | null
  study_description: string | null
  accession_number: string | null
  modalities: string[]
  num_series: number
  num_instances: number
  created_at: string
}

export interface StudyDetail extends Study {
  series: Series[]
}

export interface UploadError {
  path: string
  stage: string
  error_type: string
  message: string
}

export interface UploadJob {
  id: string
  status: string
  /** English, from the server. The fallback when `message_code` is unknown or absent. */
  message: string
  /** Catalogue key for `message`. Empty on jobs that finished before codes existed. */
  message_code: string
  is_terminal: boolean
  progress: number
  total_files: number
  processed_files: number
  imported_count: number
  duplicate_count: number
  skipped_count: number
  error_count: number
  source_names: string[]
  errors: UploadError[]
  study_uids: string[]
  created_at: string
  finished_at: string | null
}

export interface DicomTag {
  tag: string
  keyword: string
  vr: string
  value: string
}

export interface InstanceRef {
  sop_instance_uid: string
  instance_number: number | null
  number_of_frames: number
  in_mpr_volume: boolean
}
