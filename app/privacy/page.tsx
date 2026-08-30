import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Política de privacidad - ANYTIMEBOT',
  description: 'Política de privacidad de la plataforma de agenda ANYTIMEBOT',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <div className="relative w-10 h-10">
                <Image src="/logo.png" alt="ANYTIMEBOT" fill className="object-contain" />
              </div>
              <span className="text-2xl font-bold text-gray-900">ANYTIMEBOT</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8 md:p-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Política de privacidad</h1>
          <p className="text-sm text-gray-500 mb-8">Última actualización: 29 de agosto de 2026 · Versión 2026-08</p>

          <div className="prose prose-indigo max-w-none">
            <p className="text-lg text-gray-700 mb-8">
              Esta Política de privacidad explica cómo ANYTIMEBOT trata los datos personales cuando creas una cuenta,
              agendas o diriges reuniones, utilizas el asistente de IA o conectas un servicio de mensajería o calendario.
            </p>

            <div className="space-y-8">
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Responsable y roles</h2>
                <p className="text-gray-700">
                  ANYTIMEBOT is the controller for account, billing, security and platform-usage data. For data
                  submitted by a business through its booking page, that business may be the controller and
                  ANYTIMEBOT acts as its processor. The applicable controller/processor relationship and contact
                  details must be confirmed in the customer agreement.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Datos que tratamos</h2>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Account data: name, email, username, profile image, timezone and authentication provider.</li>
                  <li>Scheduling data: booking pages, event types, availability, guest name, email, phone, booking and form data.</li>
                  <li>Communication data: WhatsApp/Twilio phone numbers, message content, delivery status and provider identifiers.</li>
                  <li>AI and knowledge-base data: bot instructions, uploaded documents, URLs and conversation context.</li>
                  <li>Technical data: IP address, user agent, cookies, logs and security events.</li>
                  <li>Consent records: purpose, policy version, date, withdrawal status and technical evidence.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Finalidades y bases jurídicas</h2>
                <ul className="list-disc pl-6 text-gray-700 space-y-2">
                  <li>Account and contract administration: performance of the service contract.</li>
                  <li>Bookings and notifications: performance of the requested service and, where required, consent.</li>
                  <li>AI responses and messaging: performance of the requested feature and the customer&apos;s instructions.</li>
                  <li>Security, fraud prevention and service reliability: legitimate interests, balanced against data-subject rights.</li>
                  <li>Optional recording or other optional processing: explicit consent, which can be withdrawn at any time.</li>
                  <li>Legal and tax obligations: compliance with applicable law.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Encargados y proveedores de servicios</h2>
                <p className="text-gray-700 mb-3">
                  We use the following providers for the purposes shown below. The exact region and applicable
                  contractual safeguards must be confirmed in the current data-processing agreements and provider
                  terms before relying on them for a particular customer.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 pr-4">Provider</th>
                        <th className="py-2 pr-4">Purpose</th>
                        <th className="py-2">Location / transfer note</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Vercel</td><td className="py-2 pr-4">Hosting, serverless functions and deployment</td><td className="py-2">Region depends on project configuration; verify DPA and transfer mechanism.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Neon (AWS)</td><td className="py-2 pr-4">PostgreSQL application database</td><td className="py-2">Current production connection observed in AWS us-east-1 (United States); extra-EEA transfer safeguards required.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Convex</td><td className="py-2 pr-4">Bot conversations and event ingestion</td><td className="py-2">Region and subprocessors depend on deployment; verify current DPA and transfer mechanism.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">OpenAI</td><td className="py-2 pr-4">AI response generation and embeddings where enabled</td><td className="py-2">May involve processing outside the EEA; use DPA and applicable SCC/adequacy safeguard.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">WhatsApp messaging service</td><td className="py-2 pr-4">WhatsApp connection, QR pairing and message delivery</td><td className="py-2">Provider infrastructure is outside the application; verify DPA, location and transfer safeguards.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Twilio</td><td className="py-2 pr-4">Optional WhatsApp messaging integration</td><td className="py-2">May involve international processing; governed by Twilio DPA and applicable safeguards.</td></tr>
                      <tr className="border-b"><td className="py-2 pr-4 font-medium">Stripe</td><td className="py-2 pr-4">Payments, subscriptions and billing portal</td><td className="py-2">Payment processing and international transfer safeguards are governed by Stripe terms/DPA.</td></tr>
                      <tr><td className="py-2 pr-4 font-medium">Google</td><td className="py-2 pr-4">Optional sign-in and calendar synchronization</td><td className="py-2">Processing is governed by Google terms and applicable transfer safeguards.</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Transferencias internacionales</h2>
                <p className="text-gray-700">
                  Some providers may process data outside the European Economic Area. In particular, the current
                  PostgreSQL production endpoint is hosted by Neon on AWS in us-east-1, United States. Where a transfer
                  is not covered by an adequacy decision, it must be covered by an appropriate safeguard such as the
                  EU Standard Contractual Clauses, together with a transfer-impact assessment where required. We do
                  not represent that an international transfer is lawful solely because a provider is listed here;
                  the controller must verify and maintain the applicable DPA and safeguards.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Retention</h2>
                <p className="text-gray-700">
                  Operational data is removed under the configured retention policy. Unless a longer period is required
                  by law or a documented customer instruction, cancelled bookings and WhatsApp messages are scheduled
                  for deletion after 365 days, completed bookings after 730 days, and consent evidence after 1,825 days.
                  Retention jobs run automatically and complete account erasure requests separately. These periods must
                  be reviewed by the controller/DPO and adjusted where necessary.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Tus derechos conforme al RGPD</h2>
                <p className="text-gray-700">
                  Subject to applicable law, you may request access, correction, erasure, restriction, objection,
                  portability, or withdrawal of consent. Authenticated users can export their data from Settings and
                  request account deletion there. Requests may also be sent to privacy@anytimebot.app. You may lodge a
                  complaint with your local supervisory authority.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Security</h2>
                <p className="text-gray-700">
                  We use access controls, authenticated endpoints, encrypted transport, hashed passwords and provider
                  security controls. No online service can guarantee absolute security. Tenant isolation is currently
                  logical within a shared PostgreSQL deployment; physical per-tenant databases are a planned architecture
                  phase and are not represented as currently implemented.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Contacto</h2>
                <p className="text-gray-700">
                  Questions or rights requests: privacy@anytimebot.app. The controller should designate and publish a
                  data-protection contact or DPO where legally required.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-500">
          <p>&copy; 2026 ANYTIMEBOT. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
