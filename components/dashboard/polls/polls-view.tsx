'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import { CalendarClock, Plus, Trash2, Users, Link2, Pencil, CheckCircle2, Trophy } from 'lucide-react';

interface PollListItem {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  meetingUrl: string | null;
  status: 'OPEN' | 'CLOSED';
  timezone: string;
  createdAt: string;
  _count: { slots: number; participants: number };
  slots: Array<{ id: string; startTime: string; _count: { votes: number } }>;
}

interface PollDetail {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  meetingUrl: string | null;
  status: 'OPEN' | 'CLOSED';
  timezone: string;
  _count: { participants: number; slots: number };
  slots: Array<{
    id: string;
    startTime: string;
    endTime: string;
    votes: Array<{ participant: { id: string; name: string; email: string | null } }>;
  }>;
}

interface SlotRow {
  date: string;
  time: string;
}

export function PollsView() {
  const { t } = useTranslation('translation');
  const [data, setData] = useState<PollListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/polls')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // ---- Create/edit dialog ----
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PollListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    durationMinutes: '30',
    meetingUrl: '',
  });
  const [rows, setRows] = useState<SlotRow[]>([
    { date: '', time: '09:00' },
    { date: '', time: '11:00' },
  ]);

  const resetForm = () => {
    setEditing(null);
    setForm({ title: '', description: '', durationMinutes: '30', meetingUrl: '' });
    setRows([
      { date: '', time: '09:00' },
      { date: '', time: '11:00' },
    ]);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (poll: PollListItem) => {
    // Existing slots come as ISO instants; split into the host's local date/time.
    const parsed = poll.slots.map((s) => {
      const d = new Date(s.startTime);
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      };
    });
    if (parsed.length === 0) parsed.push({ date: '', time: '09:00' });
    setEditing(poll);
    setForm({
      title: poll.title,
      description: poll.description || '',
      durationMinutes: String(poll.durationMinutes),
      meetingUrl: poll.meetingUrl || '',
    });
    setRows(parsed);
    setOpen(true);
  };

  const setRow = (index: number, patch: Partial<SlotRow>) => {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  })();

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(t('polls.titleRequired'));
      return;
    }
    const starts: string[] = [];
    for (const row of rows) {
      if (!row.date || !row.time) continue;
      const d = new Date(`${row.date}T${row.time}:00`);
      if (!isNaN(d.getTime())) starts.push(d.toISOString());
    }
    if (starts.length < 2) {
      toast.error(t('polls.needsTwoOptions'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        durationMinutes: parseInt(form.durationMinutes, 10) || 30,
        meetingUrl: form.meetingUrl || undefined,
        timezone,
        slots: starts,
      };
      const res = editing
        ? await fetch(`/api/polls/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/polls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || t('polls.saveError'));
        return;
      }
      toast.success(editing ? t('polls.pollSaved') : t('polls.pollCreated'));
      setOpen(false);
      load();
    } catch {
      toast.error(t('polls.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Toggle status / delete / copy ----
  const toggleStatus = async (poll: PollListItem) => {
    const next = poll.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    const res = await fetch(`/api/polls/${poll.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      toast.success(next === 'CLOSED' ? t('polls.closedToast') : t('polls.openedToast'));
      load();
    } else {
      const body = await res.json();
      toast.error(body?.error || t('polls.saveError'));
    }
  };

  const remove = async (poll: PollListItem) => {
    if (!confirm(t('polls.deleteConfirm'))) return;
    const res = await fetch(`/api/polls/${poll.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(t('polls.deleted'));
      load();
    } else toast.error(t('polls.saveError'));
  };

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}/poll/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('polls.copied'));
    } catch {
      prompt(url);
    }
  };

  // ---- Results dialog ----
  const [detail, setDetail] = useState<PollDetail | null>(null);

  const showResults = async (poll: PollListItem) => {
    const res = await fetch(`/api/polls/${poll.id}`);
    if (!res.ok) return;
    const body = await res.json();
    setDetail(body.data);
  };

  const fmtWhen = (poll: { timezone: string }, start: string, end?: string) => {
    const s = new Date(start);
    const parts = [
      s.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', timeZone: poll.timezone }),
      s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: poll.timezone }),
    ];
    if (end) {
      parts.push(
        `–${new Date(end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: poll.timezone })}`,
      );
    }
    return parts.join(' · ');
  };

  const formatListDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }
  if (error || !data) {
    return <div className="py-24 text-center text-slate-500">{t('polls.loadError')}</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50">
                <CalendarClock className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-lg">{t('polls.title')}</CardTitle>
                <CardDescription>{t('polls.description')}</CardDescription>
              </div>
            </div>
            <Button type="button" onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" />
              {t('polls.newPoll')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">{t('polls.noPolls')}</p>
              <p className="mt-1 text-sm text-slate-400">{t('polls.noPollsHint')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((poll) => {
                const totalVotes = poll.slots.reduce((n, s) => n + s._count.votes, 0);
                return (
                  <div key={poll.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-800">{poll.title}</p>
                          <Badge
                            variant="secondary"
                            className={
                              poll.status === 'OPEN'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-slate-100 text-slate-500'
                            }
                          >
                            {poll.status === 'OPEN' ? t('polls.statusOpen') : t('polls.statusClosed')}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatListDate(poll.createdAt)} · {poll._count.slots}{' '}
                          {t('polls.optionsShort')} · {poll._count.participants}{' '}
                          {t('polls.participants')} · {totalVotes} {t('polls.votes')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {poll.status === 'OPEN' && (
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(poll)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            {t('polls.edit')}
                          </Button>
                        )}
                        <Button type="button" variant="outline" size="sm" onClick={() => showResults(poll)}>
                          <Users className="mr-1 h-3.5 w-3.5" />
                          {t('polls.results')}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => copyLink(poll.id)}>
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          {t('polls.copyLink')}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => toggleStatus(poll)}>
                          {poll.status === 'OPEN' ? t('polls.close') : t('polls.open')}
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(poll)}>
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? t('polls.editPoll') : t('polls.newPoll')}</DialogTitle>
            <DialogDescription>{t('polls.dialogHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
            <div>
              <Label className="mb-1 block text-xs text-slate-500">{t('polls.pollName')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t('polls.pollNamePlaceholder')}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-slate-500">{t('polls.pollDesc')}</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('polls.duration')}</Label>
                <Input
                  type="number"
                  value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('polls.meetingUrl')}</Label>
                <Input
                  value={form.meetingUrl}
                  onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">{t('polls.optionsTitle')}</p>
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="date"
                      value={row.date}
                      onChange={(e) => setRow(i, { date: e.target.value })}
                      className="flex-1"
                    />
                    <Input
                      type="time"
                      value={row.time}
                      onChange={(e) => setRow(i, { time: e.target.value })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={rows.length <= 2}
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setRows((rs) => [...rs, { date: rows[rows.length - 1]?.date || '', time: '09:00' }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t('polls.addOption')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('polls.cancel')}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? '…' : t('polls.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.title}
                  <Badge
                    variant="secondary"
                    className={
                      detail.status === 'OPEN'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-slate-100 text-slate-500'
                    }
                  >
                    {detail.status === 'OPEN' ? t('polls.statusOpen') : t('polls.statusClosed')}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {detail._count.participants} {t('polls.participants')}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {[...detail.slots]
                  .sort((a, b) => b.votes.length - a.votes.length || +new Date(a.startTime) - +new Date(b.startTime))
                  .map((slot, idx) => {
                    const best = idx === 0 && detail.slots.some((s) => s.votes.length > 0) && slot.votes.length > 0;
                    return (
                      <div
                        key={slot.id}
                        className={`rounded-xl border p-4 ${
                          best ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold capitalize text-slate-800">
                            {fmtWhen(detail, slot.startTime, slot.endTime)}
                          </p>
                          <div className="flex items-center gap-2">
                            {best && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                <Trophy className="h-3 w-3" />
                                {t('polls.best')}
                              </span>
                            )}
                            <Badge variant="secondary" className="bg-indigo-50 text-indigo-600">
                              {slot.votes.length} {t('polls.votes')}
                            </Badge>
                          </div>
                        </div>
                        {slot.votes.length === 0 ? (
                          <p className="mt-1 text-sm text-slate-400">{t('polls.noVotes')}</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {slot.votes.map((v) => (
                              <span
                                key={v.participant.id}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                              >
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                {v.participant.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              <DialogFooter>
                <div className="flex w-full items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => copyLink(detail.id)}>
                    <Link2 className="mr-1 h-4 w-4" />
                    {t('polls.copyLink')}
                  </Button>
                  <Button type="button" onClick={() => setDetail(null)}>
                    {t('polls.closeDialog')}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
