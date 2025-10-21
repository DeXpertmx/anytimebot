
/**
 * Briefing Card Component
 * Displays a meeting briefing with talking points
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, Mail, MessageSquare, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface BriefingCardProps {
  briefing?: {
    id: string;
    hostBriefing: string;
    guestBriefing: string;
    talkingPoints: string[];
    emailSent: boolean;
    whatsappSent: boolean;
    sentAt: string | null;
    createdAt: string;
  } | null;
  bookingId: string;
  viewAs?: 'host' | 'guest';
}

export function BriefingCard({ briefing, bookingId, viewAs = 'host' }: BriefingCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentBriefing, setCurrentBriefing] = useState(briefing);

  const handleGenerateBriefing = async () => {
    try {
      setIsGenerating(true);
      const response = await fetch('/api/briefings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate briefing');
      }

      const data = await response.json();
      setCurrentBriefing(data.briefing);
      toast.success('Briefing generated and sent successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate briefing');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!currentBriefing) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-purple-500" />
            Pre-Meeting Intelligence
          </CardTitle>
          <CardDescription>
            Generate an AI-powered briefing for this meeting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-4">
              Get personalized insights, context, and talking points powered by AI
            </p>
            <Button
              onClick={handleGenerateBriefing}
              disabled={isGenerating}
              className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin mr-2">⚙️</span>
                  Generating...
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Generate Briefing
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const briefingText = viewAs === 'host' ? currentBriefing.hostBriefing : currentBriefing.guestBriefing;
  const talkingPoints = currentBriefing.talkingPoints;

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-purple-500" />
            <CardTitle>Pre-Meeting Intelligence</CardTitle>
          </div>
          <div className="flex gap-2">
            {currentBriefing.emailSent ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Mail className="h-3 w-3 mr-1" />
                Email Sent
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-gray-50 text-gray-500">
                <XCircle className="h-3 w-3 mr-1" />
                Email Failed
              </Badge>
            )}
            {currentBriefing.whatsappSent && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <MessageSquare className="h-3 w-3 mr-1" />
                WhatsApp Sent
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          AI-powered briefing generated on{' '}
          {new Date(currentBriefing.createdAt).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Briefing Text */}
        <div className="bg-white p-4 rounded-lg border border-purple-100">
          <h4 className="font-semibold text-sm mb-2 text-purple-700">
            {viewAs === 'host' ? '📋 Your Briefing' : '👋 Welcome Message'}
          </h4>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {briefingText}
          </div>
        </div>

        {/* Talking Points */}
        {viewAs === 'host' && talkingPoints && talkingPoints.length > 0 && (
          <div className="bg-white p-4 rounded-lg border border-indigo-100">
            <h4 className="font-semibold text-sm mb-3 text-indigo-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Suggested Talking Points
            </h4>
            <ul className="space-y-2">
              {talkingPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-indigo-500 font-semibold min-w-[20px]">
                    {index + 1}.
                  </span>
                  <span className="text-gray-700">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            💡 <strong>AI-Generated:</strong> This briefing was created using GPT-4o based on
            conversation history, form responses, and uploaded documents. Review before your meeting.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
