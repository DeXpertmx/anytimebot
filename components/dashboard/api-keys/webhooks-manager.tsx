'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import { Webhook, Loader2, Plus, Trash2, Copy, Check, Send, History } from 'lucide-react';

interface WebhookEndpointRecord {
  id: string;
  url: string;
  events: string;
  active: boolean;
  createdAt: string;
  totalDeliveries: number;
  delivered: number;
  failed: number;
}

interface DeliveryRecord {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const EVENT_KEYS = [
  'created',
  'confirmed',
  'cancelled',
  'completed',
  'rescheduled',
] as const;

export function WebhooksManager() {
  const [endpoints, setEndpoints] = useState<WebhookEndpointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<WebhookEndpointRecord | null>(null);
  const [history, setHistory] = useState<DeliveryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [deleting, setDeleting] = useState<WebhookEndpointRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webhooks/manage');
      const data = await res.json();
      if (data.success) setEndpoints(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/webhooks/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          events: selectedEvents.length === 0 ? '*' : selectedEvents.map((e) => `booking.${e}`),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedSecret(data.data.secret);
        setUrl('');
        setSelectedEvents([]);
        setShowCreate(false);
        fetchEndpoints();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('webhooks.createFailed'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: t('common.error'), description: t('webhooks.createFailed'), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (endpoint: WebhookEndpointRecord, active: boolean) => {
    setToggling(endpoint.id);
    try {
      const res = await fetch(`/api/webhooks/manage/${endpoint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (data.success) {
        setEndpoints((prev) => prev.map((e) => (e.id === endpoint.id ? { ...e, active } : e)));
      } else {
        toast({ title: t('common.error'), description: t('webhooks.updateFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('webhooks.updateFailed'), variant: 'destructive' });
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/webhooks/manage/${deleting.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('webhooks.deleted') });
        fetchEndpoints();
      } else {
        toast({ title: t('common.error'), description: t('webhooks.deleteFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('webhooks.deleteFailed'), variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const fetchHistory = useCallback(async (endpointId: string, page: number) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/webhooks/manage/${endpointId}/deliveries?page=${page}&limit=20`);
      const data = await res.json();
      if (data.success) {
        setHistory(data.data);
        setHistoryPage(data.pagination.page);
        setHistoryPages(data.pagination.pages);
        setHistoryTotal(data.pagination.total);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = (endpoint: WebhookEndpointRecord) => {
    setHistoryOf(endpoint);
    setHistory([]);
    setHistoryPage(1);
    fetchHistory(endpoint.id, 1);
  };

  const handleTest = async (endpoint: WebhookEndpointRecord) => {
    setTesting(endpoint.id);
    try {
      const res = await fetch(`/api/webhooks/manage/${endpoint.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast({
          title: t('webhooks.testOk', { status: data.status, ms: data.durationMs }),
          description: t('webhooks.testOkDesc'),
        });
      } else {
        toast({
          title: t('webhooks.testFail'),
          description: data.error || t('webhooks.testFailDesc', { status: data.status }),
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: t('common.error'), description: t('webhooks.testFail'), variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              {t('webhooks.title')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{t('webhooks.subtitle')}</p>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {t('webhooks.create')}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : endpoints.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="font-medium">{t('webhooks.empty')}</p>
            <p className="text-sm mt-1">{t('webhooks.emptyDesc')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {endpoints.map((endpoint) => (
              <div
                key={endpoint.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate max-w-md">{endpoint.url}</p>
                    <Badge variant={endpoint.active ? 'default' : 'secondary'}>
                      {endpoint.active ? t('webhooks.active') : t('webhooks.inactive')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                    <span>
                      {endpoint.events === '*'
                        ? t('webhooks.allEvents')
                        : endpoint.events.split(',').map((e) => e.replace('booking.', '')).join(', ')}
                    </span>
                    <span>
                      {t('webhooks.deliveredCount', { count: endpoint.delivered })}
                      {endpoint.failed > 0 && ` · ${t('webhooks.failedCount', { count: endpoint.failed })}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openHistory(endpoint)}
                    aria-label={t('webhooks.history')}
                  >
                    <History className="h-4 w-4 mr-1" />
                    {t('webhooks.history')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(endpoint)}
                    disabled={testing === endpoint.id}
                  >
                    {testing === endpoint.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    {t('webhooks.test')}
                  </Button>
                  <Switch
                    checked={endpoint.active}
                    onCheckedChange={(active) => handleToggle(endpoint, active)}
                    disabled={toggling === endpoint.id}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleting(endpoint)}
                    aria-label={t('webhooks.delete')}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('webhooks.createTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="webhook-url">{t('webhooks.urlLabel')}</Label>
                <Input
                  id="webhook-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://tu-plataforma.com/webhooks/anytimebot"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('webhooks.urlHint')}</p>
              </div>
              <div>
                <Label>{t('webhooks.eventsLabel')}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {EVENT_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedEvents.includes(key)}
                        onCheckedChange={(checked) =>
                          setSelectedEvents((prev) =>
                            checked ? [...prev, key] : prev.filter((e) => e !== key),
                          )
                        }
                      />
                      {t(`webhooks.event_${key}`)}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('webhooks.eventsHint')}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={creating || !url.trim()}>
                {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {t('webhooks.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Secret shown once */}
        <Dialog open={!!createdSecret} onOpenChange={(open) => !open && setCreatedSecret(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('webhooks.createdTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('webhooks.createdWarning')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                {createdSecret}
              </code>
              <Button variant="outline" size="icon" onClick={copySecret} aria-label={t('common.copy')}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setCreatedSecret(null)}>{t('common.done')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delivery history dialog */}
        <Dialog open={!!historyOf} onOpenChange={(open) => !open && setHistoryOf(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('webhooks.historyTitle')}</DialogTitle>
              <p className="text-sm text-muted-foreground break-all">{historyOf?.url}</p>
            </DialogHeader>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t('common.loading')}
              </div>
            ) : history.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('webhooks.historyEmpty')}</p>
            ) : (
              <>
                <div className="space-y-2">
                  {history.map((d) => (
                    <div key={d.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{d.eventType}</code>
                          <Badge
                            variant={d.status === 'DELIVERED' ? 'default' : d.status === 'FAILED' ? 'destructive' : 'secondary'}
                          >
                            {d.status === 'DELIVERED'
                              ? t('webhooks.statusDelivered')
                              : d.status === 'FAILED'
                                ? t('webhooks.statusFailed')
                                : t('webhooks.statusPending')}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(d.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t('webhooks.attempts', { count: d.attempts })}
                          {d.responseStatus !== null && ` · HTTP ${d.responseStatus}`}
                        </span>
                        {d.deliveredAt && (
                          <span>
                            {t('webhooks.deliveredAtLabel')} {new Date(d.deliveredAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {d.lastError && (
                        <p className="mt-1.5 rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive break-all">
                          {d.lastError}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {historyPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => historyOf && fetchHistory(historyOf.id, historyPage - 1)}
                      disabled={historyPage <= 1 || historyLoading}
                    >
                      {t('webhooks.historyPrev')}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t('webhooks.historyPageOf', { page: historyPage, pages: historyPages, total: historyTotal })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => historyOf && fetchHistory(historyOf.id, historyPage + 1)}
                      disabled={historyPage >= historyPages || historyLoading}
                    >
                      {t('webhooks.historyNext')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('webhooks.deleteTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t('webhooks.deleteConfirm', { url: deleting?.url ?? '' })}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={!deleting}>
                {t('webhooks.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
