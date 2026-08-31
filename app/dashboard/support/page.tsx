'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LifeBuoy, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface TicketMessage {
  id: string;
  body: string;
  authorUserId: string | null;
  authorAdminEmail: string | null;
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  createdAt: string;
  messages: TicketMessage[];
}

const statusKey: Record<Ticket['status'], string> = {
  OPEN: 'open',
  IN_PROGRESS: 'inProgress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};

export default function SupportPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Ticket['priority']>('NORMAL');
  const [reply, setReply] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadTickets = async () => {
    try {
      const response = await fetch('/api/support/tickets');
      if (!response.ok) throw new Error();
      setTickets((await response.json()).tickets || []);
    } catch {
      toast.error(t('support.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, []);

  const createTicket = async (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, priority }),
      });
      if (!response.ok) throw new Error();
      setSubject('');
      setMessage('');
      setPriority('NORMAL');
      toast.success(t('support.created'));
      await loadTickets();
    } catch {
      toast.error(t('support.error'));
    } finally {
      setSending(false);
    }
  };

  const sendReply = async (ticketId: string) => {
    const body = reply[ticketId]?.trim();
    if (!body) return;
    setSending(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error();
      setReply((current) => ({ ...current, [ticketId]: '' }));
      toast.success(t('support.created'));
      await loadTickets();
    } catch {
      toast.error(t('support.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-7 w-7 text-indigo-600" />
          <h1 className="text-3xl font-bold text-slate-900">{t('support.title')}</h1>
        </div>
        <p className="mt-1 text-slate-500">{t('support.subtitle')}</p>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('support.newTicket')}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createTicket} className="space-y-4">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={t('support.subjectPlaceholder')} maxLength={160} required />
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t('support.messagePlaceholder')} rows={5} maxLength={10000} required />
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-slate-700" htmlFor="ticket-priority">{t('support.priority')}</label>
              <select id="ticket-priority" value={priority} onChange={(event) => setPriority(event.target.value as Ticket['priority'])} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="LOW">{t('support.low')}</option>
                <option value="NORMAL">{t('support.normal')}</option>
                <option value="HIGH">{t('support.high')}</option>
              </select>
              <Button type="submit" disabled={sending} className="ml-auto"><Send className="mr-2 h-4 w-4" />{sending ? t('support.sending') : t('support.send')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : tickets.length === 0 ? (
        <Card><CardContent className="py-10 text-center"><p className="font-medium text-slate-700">{t('support.empty')}</p><p className="mt-1 text-sm text-slate-500">{t('support.emptyDesc')}</p></CardContent></Card>
      ) : tickets.map((ticket) => (
        <Card key={ticket.id}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div><CardTitle className="text-lg">{ticket.subject}</CardTitle><p className="mt-1 text-xs text-slate-500">{new Date(ticket.createdAt).toLocaleString()}</p></div>
            <Badge variant={ticket.status === 'CLOSED' ? 'secondary' : ticket.status === 'RESOLVED' ? 'outline' : 'default'}>{t(`support.${statusKey[ticket.status]}`)}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {ticket.messages.map((item) => <div key={item.id} className={`rounded-lg p-3 text-sm ${item.authorAdminEmail ? 'bg-indigo-50' : 'bg-slate-50'}`}><p className="mb-1 text-xs font-semibold text-slate-500">{item.authorAdminEmail || 'Tú'} · {new Date(item.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap text-slate-800">{item.body}</p></div>)}
            </div>
            {ticket.status !== 'CLOSED' && <div className="flex gap-2"><Textarea value={reply[ticket.id] || ''} onChange={(event) => setReply((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder={t('support.replyPlaceholder')} rows={2} /><Button type="button" onClick={() => sendReply(ticket.id)} disabled={sending || !reply[ticket.id]?.trim()}>{t('support.reply')}</Button></div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
