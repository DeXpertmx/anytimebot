
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Ban, 
  CheckCircle, 
  RefreshCw, 
  CreditCard,
  MessageSquare,
  Video,
  Calendar,
  Users as UsersIcon,
  Save
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  isActive: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  whatsappEnabled: boolean;
  evolutionInstanceName: string | null;
  quotas: any;
  usage: any;
  _count: {
    bookings: number;
    bookingPages: number;
    ownedTeams: number;
  };
  subscriptions: any[];
  adminNotes: any[];
}

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const userId = params.id;
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setUser(data);
        setSelectedPlan(data.plan);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      toast.error('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const handleChangePlan = async () => {
    if (!selectedPlan || selectedPlan === user?.plan) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      
      if (response.ok) {
        toast.success('Plan updated successfully');
        fetchUser();
      } else {
        toast.error('Failed to update plan');
      }
    } catch (error) {
      toast.error('Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async () => {
    if (!confirm('Are you sure you want to suspend this user?')) return;
    
    const reason = prompt('Suspension reason:');
    if (!reason) return;
    
    try {
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      
      if (response.ok) {
        toast.success('User suspended');
        fetchUser();
      } else {
        toast.error('Failed to suspend user');
      }
    } catch (error) {
      toast.error('Failed to suspend user');
    }
  };

  const handleReactivate = async () => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/reactivate`, {
        method: 'POST',
      });
      
      if (response.ok) {
        toast.success('User reactivated');
        fetchUser();
      } else {
        toast.error('Failed to reactivate user');
      }
    } catch (error) {
      toast.error('Failed to reactivate user');
    }
  };

  const handleResetUsage = async () => {
    if (!confirm('Are you sure you want to reset this user\'s usage counters?')) return;
    
    try {
      const response = await fetch(`/api/admin/users/${userId}/reset-usage`, {
        method: 'POST',
      });
      
      if (response.ok) {
        toast.success('Usage reset successfully');
        fetchUser();
      } else {
        toast.error('Failed to reset usage');
      }
    } catch (error) {
      toast.error('Failed to reset usage');
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    try {
      const response = await fetch(`/api/admin/users/${userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote }),
      });
      
      if (response.ok) {
        toast.success('Note added');
        setNewNote('');
        fetchUser();
      } else {
        toast.error('Failed to add note');
      }
    } catch (error) {
      toast.error('Failed to add note');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">User not found</p>
        <Button onClick={() => router.push('/admin/users')} className="mt-4">
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/users">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{user.email}</h1>
          <p className="text-muted-foreground">{user.name || 'No name set'}</p>
        </div>
        {user.isActive ? (
          <Button variant="destructive" onClick={handleSuspend}>
            <Ban className="h-4 w-4 mr-2" />
            Suspend
          </Button>
        ) : (
          <Button variant="default" onClick={handleReactivate}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Reactivate
          </Button>
        )}
      </div>

      {/* Suspension Warning */}
      {!user.isActive && user.suspendedAt && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-800">
              <strong>Suspended:</strong> {format(new Date(user.suspendedAt), 'MMM dd, yyyy HH:mm')}
            </p>
            {user.suspendedReason && (
              <p className="text-sm text-red-700 mt-1">
                <strong>Reason:</strong> {user.suspendedReason}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Bookings</span>
            </div>
            <p className="text-2xl font-bold">{user._count.bookings}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm">Booking Pages</span>
            </div>
            <p className="text-2xl font-bold">{user._count.bookingPages}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <UsersIcon className="h-4 w-4" />
              <span className="text-sm">Teams</span>
            </div>
            <p className="text-2xl font-bold">{user._count.ownedTeams}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Video className="h-4 w-4" />
              <span className="text-sm">Video Minutes</span>
            </div>
            <p className="text-2xl font-bold">{user.usage?.videoMinutes || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Plan Management */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Current Plan</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="TEAM">Team</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleChangePlan} 
              disabled={saving || selectedPlan === user.plan}
              className="mt-6"
            >
              {saving ? 'Saving...' : 'Update Plan'}
            </Button>
          </div>
          
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Quotas & Usage</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">AI Interactions</p>
                <p className="font-semibold">
                  {user.usage?.aiInteractions || 0} / {user.quotas?.aiInteractions || 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Video Minutes</p>
                <p className="font-semibold">
                  {user.usage?.videoMinutes || 0} / {user.quotas?.videoMinutes || 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">WhatsApp Messages</p>
                <p className="font-semibold">
                  {user.usage?.whatsappMessages || 0} / {user.quotas?.whatsappMessages || 0}
                </p>
              </div>
            </div>
          </div>
          
          <Button variant="outline" onClick={handleResetUsage}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Usage Counters
          </Button>
        </CardContent>
      </Card>

      {/* Channel Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium">WhatsApp (Evolution API)</span>
              <Badge variant={user.whatsappEnabled ? 'default' : 'secondary'}>
                {user.whatsappEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {user.whatsappEnabled && user.evolutionInstanceName && (
              <p className="text-xs text-muted-foreground pl-3">
                Instance: {user.evolutionInstanceName}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Admin Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Internal Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Textarea
              placeholder="Add a support note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
            />
            <Button onClick={handleAddNote} className="mt-2" disabled={!newNote.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </div>
          
          {user.adminNotes && user.adminNotes.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              {user.adminNotes.map((note: any) => (
                <div key={note.id} className="p-3 bg-gray-50 rounded text-sm">
                  <p className="font-medium text-xs text-muted-foreground mb-1">
                    {note.adminEmail} - {format(new Date(note.createdAt), 'MMM dd, yyyy HH:mm')}
                  </p>
                  <p>{note.note}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
