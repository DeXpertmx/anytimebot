'use client';

import { ImageUploader } from '@/components/ui/image-uploader';

interface LogoUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

/**
 * Branding logo control for booking pages: lets the owner upload an image
 * (stored on the configured MinIO/S3 storage) or paste an image URL.
 */
export function LogoUploader({ value, onChange }: LogoUploaderProps) {
  return (
    <div className="space-y-2">
      <ImageUploader value={value} onChange={onChange} uploadUrl="/api/uploads/logo" />
      <p className="text-xs text-gray-500">
        Si lo dejas vacío se usa el logotipo de Anytimebot.
      </p>
    </div>
  );
}
