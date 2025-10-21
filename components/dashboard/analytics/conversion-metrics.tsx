
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
import { TrendingUp, Target, XCircle, Award } from 'lucide-react';

interface ConversionData {
  overview: {
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    conversionRate: number;
    cancellationRate: number;
  };
  byEventType: Array<{
    name: string;
    total: number;
    confirmed: number;
    rate: number;
    color: string;
  }>;
  timeline: Array<{
    date: string;
    total: number;
    confirmed: number;
    rate: number;
  }>;
  topPages: Array<{
    title: string;
    slug: string;
    total: number;
    confirmed: number;
    rate: number;
  }>;
}

export function ConversionMetrics() {
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/analytics/conversion?range=30');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching conversion analytics:', error);
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
        <h2 className="text-xl font-bold text-gray-900 mb-6">Conversion Metrics</h2>
        
        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.conversionRate || 0}%
              </p>
              <p className="text-sm text-gray-600">Conversion Rate</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.confirmedBookings || 0}
              </p>
              <p className="text-sm text-gray-600">Confirmed Bookings</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.cancellationRate || 0}%
              </p>
              <p className="text-sm text-gray-600">Cancellation Rate</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Award className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.overview.totalBookings || 0}
              </p>
              <p className="text-sm text-gray-600">Total Bookings</p>
            </div>
          </div>
        </div>

        {/* Conversion Timeline */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Rate Over Time</h3>
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
              <Line type="monotone" dataKey="rate" stroke="#10b981" name="Conversion Rate %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Conversion by Event Type */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">By Event Type</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data?.byEventType || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="rate" fill="#10b981" name="Conversion %" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Performing Pages */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Booking Pages</h3>
            <div className="space-y-3">
              {data?.topPages?.map((page, index) => (
                <div key={page.slug} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{page.title}</p>
                      <p className="text-xs text-gray-500">/{page.slug}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">{page.rate}%</p>
                    <p className="text-xs text-gray-500">{page.confirmed}/{page.total}</p>
                  </div>
                </div>
              ))}
              {(!data?.topPages || data.topPages.length === 0) && (
                <p className="text-center text-gray-500 py-8">No data available</p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
