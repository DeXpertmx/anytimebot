
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

interface GlobalSettings {
  freeAiInteractions: number;
  proAiInteractions: number;
  teamAiInteractions: number;
  proVideoMinutes: number;
  teamVideoMinutes: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<GlobalSettings>({
    freeAiInteractions: 0,
    proAiInteractions: 200,
    teamAiInteractions: 500,
    proVideoMinutes: 100,
    teamVideoMinutes: 500,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      
      if (response.ok) {
        toast.success('Settings saved successfully');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Global Settings</h1>
        <p className="text-muted-foreground">Configure system-wide parameters and quotas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan Quotas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Free - AI Interactions/month</Label>
              <Input
                type="number"
                value={settings.freeAiInteractions}
                onChange={(e) => setSettings({ ...settings, freeAiInteractions: parseInt(e.target.value) })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Pro - AI Interactions/month</Label>
              <Input
                type="number"
                value={settings.proAiInteractions}
                onChange={(e) => setSettings({ ...settings, proAiInteractions: parseInt(e.target.value) })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Team - AI Interactions/month</Label>
              <Input
                type="number"
                value={settings.teamAiInteractions}
                onChange={(e) => setSettings({ ...settings, teamAiInteractions: parseInt(e.target.value) })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Pro - Video Minutes/month</Label>
              <Input
                type="number"
                value={settings.proVideoMinutes}
                onChange={(e) => setSettings({ ...settings, proVideoMinutes: parseInt(e.target.value) })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Team - Video Minutes/month</Label>
              <Input
                type="number"
                value={settings.teamVideoMinutes}
                onChange={(e) => setSettings({ ...settings, teamVideoMinutes: parseInt(e.target.value) })}
              />
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Environment</span>
              <span className="font-medium">Production</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Database</span>
              <span className="font-medium">PostgreSQL</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">1.0.0</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
