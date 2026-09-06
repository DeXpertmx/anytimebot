import { randomBytes } from 'crypto';

/** Public app base URL used to build absolute redirect URIs. */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'https://anytimebot.app'
  );
}

/** Random CSRF state token stored in a cookie during the OAuth flow. */
export function createOAuthState(): string {
  return randomBytes(24).toString('hex');
}