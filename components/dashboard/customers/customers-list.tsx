'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Mail,
  Phone,
  Search,
  Tag,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

interface Customer {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags: string[];
  totalBookings: number;
  confirmedBookings: number;
  lastBookingAt?: string | null;
}

interface HistoryItem {
  id: string;
  guestName: string;
  startTime: string;
  status: string;
  eventType: { name: string };
}

export function CustomersList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<{ name: string; count: number }[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', notes: '', tags: [] as string[] });
  const [tagInput, setTagInput] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const fetchCustomers = useCallback(async (q = '', tag: string | null = activeTag) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (tag) params.set('tag', tag);
      const response = await fetch(`/api/customers?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setCustomers(data.data);
      } else {
        toast({
          title: t('common.error'),
          description: t('crm.saveFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, activeTag]);

  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch('/api/customers?tags=1');
      const data = await response.json();
      if (data.success) setAvailableTags(data.data);
    } catch (error) {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    fetchTags();
  }, [fetchCustomers, fetchTags]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(query), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTag]);

  const selectTag = (tag: string | null) => {
    setActiveTag(tag);
  };

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (activeTag) params.set('tag', activeTag);
    const qs = params.toString();
    window.open(`/api/customers/export${qs ? `?${qs}` : ''}`, '_blank');
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      notes: customer.notes || '',
      tags: [...customer.tags],
    });
    setTagInput('');
  };

  const addTag = () => {
    const value = tagInput.trim().toLowerCase();
    if (value && !form.tags.includes(value)) {
      setForm({ ...form, tags: [...form.tags, value].slice(0, 20) });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter((item) => item !== tag) });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (data.success) {
        toast({ title: t('common.success'), description: t('crm.saved') });
        setEditing(null);
        fetchCustomers(query);
        fetchTags();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.saveFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(t('crm.deleteConfirm'))) return;
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('crm.deleted') });
        fetchCustomers(query);
        fetchTags();
      } else {
        toast({
          title: t('common.error'),
          description: t('crm.deleteFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.deleteFailed'),
        variant: 'destructive',
      });
    }
  };

  const toggleHistory = async (customer: Customer) => {
    if (expanded === customer.id) {
      setExpanded(null);
      return;
    }
    setExpanded(customer.id);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/bookings?guestEmail=${encodeURIComponent(customer.email)}&limit=20&status=all`);
      const data = await response.json();
      if (data.success) setHistory(data.data.bookings);
    } catch (error) {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  };

  const initials = (customer: Customer) =>
    (customer.name?.[0] || customer.email[0] || '?').toUpperCase();

  const formatDate = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('crm.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="shrink-0">
          <Download className="mr-2 h-4 w-4" />
          {t('crm.exportCsv')}
        </Button>
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500">{t('crm.segments')}:</span>
          <button
            type="button"
            onClick={() => selectTag(null)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTag === null
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('crm.allCustomers')}
          </button>
          {availableTags.map(({ name, count }) => (
            <button
              key={name}
              type="button"
              onClick={() => selectTag(name)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTag === name
                  ? 'bg-indigo-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <Tag className="h-3 w-3" />
              {name}
              <span className={activeTag === name ? 'text-indigo-200' : 'text-amber-500'}>
                ({count})
              </span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('crm.loading')}
        </div>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UserRound className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('crm.empty')}</h3>
            <p className="text-gray-500 text-center max-w-sm">{t('crm.emptyDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <Card key={customer.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 font-semibold">
                      {initials(customer)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {customer.name || customer.email}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 mt-0.5">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3.5 w-3.5" />
                          {customer.email}
                        </span>
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {customer.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                          <CalendarDays className="h-3 w-3" />
                          {t('crm.totalBookings', { count: customer.totalBookings })}
                        </span>
                        <span className="text-gray-500">
                          {customer.lastBookingAt
                            ? t('crm.lastBooking', { date: formatDate(customer.lastBookingAt) })
                            : t('crm.never')}
                        </span>
                        {customer.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"
                          >
                            <Tag className="h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                      {customer.notes && (
                        <p className="mt-2 line-clamp-2 text-sm text-gray-600">{customer.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleHistory(customer)}>
                      {expanded === customer.id ? (
                        <ChevronUp className="mr-1 h-4 w-4" />
                      ) : (
                        <ChevronDown className="mr-1 h-4 w-4" />
                      )}
                      {t('crm.history')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(customer)}>
                      {t('crm.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(customer)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {expanded === customer.id && (
                  <div className="mt-4 space-y-2 border-t pt-3">
                    {historyLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('crm.loading')}
                      </div>
                    ) : history.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('crm.historyEmpty')}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {history.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-sm"
                          >
                            <span className="font-medium text-gray-800">{item.eventType.name}</span>
                            <span className="text-gray-600">
                              {new Date(item.startTime).toLocaleString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <Badge variant={item.status === 'CONFIRMED' ? 'default' : 'secondary'}>
                              {item.status}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('crm.editTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">{t('crm.name')}</Label>
              <Input
                id="customer-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">{t('crm.phone')}</Label>
              <Input
                id="customer-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-notes">{t('crm.notes')}</Label>
              <Textarea
                id="customer-notes"
                rows={4}
                placeholder={t('crm.notesPlaceholder')}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-tags">{t('crm.tags')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      type="button"
                      aria-label={`${t('common.delete')} ${tag}`}
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 text-amber-500 hover:text-amber-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="customer-tags"
                  value={tagInput}
                  placeholder={t('crm.tagsPlaceholder')}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  {t('common.next')}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
