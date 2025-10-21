
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SignUpPageContent } from '@/components/auth/signup-page-content';

export const metadata: Metadata = {
  title: 'Sign Up - ANYTIMEBOT',
  description: 'Create your ANYTIMEBOT account',
};

export default async function SignUpPage() {
  const session = await getServerSession(authOptions);
  
  if (session) {
    redirect('/dashboard');
  }

  return <SignUpPageContent />;
}
