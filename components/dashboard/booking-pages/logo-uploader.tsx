'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { storageKeyFromUrl } from '@/lib/storage-url';

const MAX_BYTES = 4 * 1024 * 1024;

interface LogoUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

/**
 * Branding logo control for booking pages: lets the owner upload an image
 * (stored on the configured MinIO/S3 storage) or paste an image URL.
 */
export function LogoUploader({ value, onChange }: LogoUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Error',
        description: 'El archivo debe ser una imagen (PNG, JPG, WebP, GIF o SVG).',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: 'Error',
        description: 'La imagen supera el límite de 4 MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Replace the previous uploaded logo so old files do not accumulate.
      const previousKey = storageKeyFromUrl(value);
      if (previousKey) formData.append('previousKey', previousKey);

      const response = await fetch('/api/uploads/logo', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data?.code === 'STORAGE_NOT_CONFIGURED') {
          toast({
            title: 'Subida no disponible',
            description:
              'La subida de imágenes no está disponible en este momento. Puedes seguir pegando la URL de tu logotipo.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Error',
            description: data.error || 'No se pudo subir la imagen.',
            variant: 'destructive',
          });
        }
        return;
      }

      onChange(data.url);
      toast({ title: 'Logotipo subido', description: 'Se actualizará al guardar la página.' });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo subir la imagen. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Vista previa del logotipo" className="max-h-10 max-w-[88px] object-contain" />
          ) : (
            <ImageIcon className="h-5 w-5 text-gray-300" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={handleFile} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            {uploading ? 'Subiendo...' : value ? 'Cambiar imagen' : 'Subir imagen'}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange('')}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Quitar
            </Button>
          )}
        </div>
      </div>

      <Input
        placeholder="https://tu-dominio.com/logo.png"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-gray-500">
        Sube tu logotipo o pega su URL. Si lo dejas vacío se usa el logotipo de Anytimebot.
      </p>
    </div>
  );
}
