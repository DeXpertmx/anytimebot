
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface BookingAnalyticsData {
  timeline: Array<{
    date: string;
    total: number;
    confirmed: number;
    pending: number;
    cancelled: number;
  }>;
  byEventType: Array<{
    name: string;
    count: number;
    color: string;
  }>;
  byStatus: Array<{
    status: string;
    count: number;
  }>;
  byHour: Array<{
    hour: string;
    count: number;
  }>;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function BookingAnalytics() {
  const [data, setData] = useState<BookingAnalyticsData | null>(null);
  const [range, setRange] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [range]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/bookings?range=${range}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching booking analytics:', error);
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
      {/* Booking Timeline */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Tendencia de reservas</h2>
            <p className="text-sm text-gray-600 mt-1">
              Consulta tus reservas a lo largo del tiempo
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={range === '7' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRange('7')}
            >
              7 días
            </Button>
            <Button
              variant={range === '30' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRange('30')}
            >
              30 días
            </Button>
            <Button
              variant={range === '90' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRange('90')}
            >
              90 días
            </Button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data?.timeline || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="total" stroke="#6366f1" name="Total" />
            <Line type="monotone" dataKey="confirmed" stroke="#10b981" name="Confirmadas" />
            <Line type="monotone" dataKey="cancelled" stroke="#ef4444" name="Canceladas" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Bookings by Event Type */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Por tipo de evento</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data?.byEventType || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${(entry as typeof entry & { count?: number }).count ?? 0}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {data?.byEventType?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Horas de mayor demanda */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Horas de mayor demanda</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.byHour || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
