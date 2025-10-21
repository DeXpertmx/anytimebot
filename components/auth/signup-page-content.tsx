
'use client';

import { SignUpForm } from '@/components/auth/signup-form';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useTranslation } from '@/lib/i18n/hooks';

export function SignUpPageContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-white flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t('auth.createAccount')}
          </h1>
          <p className="text-gray-600">
            {t('auth.dontHaveAccount')}
          </p>
        </div>
        <SignUpForm />
      </div>
    </div>
  );
}
