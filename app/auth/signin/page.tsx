
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SignInPageContent } from '@/components/auth/signin-page-content';

export const metadata: Metadata = {
  title: 'Sign In - ANYTIMEBOT',
  description: 'Sign in to your ANYTIMEBOT account',
};

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  
  if (session) {
    redirect('/dashboard');
  }

  return <SignInPageContent />;
}
