'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/hooks';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, CalendarClock, Link2, Users, Lock } from 'lucide-react';

interface PublicSlot {
  id: string;
  startTime: string;
  endTime: string;
  count: number;
  voters: string[];
}

interface PublicPoll {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  meetingUrl: string | null;
  status: string;
  timezone: string;
  slots: PublicSlot[];
}

export function PollVote({ poll }: { poll: PublicPoll }) {
  const { t } = useTranslation('translation');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = poll.status === 'OPEN';

  const toggle = (slotId: string) => {
    const next = new Set(selected);
    if (next.has(slotId)) next.delete(slotId);
    else next.add(slotId);
    setSelected(next);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError(t('polls.nameRequired'));
      return;
    }
    if (selected.size === 0) {
      setError(t('polls.chooseAtLeastOne'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || undefined, slots: [...selected] }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || t('polls.errorGeneric'));
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t('polls.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const formatRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const date = s.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const time = (d: Date) =>
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return { date, time: `${time(s)} – ${time(e)}` };
  };

  const maxVotes = Math.max(...poll.slots.map((s) => s.count), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Slim public header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="relative block h-9 w-40">
            <BrandLogo
              alt="ANYTIMEBOT"
              fill
              className="object-left"
            />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
            <CalendarClock className="h-3.5 w-3.5" />
            {t('polls.badge')}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{poll.title}</h1>
          {poll.description && (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{poll.description}</p>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {poll.durationMinutes} {t('polls.minutes')}
            </span>
            {poll.meetingUrl && (
              <a
                href={poll.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-500 hover:underline"
              >
                <Link2 className="h-3.5 w-3.5" />
                {t('polls.meetingLink')}
              </a>
            )}
          </p>

          {!open && (
            <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Lock className="h-4 w-4" />
                {t('polls.closed')}
              </span>
            </div>
          )}

          <div className="mt-6 space-y-2">
            <p className="text-sm font-semibold text-slate-700">{t('polls.optionsTitle')}</p>
            {poll.slots.map((slot) => {
              const r = formatRange(slot.startTime, slot.endTime);
              const checked = selected.has(slot.id);
              const ratio = maxVotes > 0 ? (slot.count / maxVotes) * 100 : 0;
              return (
                <div key={slot.id}>
                  <button
                    type="button"
                    disabled={!open}
                    onClick={() => toggle(slot.id)}
                    className={`relative w-full overflow-hidden rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 bg-indigo-100/60 transition-all"
                      style={{ width: open ? `${ratio}%` : 0 }}
                    />
                    <span className="relative flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold capitalize text-slate-800">
                          {r.date}
                        </span>
                        <span className="block text-sm text-slate-500">{r.time}</span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-3">
                        {open && (
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                              checked
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked && <CheckCircle2 className="h-4 w-4" />}
                          </span>
                        )}
                        <span className="min-w-[3.5rem] text-right text-xs font-semibold text-slate-500">
                          {slot.count} {slot.count === 1 ? t('polls.vote') : t('polls.votes')}
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {open && !submitted && (
            <div className="mt-6 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs text-slate-500">{t('polls.yourName')}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-slate-500">{t('polls.yourEmail')}</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('polls.emailOptional')}
                  />
                </div>
              </div>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <Button
                type="button"
                disabled={saving || selected.size === 0}
                onClick={() => void submit()}
                className="w-full"
              >
                {saving ? '…' : t('polls.saveAvailability')}
              </Button>
              <p className="text-center text-xs text-slate-400">{t('polls.canChange')}</p>
            </div>
          )}

          {submitted && (
            <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-4 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-2 font-semibold text-emerald-700">{t('polls.thanks')}</p>
              <p className="mt-1 text-sm text-emerald-600">{t('polls.thanksDesc')}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setSubmitted(false);
                  setSelected(new Set());
                }}
              >
                {t('polls.changeAnswer')}
              </Button>
            </div>
          )}

          {!open && submitted && (
            <p className="mt-4 text-center text-sm text-slate-500">{t('polls.thanks')}</p>
          )}
        </div>
      </main>
    </div>
  );
}
