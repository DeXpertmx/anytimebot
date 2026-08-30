
'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  members: any[];
}

interface TeamAssignmentSelectorProps {
  teamId?: string;
  assignmentMode?: string;
  onTeamChange: (teamId: string | null) => void;
  onAssignmentModeChange: (mode: string) => void;
}

export function TeamAssignmentSelector({
  teamId,
  assignmentMode = 'individual',
  onTeamChange,
  onAssignmentModeChange,
}: TeamAssignmentSelectorProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const response = await fetch('/api/teams');
      const data = await response.json();

      if (data.success) {
        setTeams(data.data);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignmentModes = [
    {
      value: 'individual',
      label: 'Individual',
      description: 'Asignado a ti (comportamiento estándar)',
    },
    {
      value: 'collective',
      label: 'Colectiva',
      description: 'Participan todos los miembros; el sistema busca horarios disponibles para todos',
    },
    {
      value: 'round_robin',
      label: 'Turnos rotativos',
      description: 'Rota las asignaciones de forma equilibrada entre los miembros',
    },
    {
      value: 'smart',
      label: 'Asignación inteligente',
      description: 'La IA asigna según disponibilidad, carga de trabajo y coincidencia de habilidades',
    },
  ];

  const selectedMode = assignmentModes.find((m) => m.value === assignmentMode);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="team">Equipo (opcional)</Label>
        <Select
          value={teamId || 'none'}
          onValueChange={(value) => {
            if (value === 'none') {
              onTeamChange(null);
              onAssignmentModeChange('individual');
            } else {
              onTeamChange(value);
            }
          }}
        >
          <SelectTrigger id="team">
            <SelectValue placeholder={loading ? 'Cargando equipos...' : 'Selecciona un equipo'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin equipo (individual)</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name} ({team.members.length} members)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground mt-1">
          Asigna este tipo de evento a un equipo para gestionar la agenda de forma colaborativa
        </p>
      </div>

      {teamId && (
        <div>
          <Label htmlFor="assignmentMode">Modo de asignación</Label>
          <Select
            value={assignmentMode}
            onValueChange={onAssignmentModeChange}
          >
            <SelectTrigger id="assignmentMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assignmentModes
                .filter((mode) => mode.value !== 'individual')
                .map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {selectedMode && selectedMode.value !== 'individual' && (
            <Alert className="mt-2">
              <Info className="h-4 w-4" />
              <AlertDescription>{selectedMode.description}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
