
'use client';

import { useState, useEffect } from 'react';
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
import { MessageSquare, CheckCircle, XCircle } from 'lucide-react';

interface ChannelUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  whatsappEnabled: boolean;
  whatsappPhone: string | null;
  evolutionInstanceName: string | null;
}

export default function ChannelsPage() {
  const [users, setUsers] = useState<ChannelUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = async () => {
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
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Channel Management</h1>
        <p className="text-muted-foreground">Monitor WhatsApp, Telegram, and other integrations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              WhatsApp Integrations
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
              No channel integrations found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Instance</TableHead>
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
                            <span className="text-sm">Enabled</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-gray-400">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm">Disabled</span>
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
    </div>
  );
}
