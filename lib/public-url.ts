export function getPublicAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'https://anytimebot.app'
  ).replace(/\/$/, '');
}
