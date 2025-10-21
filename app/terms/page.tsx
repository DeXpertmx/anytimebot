
import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - ANYTIMEBOT',
  description: 'Terms of Service for ANYTIMEBOT scheduling platform',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <div className="relative w-10 h-10">
                <Image
                  src="/logo.png"
                  alt="ANYTIMEBOT"
                  fill
                  className="object-contain"
                />
              </div>
              <span className="text-2xl font-bold text-gray-900">
                ANYTIMEBOT
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Last Updated: October 18, 2025
          </p>

          <div className="prose prose-indigo max-w-none">
            <p className="text-lg text-gray-700 mb-8">
              Welcome to ANYTIMEBOT. By using our services, you agree to be bound by these Terms of Service. Please read them carefully.
            </p>

            <div className="space-y-8">
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  1. Acceptance of Terms
                </h2>
                <p className="text-gray-700">
                  By accessing or using ANYTIMEBOT, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using this service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  2. Description of Service
                </h2>
                <p className="text-gray-700">
                  ANYTIMEBOT is a scheduling platform that allows users to create events, manage availability, and facilitate bookings. We reserve the right to modify, suspend, or discontinue any aspect of the service at any time.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  3. User Accounts
                </h2>
                <p className="text-gray-700">
                  You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to provide accurate and complete information when creating your account.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  4. User Conduct
                </h2>
                <p className="text-gray-700">
                  You agree not to use ANYTIMEBOT for any unlawful purpose or in any way that could damage, disable, overburden, or impair the service. You may not attempt to gain unauthorized access to any portion of the platform.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  5. User Content
                </h2>
                <p className="text-gray-700">
                  You retain all rights to the content you submit to ANYTIMEBOT. By submitting content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, and display such content as necessary to provide the service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  6. Intellectual Property
                </h2>
                <p className="text-gray-700">
                  The service and its original content, features, and functionality are owned by ANYTIMEBOT and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  7. Termination
                </h2>
                <p className="text-gray-700">
                  We may terminate or suspend your account and access to the service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  8. Limitation of Liability
                </h2>
                <p className="text-gray-700">
                  In no event shall ANYTIMEBOT, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  9. Governing Law
                </h2>
                <p className="text-gray-700">
                  These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which ANYTIMEBOT operates, without regard to its conflict of law provisions.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  10. Changes to Terms
                </h2>
                <p className="text-gray-700">
                  We reserve the right to modify or replace these Terms at any time. We will provide notice of any material changes by posting the new Terms on this page.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  11. Contact Information
                </h2>
                <p className="text-gray-700">
                  If you have any questions about these Terms, please contact us at support@anytimebot.app
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-500">
            <p>&copy; 2025 ANYTIMEBOT. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
