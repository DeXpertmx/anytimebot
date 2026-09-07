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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollText, Loader2, RefreshCw, ChevronDown, Video } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  adminEmail: string;
  adminName: string | null;
  createdAt: string;
}

interface MeetingLogEntry {
  id: string;
  provider: string;
  success: boolean;
  roomUrl: string | null;
  meetingId: string | null;
  error: string | null;
  bookingId: string;
  userEmail: string;
  userName: string | null;
  createdAt: string;
}

const ALL_ACTIONS = '__all__';

const ACTION_OPTIONS = [
  { value: ALL_ACTIONS, label: 'Todas las acciones' },
  { value: 'SET_EMAIL_SMTP', label: 'Correo — SMTP guardado' },
  { value: 'SET_EMAIL_CREDENTIALS', label: 'Correo — clave guardada' },
  { value: 'CLEAR_EMAIL_CREDENTIALS', label: 'Correo — credenciales eliminadas' },
  { value: 'TEST_EMAIL', label: 'Correo — prueba enviada' },
  { value: 'SET_STRIPE_MODE', label: 'Stripe — modo cambiado' },
  { value: 'SET_STRIPE_CREDENTIALS', label: 'Stripe — credenciales guardadas' },
  { value: 'CLEAR_STRIPE_CREDENTIALS', label: 'Stripe — credenciales eliminadas' },
  { value: 'CHANGE_PLAN', label: 'Usuario — plan cambiado' },
  { value: 'SUSPEND_USER', label: 'Usuario — suspendido' },
  { value: 'REACTIVATE_USER', label: 'Usuario — reactivado' },
  { value: 'RESET_USAGE', label: 'Usuario — uso restablecido' },
  { value: 'UPDATE_SETTINGS', label: 'Configuración — actualizada' },
];

const ACTION_BADGE: Record<string, string> = {
  SET_EMAIL_SMTP: 'bg-blue-100 text-blue-800',
  SET_EMAIL_CREDENTIALS: 'bg-blue-100 text-blue-800',
  CLEAR_EMAIL_CREDENTIALS: 'bg-amber-100 text-amber-800',
  TEST_EMAIL: 'bg-emerald-100 text-emerald-800',
  SET_STRIPE_MODE: 'bg-indigo-100 text-indigo-800',
  SET_STRIPE_CREDENTIALS: 'bg-indigo-100 text-indigo-800',
  CLEAR_STRIPE_CREDENTIALS: 'bg-amber-100 text-amber-800',
  CHANGE_PLAN: 'bg-violet-100 text-violet-800',
  SUSPEND_USER: 'bg-red-100 text-red-800',
  REACTIVATE_USER: 'bg-green-100 text-green-800',
  RESET_USAGE: 'bg-slate-100 text-slate-800',
  UPDATE_SETTINGS: 'bg-slate-100 text-slate-800',
};

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) return '—';
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (reset: boolean, cursor?: string) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      setError(null);
      const params = new URLSearchParams({ limit: '50' });
      if (action && action !== ALL_ACTIONS) params.set('action', action);
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los registros');
      setLogs((prev) => (reset ? data.logs : [...prev, ...data.logs]));
      setTotal(data.total);
      setNextCursor(data.nextCursor);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudieron cargar los registros';
      setError(message);
      console.error('Error al cargar los registros de auditoría:', caught);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [action]);

  useEffect(() => {
    fetchLogs(true);
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6" />
            Registros de auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consulta quién modificó el correo, Stripe y la configuración de usuarios, además del resultado de los emails de prueba.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={action || ALL_ACTIONS} onValueChange={(v) => setAction(v === ALL_ACTIONS ? '' : v)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filtrar por acción" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => fetchLogs(true)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {total} {total === 1 ? 'registro' : 'registros'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && !loading && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No se encontraron registros de auditoría.
            </p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Fecha</TableHead>
                    <TableHead className="w-56">Administrador</TableHead>
                    <TableHead className="w-48">Acción</TableHead>
                    <TableHead>Detalles</TableHead>
                    <TableHead className="w-36">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{entry.adminName || entry.adminEmail}</span>
                        <span className="block text-xs text-muted-foreground">{entry.adminEmail}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={ACTION_BADGE[entry.action] || 'bg-slate-100 text-slate-700'}>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono break-all text-muted-foreground">
                        {formatDetails(entry.details)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.ipAddress || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {nextCursor && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchLogs(false, nextCursor)}
                    disabled={loadingMore}
                  >
                    <ChevronDown className="h-4 w-4 mr-1" />
                    {loadingMore ? 'Cargando…' : 'Cargar más'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <VideoMeetingLogsSection />
    </div>
  );
}

const ALL_PROVIDERS = '__all__';
const ALL_STATUSES = '__all__';

const PROVIDER_OPTIONS = [
  { value: ALL_PROVIDERS, label: 'Todos los proveedores' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'teams', label: 'Microsoft Teams' },
];

const STATUS_OPTIONS = [
  { value: ALL_STATUSES, label: 'Todos los estados' },
  { value: 'success', label: 'Creadas' },
  { value: 'failed', label: 'Fallaron' },
];

function VideoMeetingLogsSection() {
  const [logs, setLogs] = useState<MeetingLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');

  const fetchLogs = useCallback(async (reset: boolean, cursor?: string) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      setError(null);
      const params = new URLSearchParams({ limit: '50' });
      if (provider) params.set('provider', provider);
      if (status) params.set('success', status === 'success' ? 'true' : 'false');
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/admin/video-meeting-logs?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los registros');
      setLogs((prev) => (reset ? data.logs : [...prev, ...data.logs]));
      setTotal(data.total);
      setNextCursor(data.nextCursor);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudieron cargar los registros';
      setError(message);
      console.error('Error al cargar los registros de reuniones:', caught);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [provider, status]);

  useEffect(() => {
    fetchLogs(true);
  }, [fetchLogs]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-5 w-5 text-indigo-600" />
          Reuniones Zoom / Teams
        </CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Creación o fallo de reuniones automáticas al reservar ({total} {total === 1 ? 'registro' : 'registros'}).
          </p>
          <div className="flex items-center gap-2">
            <Select value={provider || ALL_PROVIDERS} onValueChange={(v) => setProvider(v === ALL_PROVIDERS ? '' : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos los proveedores" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status || ALL_STATUSES} onValueChange={(v) => setStatus(v === ALL_STATUSES ? '' : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => fetchLogs(true)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && !loading && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay registros de reuniones todavía.
          </p>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Fecha</TableHead>
                  <TableHead className="w-52">Usuario</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead className="w-24">Proveedor</TableHead>
                  <TableHead>Detalles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{entry.userName || entry.userEmail}</span>
                      <span className="block text-xs text-muted-foreground">{entry.userEmail}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={entry.success ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                        {entry.success ? 'Creada' : 'Falló'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{entry.provider}</TableCell>
                    <TableCell className="text-xs text-muted-foreground break-all">
                      {entry.success
                        ? entry.roomUrl || `ID ${entry.meetingId || '—'}`
                        : entry.error || 'Error desconocido'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {nextCursor && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(false, nextCursor)}
                  disabled={loadingMore}
                >
                  <ChevronDown className="h-4 w-4 mr-1" />
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}