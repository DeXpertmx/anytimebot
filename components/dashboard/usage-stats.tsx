
'use client';

import { useEffect, useState } from 'react';
import { Bot, Video, MessageCircle, Send, AlertTriangle, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface UsageStat {
  used: number;
  limit: number;
  percentage: number;
}

interface UsageData {
  aiInteractions: UsageStat;
  videoMinutes: UsageStat;
  whatsappMessages: UsageStat;
  telegramMessages: UsageStat;
}

export function UsageStats() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/usage/stats');
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const hasWarning = Object.values(usage).some(stat => stat.percentage >= 80 && stat.limit > 0);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Usage This Month</h3>
          {hasWarning && (
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-orange-700 bg-orange-100 rounded-full hover:bg-orange-200"
            >
              <AlertTriangle className="w-3 h-3" />
              Approaching Limit
            </Link>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {usage.aiInteractions.limit > 0 && (
          <UsageBar
            icon={<Bot className="w-5 h-5 text-purple-600" />}
            label="AI Interactions"
            used={usage.aiInteractions.used}
            limit={usage.aiInteractions.limit}
            percentage={usage.aiInteractions.percentage}
          />
        )}

        {usage.videoMinutes.limit > 0 && (
          <UsageBar
            icon={<Video className="w-5 h-5 text-blue-600" />}
            label="Video Minutes"
            used={usage.videoMinutes.used}
            limit={usage.videoMinutes.limit}
            percentage={usage.videoMinutes.percentage}
          />
        )}

        {usage.whatsappMessages.limit > 0 && (
          <UsageBar
            icon={<MessageCircle className="w-5 h-5 text-green-600" />}
            label="WhatsApp Messages"
            used={usage.whatsappMessages.used}
            limit={usage.whatsappMessages.limit}
            percentage={usage.whatsappMessages.percentage}
          />
        )}

        {usage.telegramMessages.limit > 0 && (
          <UsageBar
            icon={<Send className="w-5 h-5 text-blue-500" />}
            label="Telegram Messages"
            used={usage.telegramMessages.used}
            limit={usage.telegramMessages.limit}
            percentage={usage.telegramMessages.percentage}
          />
        )}

        {hasWarning && (
          <Link
            href="/pricing"
            className="block w-full py-3 px-4 text-center text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Upgrade Plan for More
          </Link>
        )}
      </div>
    </div>
  );
}

function UsageBar({
  icon,
  label,
  used,
  limit,
  percentage,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
  percentage: number;
}) {
  const getColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 80) return 'bg-orange-500';
    return 'bg-indigo-500';
  };

  const formatLimit = (num: number) => {
    if (num === -1) return '∞';
    return num.toLocaleString();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <span className="text-sm text-gray-600">
          {used.toLocaleString()} / {formatLimit(limit)}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`${getColor()} h-2.5 rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
      {percentage >= 80 && limit > 0 && (
        <p className="text-xs text-orange-600">
          {percentage >= 100 ? 'Limit reached' : `${percentage}% used - consider upgrading`}
        </p>
      )}
    </div>
  );
}
