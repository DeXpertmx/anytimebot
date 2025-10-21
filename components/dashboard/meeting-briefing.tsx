
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, MessageCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface MeetingBriefingProps {
  bookingId: string;
}

export function MeetingBriefing({ bookingId }: MeetingBriefingProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [briefing, setBriefing] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBriefing();
  }, [bookingId]);

  const loadBriefing = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/briefings/${bookingId}`);
      
      if (response.status === 404) {
        setError('No briefing generated yet');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to load briefing');
      }

      const data = await response.json();
      if (data.success) {
        setBriefing(data.data);
      }
    } catch (err) {
      console.error('Error loading briefing:', err);
      setError(err instanceof Error ? err.message : 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  };

  const generateBriefing = async () => {
    try {
      setGenerating(true);
      const response = await fetch('/api/briefings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate briefing');
      }

      toast.success('Briefing generated successfully!');
      await loadBriefing();
    } catch (err) {
      console.error('Error generating briefing:', err);
      toast.error('Failed to generate briefing');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error && !briefing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            Pre-Meeting Intelligence Brief
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={generateBriefing} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>Generate Briefing</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) return null;

  return (
    <div className="space-y-6">
      {/* Briefing Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              Pre-Meeting Intelligence Brief
            </span>
            <div className="flex items-center gap-2">
              {briefing.emailSent ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Email Sent
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Email Pending
                </Badge>
              )}
              {briefing.whatsappSent ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  WhatsApp Sent
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  WhatsApp Pending
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Generated: {new Date(briefing.createdAt).toLocaleString()}
            </span>
            {briefing.sentAt && (
              <span>
                Sent: {new Date(briefing.sentAt).toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Host Briefing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            Your Briefing (Host)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: briefing.hostBriefing }}
          />
          
          {briefing.talkingPoints && Array.isArray(briefing.talkingPoints) && briefing.talkingPoints.length > 0 && (
            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/10">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <span>💡</span>
                Key Talking Points
              </h4>
              <ul className="space-y-2">
                {briefing.talkingPoints.map((point: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guest Briefing Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">👋</span>
            Guest Briefing (Preview)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: briefing.guestBriefing }}
          />
        </CardContent>
      </Card>

      {/* Context Information */}
      {briefing.context && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              Intelligence Context
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  {briefing.context.hasDocuments ? '✓' : '✗'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Knowledge Base
                </div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  {briefing.context.hasChatHistory ? '✓' : '✗'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Chat History
                </div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  {briefing.context.isReturning ? 'Yes' : 'No'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Returning Guest
                </div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  {briefing.context.teamSize || 1}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Team Members
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              onClick={loadBriefing}
              disabled={loading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={generateBriefing}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate Briefing
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

