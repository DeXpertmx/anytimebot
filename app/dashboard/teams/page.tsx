
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Settings, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Team {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  members: any[];
  _count: {
    eventTypes: number;
  };
  createdAt: string;
}

export default function TeamsPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchTeams();
    }
  }, [status, router]);

  const fetchTeams = async () => {
    try {
      const response = await fetch('/api/teams');
      const data = await response.json();

      if (data.success) {
        setTeams(data.data);
      } else {
        toast.error(data.error || 'No se pudieron cargar los equipos');
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
      toast.error('No se pudieron cargar los equipos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error('El nombre del equipo es obligatorio');
      return;
    }

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Equipo creado correctamente');
        setIsCreateDialogOpen(false);
        setFormData({ name: '', description: '' });
        fetchTeams();
      } else {
        toast.error(data.error || 'No se pudo crear el equipo');
      }
    } catch (error) {
      console.error('Error creating team:', error);
      toast.error('No se pudo crear el equipo');
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm('¿Seguro que quieres eliminar este equipo? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Equipo eliminado correctamente');
        fetchTeams();
      } else {
        toast.error(data.error || 'No se pudo eliminar el equipo');
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      toast.error('No se pudo eliminar el equipo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 pb-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Gestión de equipos</h1>
          <p className="text-muted-foreground mt-2">
            Crea equipos y gestiona la agenda de forma colaborativa
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Crear equipo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear nuevo equipo</DialogTitle>
              <DialogDescription>
                Crea un equipo para gestionar la agenda de forma colaborativa con varios miembros
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <Label htmlFor="name">Nombre del equipo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej., Equipo de ventas, Equipo de soporte"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Descripción (opcional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Breve descripción del objetivo del equipo"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Crear equipo</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Aún no hay equipos</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crea tu primer equipo para activar la agenda colaborativa
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear equipo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card key={team.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {team.name}
                      {!team.isActive && (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {team.description || 'Sin descripción'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Miembros</span>
                    <Badge variant="outline">{team.members.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tipos de eventos</span>
                    <Badge variant="outline">{team._count.eventTypes}</Badge>
                  </div>
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => router.push(`/dashboard/teams/${team.id}`)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Gestionar
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteTeam(team.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
