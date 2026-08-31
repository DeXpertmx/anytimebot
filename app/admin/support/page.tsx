'use client';

import { useEffect, useState } from 'react';
import { Search, Send } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type Ticket = {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  user: { id: string; name: string | null; email: string };
  messages: { id: string; body: string; authorAdminEmail: string | null; createdAt: string }[];
};

const statusLabels: Record<Ticket['status'], string> = {
  OPEN: 'Abierto', IN_PROGRESS: 'En curso', RESOLVED: 'Resuelto', CLOSED: 'Cerrado',
};

export default function AdminSupportPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState<Record<string, string>>({});

  const loadTickets = async () => {
    const response = await fetch('/api/admin/support/tickets');
    if (response.ok) setTickets((await response.json()).tickets || []);
  };

  useEffect(() => { loadTickets().catch(() => undefined); }, []);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/support/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) setResults((await response.json()).results || []);
    } finally { setLoading(false); }
  };

  const updateTicket = async (id: string, status: Ticket['status']) => {
    await fetch('/api/admin/support/tickets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    await loadTickets();
  };

  const sendReply = async (id: string) => {
    const body = reply[id]?.trim();
    if (!body) return;
    const response = await fetch(`/api/admin/support/tickets/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
    if (response.ok) { setReply((current) => ({ ...current, [id]: '' })); await loadTickets(); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Soporte</h1><p className="text-muted-foreground">Gestiona tickets y ayuda a los usuarios.</p></div>

      <Card>
        <CardHeader><CardTitle>Tickets de soporte</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {tickets.length === 0 ? <p className="text-sm text-muted-foreground">No hay tickets pendientes.</p> : tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">{ticket.subject}</h3><p className="text-sm text-muted-foreground">{ticket.user.name || ticket.user.email} · Prioridad {ticket.priority.toLowerCase()}</p></div>
                <select value={ticket.status} onChange={(event) => updateTicket(ticket.id, event.target.value as Ticket['status'])} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="OPEN">{statusLabels.OPEN}</option><option value="IN_PROGRESS">{statusLabels.IN_PROGRESS}</option><option value="RESOLVED">{statusLabels.RESOLVED}</option><option value="CLOSED">{statusLabels.CLOSED}</option></select>
              </div>
              <div className="mt-3 space-y-2">{ticket.messages.map((message) => <div key={message.id} className={`rounded p-3 text-sm ${message.authorAdminEmail ? 'bg-indigo-50' : 'bg-slate-50'}`}><p className="mb-1 text-xs text-muted-foreground">{message.authorAdminEmail || ticket.user.email} · {new Date(message.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap">{message.body}</p></div>)}</div>
              {ticket.status !== 'CLOSED' && <div className="mt-3 flex gap-2"><Textarea rows={2} value={reply[ticket.id] || ''} onChange={(event) => setReply((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Responder al usuario..." /><Button onClick={() => sendReply(ticket.id)} disabled={!reply[ticket.id]?.trim()}><Send className="mr-2 h-4 w-4" />Responder</Button></div>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Buscar usuarios</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-4"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar por correo, reserva o nombre..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-10" /></div><Button type="submit" disabled={loading}>{loading ? 'Buscando...' : 'Buscar'}</Button></form>
          {results.length > 0 && <div className="mt-6 space-y-3">{results.map((result) => <Link key={result.id} href={`/admin/users/${result.id}`}><div className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-gray-50"><div className="flex items-center justify-between"><div><p className="font-medium">{result.email}</p>{result.name && <p className="text-sm text-muted-foreground">{result.name}</p>}</div><div className="text-right"><Badge>{result.plan}</Badge><p className="mt-1 text-xs text-muted-foreground">{result.bookingsCount} reservas</p></div></div></div></Link>)}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
