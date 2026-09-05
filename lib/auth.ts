
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcryptjs from 'bcryptjs';
import { prisma } from './db';
import { notifyAdminNewSignup } from './system-whatsapp';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user) {
            return null;
          }

          // Only bcrypt-validated logins are allowed.
          const isValid =
            user.password
              ? await bcryptjs.compare(credentials.password, user.password)
              : false;

          if (!isValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username,
            image: user.image,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
  events: {
    // Fire when a brand-new user is created by the adapter (Google sign-in).
    // Credentials registrations go through /api/signup and notify separately.
    async createUser({ user }) {
      if (user?.email) {
        notifyAdminNewSignup({
          name: user.name ?? null,
          email: user.email,
          username: null,
        }).catch((e) => console.error('Failed to notify admin of new signup:', e));
      }
    },
  },
  callbacks: {
    jwt: async ({ token, user, trigger, account }) => {
      if (user) {
        token.username = (user as any).username;
        token.plan = (user as any).plan;
        token.stripeCustomerId = (user as any).stripeCustomerId;
        token.role = (user as any).role;
        token.isReseller = (user as any).ownedReseller ? true : false;
      }
      
      // Store access token in token for calendar access
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }

      // Always refresh role/plan from the DB when we have a subject. This
      // guarantees existing sessions pick up an ADMIN/plan change (e.g. a user
      // promoted to admin) on the very next request, instead of only on
      // trigger === 'update'.
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            plan: true,
            stripeCustomerId: true,
            username: true,
            role: true,
            ownedReseller: { select: { id: true } },
          },
        });
        if (dbUser) {
          token.plan = dbUser.plan;
          token.stripeCustomerId = dbUser.stripeCustomerId;
          token.username = dbUser.username;
          token.role = dbUser.role;
          token.isReseller = !!dbUser.ownedReseller;
        }
      }
      
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).username = token.username;
        (session.user as any).plan = token.plan;
        (session.user as any).stripeCustomerId = token.stripeCustomerId;
        (session.user as any).accessToken = token.accessToken;
        (session.user as any).refreshToken = token.refreshToken;
        (session.user as any).role = token.role;
        (session.user as any).isReseller = token.isReseller;
      }
      return session;
    },
  },
};
