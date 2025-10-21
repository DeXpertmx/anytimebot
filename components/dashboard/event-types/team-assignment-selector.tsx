
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
      description: 'Assigned to you (standard behavior)',
    },
    {
      value: 'collective',
      label: 'Collective',
      description: 'All team members attend - system finds slots available for everyone',
    },
    {
      value: 'round_robin',
      label: 'Round Robin',
      description: 'Rotates assignments fairly among team members',
    },
    {
      value: 'smart',
      label: 'Smart Assignment',
      description: 'AI assigns based on availability, workload, and skills matching',
    },
  ];

  const selectedMode = assignmentModes.find((m) => m.value === assignmentMode);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="team">Team (Optional)</Label>
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
            <SelectValue placeholder={loading ? 'Loading teams...' : 'Select a team'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Team (Individual)</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name} ({team.members.length} members)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground mt-1">
          Assign this event type to a team for collaborative scheduling
        </p>
      </div>

      {teamId && (
        <div>
          <Label htmlFor="assignmentMode">Assignment Mode</Label>
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
