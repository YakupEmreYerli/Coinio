import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api } from '../api';

export type PasskeyMeta = {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PasskeysListResponse = {
  supported: boolean;
  passkeys: PasskeyMeta[];
};

export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

export async function isPasskeyAutofillSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

export function isUserCancel(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'NotAllowedError' || name === 'AbortError';
}

export async function registerPasskey(name?: string): Promise<PasskeyMeta> {
  const { challengeToken, options } = await api.post<{
    challengeToken: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>('/auth/passkey/register/options');
  const response = await startRegistration({ optionsJSON: options });
  const trimmed = name?.trim();
  return api.post<PasskeyMeta>('/auth/passkey/register/verify', {
    challengeToken,
    response,
    ...(trimmed ? { name: trimmed } : {}),
  });
}

export async function signInWithPasskey(opts?: { mediation?: 'conditional' }): Promise<{ id: number; username: string }> {
  const { challengeToken, options } = await api.post<{
    challengeToken: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>('/auth/passkey/login/options');
  const response = await startAuthentication({
    optionsJSON: options,
    useBrowserAutofill: opts?.mediation === 'conditional',
  });
  return api.post<{ id: number; username: string }>('/auth/passkey/login/verify', {
    challengeToken,
    response,
  });
}
