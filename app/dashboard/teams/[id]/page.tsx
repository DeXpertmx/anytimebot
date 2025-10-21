
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
      router.push('/login');
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
        toast.error(data.error || 'Failed to fetch team');
        router.push('/dashboard/teams');
      }
    } catch (error) {
      console.error('Error fetching team:', error);
      toast.error('Failed to fetch team');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!memberForm.email) {
      toast.error('Email is required');
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
        toast.success('Member added successfully');
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
        toast.error(data.error || 'Failed to add member');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Member removed successfully');
        fetchTeam();
      } else {
        toast.error(data.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
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
    <div className="container mx-auto py-8 px-4">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => router.push('/dashboard/teams')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Teams
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
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Add a new member to this team. They can be existing users or external members.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
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
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={memberForm.timezone}
                  onValueChange={(value) => setMemberForm({ ...memberForm, timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="Europe/London">London</SelectItem>
                    <SelectItem value="Europe/Paris">Paris</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="skills">Skills (comma-separated)</Label>
                <Input
                  id="skills"
                  value={memberForm.skills}
                  onChange={(e) => setMemberForm({ ...memberForm, skills: e.target.value })}
                  placeholder="e.g., billing, support, technical"
                />
              </div>
              <div>
                <Label htmlFor="languages">Languages (comma-separated)</Label>
                <Input
                  id="languages"
                  value={memberForm.languages}
                  onChange={(e) => setMemberForm({ ...memberForm, languages: e.target.value })}
                  placeholder="e.g., english, spanish, german"
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select
                  value={memberForm.role}
                  onValueChange={(value) => setMemberForm({ ...memberForm, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddMemberDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Member</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Team Members ({team.members.length})</CardTitle>
            <CardDescription>Manage your team members and their settings</CardDescription>
          </CardHeader>
          <CardContent>
            {team.members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No members yet. Add your first team member to get started.
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
                            Calendar
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <X className="h-3 w-3 mr-1" />
                            No Calendar
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
            <CardTitle>Event Types ({team.eventTypes.length})</CardTitle>
            <CardDescription>Event types using this team</CardDescription>
          </CardHeader>
          <CardContent>
            {team.eventTypes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No event types using this team yet.
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
