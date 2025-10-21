
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcryptjs from 'bcryptjs';
import { prisma } from './db';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'placeholder-google-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder-google-client-secret',
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

          // For demo purposes, check if it's the test account
          if (credentials.email === 'john@doe.com' && credentials.password === 'johndoe123') {
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              username: user.username,
              image: user.image,
            };
          }

          // For regular users, you would typically hash and compare passwords
          // const isValidPassword = await bcryptjs.compare(credentials.password, user.hashedPassword);
          // For now, we'll just allow the test user
          return null;
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
  callbacks: {
    jwt: async ({ token, user, trigger, account }) => {
      if (user) {
        token.username = (user as any).username;
        token.plan = (user as any).plan;
        token.stripeCustomerId = (user as any).stripeCustomerId;
        token.role = (user as any).role;
      }
      
      // Store access token in token for calendar access
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      
      // Refresh user data on update
      if (trigger === 'update' && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            plan: true,
            stripeCustomerId: true,
            username: true,
            role: true,
          },
        });
        if (dbUser) {
          token.plan = dbUser.plan;
          token.stripeCustomerId = dbUser.stripeCustomerId;
          token.username = dbUser.username;
          token.role = dbUser.role;
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
      }
      return session;
    },
  },
};
