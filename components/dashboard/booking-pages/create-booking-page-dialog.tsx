
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const { toast } = useToast();
  const router = useRouter();

  // Load the signed-in user's username so the URL preview shows the real
  // public path (anytimebot.app/<username>/<slug>) instead of a placeholder.
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.success && res.data?.username) {
          setUsername(res.data.username);
        }
      })
      .catch(() => {});
  }, []);

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
          <DialogTitle>Create Booking Page</DialogTitle>
          <DialogDescription>
            Create a new booking page where clients can schedule meetings with you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Page Title</Label>
            <Input
              id="title"
              placeholder="e.g., Schedule a Meeting with John"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
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
              This will be your booking page URL. The username is configured in your profile and the slug is unique for your account.
            </p>
            {formData.slug.trim() && slugAvailable === false && (
              <p className="text-xs text-red-600">This slug is already taken. Choose another one.</p>
            )}
            {formData.slug.trim() && slugAvailable === true && (
              <p className="text-xs text-emerald-600">Slug available.</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Tell your clients what they can book..."
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-active">Active</Label>
              <p className="text-sm text-gray-500">
                Make this page available for bookings
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
              Cancel
            </Button>
            <Button type="submit" disabled={loading || slugAvailable === false} className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create Page'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
