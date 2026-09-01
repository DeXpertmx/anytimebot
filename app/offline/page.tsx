import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sin conexión - Anytimebot',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="relative w-[180px] h-[55px]">
              <Image
                src="/anytimebot-logo.png"
                alt="Anytimebot"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin conexión</h1>
          <p className="text-gray-600 mb-6">
            No hay conexión a internet en este momento. Revisa tu red e inténtalo de nuevo.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Reintentar
          </Link>
        </div>
      </div>
    </div>
  );
}