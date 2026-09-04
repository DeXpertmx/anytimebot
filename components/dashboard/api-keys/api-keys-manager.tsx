'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import { Copy, Check, KeyRound, Loader2, Plus, Trash2, Code2 } from 'lucide-react';

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | null;
  requestCount: number;
  revokedAt?: string | null;
  createdAt: string;
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<ApiKeyRecord | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      if (data.success) setKeys(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedKey(data.data.key);
        setNewName('');
        setShowCreate(false);
        fetchKeys();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('apiKeys.createFailed'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: t('common.error'), description: t('apiKeys.createFailed'), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/api-keys/${deleting.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('apiKeys.revoked') });
        fetchKeys();
      } else {
        toast({ title: t('common.error'), description: t('apiKeys.revokeFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('apiKeys.revokeFailed'), variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const copyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('apiKeys.title')}</h1>
          <p className="text-sm text-gray-500">{t('apiKeys.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDocs(true)}>
            <Code2 className="mr-2 h-4 w-4" />
            {t('apiKeys.viewDocs')}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="mr-2 h-4 w-4" />
            {t('apiKeys.create')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <KeyRound className="mb-4 h-16 w-16 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">{t('apiKeys.empty')}</h3>
            <p className="max-w-sm text-center text-gray-500">{t('apiKeys.emptyDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        key.revokedAt ? 'bg-gray-100 text-gray-400' : 'bg-indigo-100 text-indigo-600'
                      }`}
                    >
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`truncate font-medium ${key.revokedAt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {key.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{key.prefix}•••</code>
                        <span>
                          {t('apiKeys.created')}: {formatDate(key.createdAt)}
                        </span>
                        {key.lastUsedAt && (
                          <span>
                            {t('apiKeys.lastUsed')}: {formatDate(key.lastUsedAt)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {key.requestCount} {t('apiKeys.requests')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {key.revokedAt ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        {t('apiKeys.revokedBadge')}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleting(key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('apiKeys.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="api-key-name">{t('apiKeys.nameLabel')}</Label>
            <Input
              id="api-key-name"
              value={newName}
              placeholder={t('apiKeys.namePlaceholder')}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-indigo-600 hover:bg-indigo-700">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('apiKeys.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key created — show once */}
      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('apiKeys.createdTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{t('apiKeys.createdWarning')}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-900 px-3 py-2.5 text-sm text-green-400">
              {createdKey}
            </code>
            <Button variant="outline" size="icon" onClick={copyKey} aria-label={t('common.copy')}>
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)} className="bg-indigo-600 hover:bg-indigo-700">
              {t('common.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('apiKeys.revokeTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{t('apiKeys.revokeConfirm', { name: deleting?.name || '' })}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRevoke}>
              {t('apiKeys.revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Docs dialog */}
      <Dialog open={showDocs} onOpenChange={setShowDocs}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t('apiKeys.docsTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-700">
            <p>{t('apiKeys.docsIntro')}</p>
            <div>
              <p className="mb-1 font-medium">{t('apiKeys.docsAuthTitle')}</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-green-400">Authorization: Bearer atb_tu_clave_aqui</pre>
            </div>
            <div>
              <p className="mb-1 font-medium">{t('apiKeys.docsEndpointsTitle')}</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-200">
{`GET  /api/v1/me
GET  /api/v1/event-types
GET  /api/v1/bookings?event_type_id=...
GET  /api/v1/bookings?status=CONFIRMED
GET  /api/v1/bookings?from=2026-09-01&to=2026-09-30
GET  /api/v1/bookings?updated_since=2026-09-01T00:00:00Z`}
              </pre>
            </div>
            <div>
              <p className="mb-1 font-medium">{t('apiKeys.docsExampleTitle')}</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-200">
{`curl https://anytimebot.app/api/v1/bookings \\
  -H "Authorization: Bearer atb_tu_clave_aqui"`}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowDocs(false)}>{t('common.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
