import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username?: string | null;
      plan?: string;
      stripeCustomerId?: string | null;
      role?: string;
      isReseller?: boolean;
      hideBotAI?: boolean;
      accessToken?: string;
      refreshToken?: string;
    } & DefaultSession['user'];
  }

  interface User {
    username?: string | null;
    plan?: string;
    stripeCustomerId?: string | null;
    role?: string;
    hideBotAI?: boolean;
    ownedReseller?: { id: string } | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    username?: string | null;
    plan?: string;
    stripeCustomerId?: string | null;
    role?: string;
    isReseller?: boolean;
    hideBotAI?: boolean;
    accessToken?: string;
    refreshToken?: string;
  }
}