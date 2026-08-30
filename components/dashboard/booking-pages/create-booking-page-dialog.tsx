
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { generateSlug, isValidUsername } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface CreateBookingPageDialogProps {
  children: React.ReactNode;
}

export function CreateBookingPageDialog({ children }: CreateBookingPageDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; max: number } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Load the signed-in user's username and booking-page quota so the URL
  // preview shows the real public path and the plan limit can be enforced.
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.success && res.data) {
          if (res.data.username) {
            setUsername(res.data.username);
          }
          setQuota({
            used: res.data.bookingPages ?? 0,
            max: res.data.maxBookingPages ?? 1,
          });
        }
      })
      .catch(() => {});
  }, []);

  const quotaReached = !!quota && quota.used >= quota.max;

  // Live slug availability check (debounced) — slugs are unique per user,
  // so we check against the signed-in user's existing pages.
  useEffect(() => {
    if (!formData.slug.trim()) {
      setSlugAvailable(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/booking-pages`);
        if (!res.ok) return;
        const data = await res.json();
        const pages = Array.isArray(data?.data) ? data.data : [];
        setSlugAvailable(!pages.some((p: { slug: string }) => p.slug === formData.slug));
      } catch {
        // ignore transient errors; server-side validation still applies
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.slug]);

  const handleTitleChange = (title: string) => {
    setFormData(prev => {
      const nextSlug = prev.slug === generateSlug(prev.title) ? generateSlug(title) : prev.slug;
      setSlugAvailable(null);
      return { ...prev, title, slug: nextSlug };
    });
  };

  const handleSlugChange = (slug: string) => {
    setSlugAvailable(null);
    setFormData(prev => ({ ...prev, slug: slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-') }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validation
      if (!formData.title.trim() || !formData.slug.trim()) {
        toast({
          title: 'Error',
          description: 'Title and slug are required',
          variant: 'destructive',
        });
        return;
      }

      if (!isValidUsername(formData.slug)) {
        toast({
          title: 'Error',
          description: 'Slug can only contain letters, numbers, hyphens, and underscores',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch('/api/booking-pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Booking page created successfully',
        });
        setOpen(false);
        setFormData({ title: '', slug: '', description: '', isActive: true });
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to create booking page',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear página de reserva</DialogTitle>
          <DialogDescription>
            Crea una página de reserva donde tus clientes puedan agendar reuniones contigo.
          </DialogDescription>
        </DialogHeader>
        {quotaReached && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Has alcanzado el límite de {quota?.max} {quota?.max === 1 ? 'página de reserva' : 'páginas de reserva'} de tu plan actual.{' '}
            <Link href="/dashboard/settings" className="font-medium text-amber-900 underline">
              Mejora tu plan
            </Link>{' '}
            para crear más calendarios.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título de la página</Label>
            <Input
              id="title"
              placeholder="ej., Agenda una reunión conmigo"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="slug">Slug de la URL</Label>
            <div className="flex items-center">
              <span className="text-sm text-gray-500 mr-1">
                {typeof window !== 'undefined' ? window.location.origin : 'https://anytimebot.app'}/{username || 'username'}/
              </span>
              <Input
                id="slug"
                placeholder="your-name"
                value={formData.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-gray-500">
              Esta será la URL de tu página de reserva. El usuario se configura en tu perfil y el slug es único para tu cuenta.
            </p>
            {formData.slug.trim() && slugAvailable === false && (
              <p className="text-xs text-red-600">Este slug ya está ocupado. Elige otro.</p>
            )}
            {formData.slug.trim() && slugAvailable === true && (
              <p className="text-xs text-emerald-600">Slug disponible.</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Indica a tus clientes qué pueden reservar..."
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-active">Activa</Label>
              <p className="text-sm text-gray-500">
                Haz que esta página esté disponible para reservas
              </p>
            </div>
            <Switch
              id="is-active"
              checked={formData.isActive}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, isActive: checked }))
              }
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || slugAvailable === false || quotaReached} className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creando...
                </>
              ) : (
                'Crear página'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
