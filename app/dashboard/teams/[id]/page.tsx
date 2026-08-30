
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, UserPlus, Trash2, Edit, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface TeamMember {
  id: string;
  email: string;
  userId?: string;
  timezone: string;
  skills: string[];
  languages: string[];
  role: string;
  isActive: boolean;
  user?: {
    id: string;
    name?: string;
    email: string;
    image?: string;
    calendarSyncEnabled: boolean;
  };
}

interface Team {
  id: string;
  name: string;
  description?: string;
  members: TeamMember[];
  eventTypes: any[];
}

export default function TeamDetailPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const params = useParams();
  const teamId = params?.id as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({
    email: '',
    timezone: 'UTC',
    skills: '',
    languages: '',
    role: 'MEMBER',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && teamId) {
      fetchTeam();
    }
  }, [status, router, teamId]);

  const fetchTeam = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}`);
      const data = await response.json();

      if (data.success) {
        setTeam(data.data);
      } else {
        toast.error(data.error || 'No se pudo cargar el equipo');
        router.push('/dashboard/teams');
      }
    } catch (error) {
      console.error('Error fetching team:', error);
      toast.error('No se pudo cargar el equipo');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!memberForm.email) {
      toast.error('El correo electrónico es obligatorio');
      return;
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: memberForm.email,
          timezone: memberForm.timezone,
          skills: memberForm.skills.split(',').map((s) => s.trim()).filter(Boolean),
          languages: memberForm.languages.split(',').map((l) => l.trim()).filter(Boolean),
          role: memberForm.role,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Miembro añadido correctamente');
        setIsAddMemberDialogOpen(false);
        setMemberForm({
          email: '',
          timezone: 'UTC',
          skills: '',
          languages: '',
          role: 'MEMBER',
        });
        fetchTeam();
      } else {
        toast.error(data.error || 'No se pudo añadir el miembro');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('No se pudo añadir el miembro');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('¿Seguro que quieres eliminar este miembro?')) {
      return;
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Miembro eliminado correctamente');
        fetchTeam();
      } else {
        toast.error(data.error || 'No se pudo eliminar el miembro');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('No se pudo eliminar el miembro');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!team) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 pb-10">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => router.push('/dashboard/teams')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a equipos
      </Button>

      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold">{team.name}</h1>
          {team.description && (
            <p className="text-muted-foreground mt-2">{team.description}</p>
          )}
        </div>
        <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Añadir miembro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Añadir miembro al equipo</DialogTitle>
              <DialogDescription>
                Añade un miembro al equipo. Puede ser un usuario existente o externo.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                  placeholder="member@example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="timezone">Zona horaria</Label>
                <Select
                  value={memberForm.timezone}
                  onValueChange={(value) => setMemberForm({ ...memberForm, timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">Hora del este</SelectItem>
                    <SelectItem value="America/Chicago">Hora central</SelectItem>
                    <SelectItem value="America/Denver">Hora de montaña</SelectItem>
                    <SelectItem value="America/Los_Angeles">Hora del Pacífico</SelectItem>
                    <SelectItem value="Europe/London">Londres</SelectItem>
                    <SelectItem value="Europe/Paris">París</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="skills">Habilidades (separadas por comas)</Label>
                <Input
                  id="skills"
                  value={memberForm.skills}
                  onChange={(e) => setMemberForm({ ...memberForm, skills: e.target.value })}
                  placeholder="ej., facturación, soporte, técnico"
                />
              </div>
              <div>
                <Label htmlFor="languages">Idiomas (separados por comas)</Label>
                <Input
                  id="languages"
                  value={memberForm.languages}
                  onChange={(e) => setMemberForm({ ...memberForm, languages: e.target.value })}
                  placeholder="ej., español, inglés, alemán"
                />
              </div>
              <div>
                <Label htmlFor="role">Rol</Label>
                <Select
                  value={memberForm.role}
                  onValueChange={(value) => setMemberForm({ ...memberForm, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Miembro</SelectItem>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddMemberDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Añadir miembro</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Miembros del equipo ({team.members.length})</CardTitle>
            <CardDescription>Gestiona los miembros del equipo y su configuración</CardDescription>
          </CardHeader>
          <CardContent>
            {team.members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aún no hay miembros. Añade el primero para comenzar.
              </div>
            ) : (
              <div className="space-y-4">
                {team.members.map((member) => (
                  <div key={member.id} className="flex items-start justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{member.user?.name || member.email}</p>
                        <Badge variant="outline" className="text-xs">
                          {member.role}
                        </Badge>
                        {member.user?.calendarSyncEnabled ? (
                          <Badge variant="default" className="text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Calendario
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <X className="h-3 w-3 mr-1" />
                            Sin calendario
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{member.email}</p>
                      <div className="flex gap-2 mt-2">
                        {member.skills.length > 0 && (
                          <div className="flex gap-1">
                            {member.skills.map((skill) => (
                              <Badge key={skill} variant="secondary" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {member.languages.length > 0 && (
                          <div className="flex gap-1">
                            {member.languages.map((lang) => (
                              <Badge key={lang} variant="outline" className="text-xs">
                                {lang}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipos de eventos ({team.eventTypes.length})</CardTitle>
            <CardDescription>Tipos de eventos que usan este equipo</CardDescription>
          </CardHeader>
          <CardContent>
            {team.eventTypes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aún no hay tipos de eventos que usen este equipo.
              </div>
            ) : (
              <div className="space-y-2">
                {team.eventTypes.map((eventType) => (
                  <div key={eventType.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <p className="font-medium">{eventType.name}</p>
                      <Badge variant="outline">{eventType.assignmentMode}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
