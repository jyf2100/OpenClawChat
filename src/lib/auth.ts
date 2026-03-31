export interface LocalAuthStatus {
  needs_setup: boolean;
  authenticated: boolean;
  user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
}

const SESSION_TOKEN_KEY = 'clawchat.localAuth.sessionToken';

async function invokeAuth<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export function loadSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function saveSessionToken(token: string): void {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function getLocalAuthStatus(): Promise<LocalAuthStatus> {
  const sessionToken = loadSessionToken();
  return invokeAuth<LocalAuthStatus>('auth_get_status', { sessionToken });
}

export async function registerLocalAccount(email: string, displayName: string, password: string): Promise<string> {
  const token = await invokeAuth<string>('auth_register', { email, displayName, password });
  saveSessionToken(token);
  return token;
}

export async function loginLocalAccount(email: string, password: string): Promise<string> {
  const token = await invokeAuth<string>('auth_login', { email, password });
  saveSessionToken(token);
  return token;
}

export async function logoutLocalAccount(): Promise<void> {
  const token = loadSessionToken();
  if (token) {
    await invokeAuth('auth_logout', { sessionToken: token });
  }
  clearSessionToken();
}
