'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MessageSquare, CheckCircle, XCircle, Smartphone, RefreshCw, Loader2, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface ChannelUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  whatsappEnabled: boolean;
  whatsappPhone: string | null;
  evolutionInstanceName: string | null;
}

interface SystemMessage {
  id: string;
  phone: string;
  message: string;
  direction: 'OUTGOING' | 'INCOMING';
  status: string;
  provider: string;
  bookingId: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
  READ: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  SENT: 'Enviado',
  DELIVERED: 'Entregado',
  READ: 'Leído',
  FAILED: 'Fallido',
};

export default function ChannelsPage() {
  const [users, setUsers] = useState<ChannelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [filterPhone, setFilterPhone] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [appliedPhone, setAppliedPhone] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalMessages, setTotalMessages] = useState(0);
  const [pages, setPages] = useState(1);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/channels');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    setMessagesLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (appliedPhone) params.set('phone', appliedPhone);
      if (appliedStatus !== 'ALL') params.set('status', appliedStatus);

      const response = await fetch(`/api/admin/channels/messages?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
        setTotalMessages(data.pagination?.total ?? data.messages.length);
        setPages(data.pagination?.pages ?? 1);
      } else {
        toast.error('No se pudieron cargar los mensajes del sistema');
      }
    } catch (error) {
      console.error('Failed to fetch system messages:', error);
      toast.error('No se pudieron cargar los mensajes del sistema');
    } finally {
      setMessagesLoading(false);
    }
  }, [appliedPhone, appliedStatus, page, pageSize]);

  // Reset to page 1 whenever the filters change.
  useEffect(() => {
    setPage(1);
  }, [appliedPhone, appliedStatus, pageSize]);

  useEffect(() => {
    fetchChannels();
    fetchMessages();
  }, [fetchChannels, fetchMessages]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Canales</h1>
        <p className="text-muted-foreground">Monitoriza las integraciones de WhatsApp de los negocios y del sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Integraciones de WhatsApp de los negocios
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay integraciones de WhatsApp conectadas
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Instancia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.email}</p>
                          {user.name && (
                            <p className="text-sm text-muted-foreground">{user.name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          user.plan === 'PRO' ? 'bg-blue-100 text-blue-800' :
                          user.plan === 'TEAM' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-orange-800'
                        }>
                          {user.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.whatsappEnabled ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm">Activo</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-gray-400">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm">Inactivo</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {user.whatsappPhone || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {user.evolutionInstanceName || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Mensajes del número de notificaciones del sistema
            </div>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchMessages} disabled={messagesLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${messagesLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 max-w-xs">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Teléfono</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por teléfono…"
                  className="pl-8"
                  value={filterPhone}
                  onChange={(e) => setFilterPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAppliedPhone(filterPhone.trim());
                      setAppliedStatus(filterStatus);
                    }
                  }}
                />
              </div>
            </div>
            <div className="min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado</label>
              <Select
                value={filterStatus}
                onValueChange={(v) => {
                  setFilterStatus(v);
                  setAppliedStatus(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los estados</SelectItem>
                  <SelectItem value="PENDING">Pendiente</SelectItem>
                  <SelectItem value="SENT">Enviado</SelectItem>
                  <SelectItem value="DELIVERED">Entregado</SelectItem>
                  <SelectItem value="READ">Leído</SelectItem>
                  <SelectItem value="FAILED">Fallido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => { setAppliedPhone(filterPhone.trim()); setAppliedStatus(filterStatus); }}>
              <Search className="h-4 w-4 mr-1" />
              Filtrar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setFilterPhone('');
                setFilterStatus('ALL');
                setAppliedPhone('');
                setAppliedStatus('ALL');
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {totalMessages} mensaje{totalMessages !== 1 ? 's' : ''} en total
            {appliedPhone && <> · teléfono: <span className="font-mono">{appliedPhone}</span></>}
            {appliedStatus !== 'ALL' && <> · estado: {STATUS_LABEL[appliedStatus] || appliedStatus}</>}
          </p>
          {/* Pagination controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(parseInt(v, 10))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Por página" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 / página</SelectItem>
                <SelectItem value="50">50 / página</SelectItem>
                <SelectItem value="100">100 / página</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || messagesLoading}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="px-3 text-muted-foreground whitespace-nowrap">
                Página {page} de {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages || messagesLoading}
                onClick={() => setPage((p) => Math.min(p + 1, pages))}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {messagesLoading ? (
            <div className="text-center py-8">
              <Loader2 className="animate-spin h-8 w-8 mx-auto text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {appliedPhone || appliedStatus !== 'ALL'
                ? 'No hay mensajes que coincidan con los filtros'
                : 'Todavía no hay mensajes enviados desde el número del sistema'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Mensaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(m.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{m.phone}</TableCell>
                      <TableCell>
                        <Badge className={m.direction === 'OUTGOING' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-700'}>
                          {m.direction === 'OUTGOING' ? 'Saliente' : 'Entrante'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[m.status] || 'bg-gray-100 text-gray-700'}>
                          {STATUS_LABEL[m.status] || m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-2">
                          {m.message}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
