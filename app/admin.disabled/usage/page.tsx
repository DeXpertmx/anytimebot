
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
import { AlertTriangle, Download } from 'lucide-react';

interface UsageData {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  aiInteractions: number;
  videoMinutes: number;
  whatsappMessages: number;
  estimatedCost: number;
  isAbnormal: boolean;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/usage');
      if (response.ok) {
        const data = await response.json();
        setUsage(data.usage);
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const exportToCSV = () => {
    const headers = ['Email', 'Name', 'Plan', 'AI Interactions', 'Video Minutes', 'WhatsApp Messages', 'Estimated Cost'];
    const rows = usage.map((u) => [
      u.email,
      u.name || '',
      u.plan,
      u.aiInteractions,
      u.videoMinutes,
      u.whatsappMessages,
      u.estimatedCost,
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usage & Cost Monitoring</h1>
          <p className="text-muted-foreground">Track user consumption and estimated costs</p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Usage ({usage.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : usage.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No usage data found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">AI Calls</TableHead>
                    <TableHead className="text-right">Video (min)</TableHead>
                    <TableHead className="text-right">WhatsApp</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.map((u) => (
                    <TableRow key={u.id} className={u.isAbnormal ? 'bg-orange-50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{u.email}</p>
                          {u.name && (
                            <p className="text-sm text-muted-foreground">{u.name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          u.plan === 'FREE' ? 'bg-gray-100 text-gray-800' :
                          u.plan === 'PRO' ? 'bg-blue-100 text-blue-800' :
                          u.plan === 'TEAM' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-orange-800'
                        }>
                          {u.plan}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {u.aiInteractions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {u.videoMinutes.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {u.whatsappMessages.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        ${u.estimatedCost.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {u.isAbnormal && (
                          <AlertTriangle className="h-5 w-5 text-orange-500 mx-auto" />
                        )}
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
