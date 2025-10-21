
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { MessageSquare, Send, Clock, Users } from 'lucide-react';

interface BotAnalyticsData {
  overview: {
    totalConversations: number;
    totalMessages: number;
    avgMessagesPerConversation: number;
    activeConversations: number;
    avgResponseTime: string;
  };
  timeline: Array<{
    date: string;
    conversations: number;
    messages: number;
  }>;
  hourlyActivity: Array<{
    hour: string;
    messages: number;
  }>;
}

export function BotAnalytics() {
  const [data, setData] = useState<BotAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/analytics/bot?range=30');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching bot analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-96 bg-gray-200 rounded animate-pulse"></div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Bot Performance</h2>
        
        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <MessageSquare className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.totalConversations || 0}
              </p>
              <p className="text-sm text-gray-600">Total Conversations</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Send className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.totalMessages || 0}
              </p>
              <p className="text-sm text-gray-600">Total Messages</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.activeConversations || 0}
              </p>
              <p className="text-sm text-gray-600">Active (7 days)</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.avgMessagesPerConversation || 0}
              </p>
              <p className="text-sm text-gray-600">Avg Msg/Conv</p>
            </div>
          </div>
        </div>

        {/* Timeline Chart */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversation Activity</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data?.timeline || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="conversations" stroke="#8b5cf6" name="Conversations" />
              <Line type="monotone" dataKey="messages" stroke="#6366f1" name="Messages" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Activity */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity by Hour</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data?.hourlyActivity || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="messages" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
