
import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - ANYTIMEBOT',
  description: 'Privacy Policy for ANYTIMEBOT scheduling platform',
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Last Updated: October 18, 2025
          </p>

          <div className="prose prose-indigo max-w-none">
            <p className="text-lg text-gray-700 mb-8">
              At ANYTIMEBOT, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our scheduling platform.
            </p>

            <div className="space-y-8">
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  1. Information We Collect
                </h2>
                <p className="text-gray-700">
                  We collect information that you provide directly to us when you create an account, schedule meetings, or use our services. This includes your name, email address, calendar data, and any other information you choose to provide.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  2. How We Use Your Information
                </h2>
                <p className="text-gray-700">
                  We use the information we collect to provide, maintain, and improve our services, to communicate with you, to monitor and analyze trends and usage, and to personalize your experience with ANYTIMEBOT.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  3. Information Sharing
                </h2>
                <p className="text-gray-700">
                  We do not sell or rent your personal information to third parties. We may share your information with service providers who assist us in operating our platform, conducting our business, or serving you, as long as those parties agree to keep this information confidential.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  4. Data Security
                </h2>
                <p className="text-gray-700">
                  We implement appropriate technical and organizational measures to protect your personal information against unauthorized or unlawful processing, accidental loss, destruction, or damage.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  5. Your Rights
                </h2>
                <p className="text-gray-700">
                  You have the right to access, correct, or delete your personal information at any time. You can manage your account settings or contact us directly to exercise these rights.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  6. Cookies and Tracking
                </h2>
                <p className="text-gray-700">
                  We use cookies and similar tracking technologies to track activity on our platform and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  7. Changes to This Policy
                </h2>
                <p className="text-gray-700">
                  We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &apos;Last Updated&apos; date.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  8. Contact Us
                </h2>
                <p className="text-gray-700">
                  If you have any questions about this Privacy Policy, please contact us at privacy@anytimebot.app
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
