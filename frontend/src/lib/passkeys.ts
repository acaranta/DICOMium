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

  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android phone'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows PC'
  if (/CrOS/i.test(ua)) return 'Chromebook'
  if (/Linux/i.test(ua)) return 'Linux PC'
  return 'This device'
}

/** Rename a passkey. No password needed: a label is not a security boundary. */
export function renamePasskey(id: number, nickname: string): Promise<Passkey> {
  return api.patch<Passkey>(`/api/account/passkeys/${id}`, { nickname })
}

function translate(err: unknown): Error {
  const name = (err as { name?: string })?.name

  if (name === 'NotAllowedError' || name === 'AbortError') return new PasskeyCancelled()
  if (name === 'InvalidStateError') {
    return new Error('That passkey is already registered on this account.')
  }
  if (name === 'NotSupportedError') {
    return new Error('This device cannot create a passkey.')
  }
  if (name === 'SecurityError') {
    return new Error(
      'Passkeys need a secure connection. This page must be served over HTTPS (or run on localhost).',
    )
  }
  return err instanceof Error ? err : new Error('The passkey could not be used.')
}

/** Register a new passkey on the signed-in account. */
export async function registerPasskey(nickname: string): Promise<Passkey> {
  const optionsJSON = await api.post<never>('/api/account/passkeys/register/begin')

  let credential
  try {
    credential = await startRegistration({ optionsJSON: optionsJSON as never })
  } catch (err) {
    throw translate(err)
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
    throw translate(err)
  }

  return api.post<LoginResult>('/api/auth/passkeys/login/complete', { credential })
}
