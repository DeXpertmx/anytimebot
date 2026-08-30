
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { SettingsForm } from '@/components/dashboard/settings/settings-form';
import { EmailTemplates } from '@/components/dashboard/settings/email-templates';

export const metadata = {
  title: 'Configuración - ANYTIMEBOT',
  description: 'Gestiona la configuración de tu cuenta',
};

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    redirect('/auth/signin');
  }

  return (
    <div className="min-w-0 space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">
          Gestiona la configuración y las preferencias de tu cuenta
        </p>
      </div>
      <SettingsForm user={user} />
      <EmailTemplates />
    </div>
  );
}
