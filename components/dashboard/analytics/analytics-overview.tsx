
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  MessageSquare,
  Send 
} from 'lucide-react';

interface OverviewData {
  bookings: { total: number; change: number };
  confirmed: { total: number; change: number };
  cancelled: { total: number };
  conversations: { total: number; change: number };
  whatsapp: { total: number; change: number };
}

export function AnalyticsOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const fetchOverviewData = async () => {
    try {
      const response = await fetch('/api/analytics/overview');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-6">
            <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Bookings',
      value: data?.bookings.total || 0,
      change: data?.bookings.change || 0,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Confirmed',
      value: data?.confirmed.total || 0,
      change: data?.confirmed.change || 0,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Cancelled',
      value: data?.cancelled.total || 0,
      change: null,
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Bot Conversations',
      value: data?.conversations.total || 0,
      change: data?.conversations.change || 0,
      icon: MessageSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'WhatsApp Messages',
      value: data?.whatsapp.total || 0,
      change: data?.whatsapp.change || 0,
      icon: Send,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title} className="p-6">
          <div className="flex items-center justify-between">
            <div className={`p-3 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-6 w-6 ${card.color}`} />
            </div>
            {card.change !== null && card.change !== undefined && (
              <div className={`flex items-center text-sm font-medium ${
                card.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {card.change >= 0 ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 mr-1" />
                )}
                {Math.abs(card.change)}%
              </div>
            )}
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-gray-900">{card.value}</h3>
            <p className="text-sm text-gray-600 mt-1">{card.title}</p>
            {card.change !== null && card.change !== undefined && (
              <p className="text-xs text-gray-500 mt-1">vs last month</p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
