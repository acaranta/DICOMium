// Passkey (WebAuthn) helpers.
//
// The browser API throws a small zoo of DOM exceptions, several of which are entirely
// benign — cancelling the OS prompt raises NotAllowedError, which is not an error the user
// needs to be told about. This module turns them into either silence or a sentence a human
// can act on.

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import i18n from './i18n'
import { api, type LoginResult, type Passkey } from './api'

/** The user closed the OS prompt. Not a failure — say nothing. */
export class PasskeyCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'PasskeyCancelled'
  }
}

export function passkeysAvailable(): boolean {
  // A passkey ceremony in a non-secure context throws before it ever reaches the server,
  // so check here too rather than relying on the backend's answer alone.
  return browserSupportsWebAuthn() && window.isSecureContext
}

/**
 * A human name to pre-fill when adding a passkey.
 *
 * The old default was `navigator.platform`, which yields "Linux x86_64" — so every passkey a
 * user added from the same machine looked identical, and the list became useless the moment
 * they had two. This is only a suggestion: the user can edit it before saving, and rename it
 * afterwards.
 */
export function suggestPasskeyName(): string {
  const ua = navigator.userAgent
  // "iPhone", "iPad", "Mac" and "Chromebook" are product names and stay as they are in every
  // language; only the ones carrying a common noun ("Android phone", "Windows PC") get translated.
  const name = (key: string) => i18n.t(`passkeys.devices.${key}`, { ns: 'account' })

  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return name('android')
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return name('windows')
  if (/CrOS/i.test(ua)) return 'Chromebook'
  if (/Linux/i.test(ua)) return name('linux')
  return name('generic')
}

/** Rename a passkey. No password needed: a label is not a security boundary. */
export function renamePasskey(id: number, nickname: string): Promise<Passkey> {
  return api.patch<Passkey>(`/api/account/passkeys/${id}`, { nickname })
}

/**
 * A DOM exception, as a sentence.
 *
 * Translated here rather than at the call site: these are thrown from inside the browser's own
 * ceremony, so there is no component in scope. `i18n.t` reads the language active at the moment
 * the error is raised, which is the one the user is looking at.
 */
function toError(err: unknown): Error {
  const name = (err as { name?: string })?.name
  const message = (key: string) => i18n.t(`passkey.${key}`, { ns: 'errors' })

  if (name === 'NotAllowedError' || name === 'AbortError') return new PasskeyCancelled()
  if (name === 'InvalidStateError') return new Error(message('already_registered'))
  if (name === 'NotSupportedError') return new Error(message('not_supported'))
  if (name === 'SecurityError') return new Error(message('browser_insecure'))
  return err instanceof Error ? err : new Error(message('unusable'))
}

/** Register a new passkey on the signed-in account. */
export async function registerPasskey(nickname: string): Promise<Passkey> {
  const optionsJSON = await api.post<never>('/api/account/passkeys/register/begin')

  let credential
  try {
    credential = await startRegistration({ optionsJSON: optionsJSON as never })
  } catch (err) {
    throw toError(err)
  }

  return api.post<Passkey>('/api/account/passkeys/register/complete', { credential, nickname })
}

/**
 * Sign in with a passkey. No email, no password.
 *
 * The server sends no allowCredentials, so the browser offers whichever discoverable
 * credential it holds for this domain — which is what makes this passwordless rather than
 * "type your email, then tap".
 */
export async function loginWithPasskey(): Promise<LoginResult> {
  const optionsJSON = await api.post<never>('/api/auth/passkeys/login/begin')

  let credential
  try {
    credential = await startAuthentication({ optionsJSON: optionsJSON as never })
  } catch (err) {
    throw toError(err)
  }

  return api.post<LoginResult>('/api/auth/passkeys/login/complete', { credential })
}
