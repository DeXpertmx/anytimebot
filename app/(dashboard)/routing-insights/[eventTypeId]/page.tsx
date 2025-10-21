
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, TrendingUp, Users, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

interface RoutingInsights {
  totalResponses: number;
  questions: Array<{
    id: string;
    text: string;
    type: string;
    responseCounts: Record<string, number>;
  }>;
  assignmentAccuracy: Array<{
    answer: string;
    totalResponses: number;
    topAssignedMember: { name: string; email: string } | null;
    assignmentCount: number;
    accuracy: number;
  }>;
}

export default function RoutingInsightsPage() {
  const params = useParams();
  const router = useRouter();
  const eventTypeId = params?.eventTypeId as string;

  const [insights, setInsights] = useState<RoutingInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (eventTypeId) {
      fetchInsights();
    }
  }, [eventTypeId]);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/routing/insights?eventTypeId=${eventTypeId}`);
      const data = await res.json();

      if (data.success) {
        setInsights(data.data);
      } else {
        toast.error(data.error || 'Failed to fetch insights');
      }
    } catch (error) {
      console.error('Error fetching routing insights:', error);
      toast.error('Failed to fetch routing insights');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await fetch(`/api/routing/export?eventTypeId=${eventTypeId}`);
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `routing-responses-${eventTypeId}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Responses exported successfully');
      } else {
        toast.error('Failed to export responses');
      }
    } catch (error) {
      console.error('Error exporting responses:', error);
      toast.error('Failed to export responses');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="container max-w-6xl py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading insights...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="container max-w-6xl py-8">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No routing insights available</p>
          <Button onClick={() => router.back()} variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => router.back()} variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Routing Insights</h1>
            <p className="text-muted-foreground mt-1">
              Analytics and performance metrics for your routing forms
            </p>
          </div>
        </div>

        <Button onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Responses</p>
              <p className="text-2xl font-bold">{insights.totalResponses}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Questions</p>
              <p className="text-2xl font-bold">{insights.questions.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg. Accuracy</p>
              <p className="text-2xl font-bold">
                {insights.assignmentAccuracy.length > 0
                  ? Math.round(
                      insights.assignmentAccuracy.reduce((sum, item) => sum + item.accuracy, 0) /
                        insights.assignmentAccuracy.length
                    )
                  : 0}
                %
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Question Response Breakdown */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Question Responses</h2>
        <div className="space-y-6">
          {insights.questions.map((question) => (
            <div key={question.id} className="space-y-3">
              <div>
                <p className="font-medium">{question.text}</p>
                <p className="text-sm text-muted-foreground capitalize">{question.type}</p>
              </div>

              {Object.entries(question.responseCounts).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(question.responseCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([answer, count]) => {
                      const percentage =
                        insights.totalResponses > 0
                          ? Math.round((count / insights.totalResponses) * 100)
                          : 0;
                      return (
                        <div key={answer} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate max-w-md">{answer}</span>
                            <span className="text-muted-foreground">
                              {count} ({percentage}%)
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No responses yet</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Assignment Accuracy */}
      {insights.assignmentAccuracy.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Assignment Accuracy</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Shows which team members are most frequently assigned for each response
          </p>

          <div className="space-y-4">
            {insights.assignmentAccuracy
              .sort((a, b) => b.totalResponses - a.totalResponses)
              .map((item, index) => (
                <div key={index} className="border-l-4 border-primary/50 pl-4 py-2">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">"{item.answer}"</p>
                      <p className="text-sm text-muted-foreground">
                        {item.totalResponses} total responses
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-primary">{item.accuracy}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">accuracy</p>
                    </div>
                  </div>

                  {item.topAssignedMember && (
                    <div className="flex items-center gap-2 mt-2 text-sm">
                      <span className="text-muted-foreground">Most assigned to:</span>
                      <span className="font-medium">
                        {item.topAssignedMember.name || item.topAssignedMember.email}
                      </span>
                      <span className="text-muted-foreground">
                        ({item.assignmentCount}/{item.totalResponses})
                      </span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
