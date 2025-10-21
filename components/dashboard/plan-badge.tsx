
'use client';

import { Crown, Zap, Users, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface PlanBadgeProps {
  plan: 'FREE' | 'PRO' | 'TEAM' | 'ENTERPRISE';
  showUpgrade?: boolean;
}

export function PlanBadge({ plan, showUpgrade = true }: PlanBadgeProps) {
  const config = {
    FREE: {
      icon: Sparkles,
      label: 'Free',
      color: 'bg-gray-100 text-gray-700 border-gray-300',
      iconColor: 'text-gray-500',
    },
    PRO: {
      icon: Zap,
      label: 'Pro',
      color: 'bg-indigo-100 text-indigo-700 border-indigo-300',
      iconColor: 'text-indigo-600',
    },
    TEAM: {
      icon: Users,
      label: 'Team',
      color: 'bg-purple-100 text-purple-700 border-purple-300',
      iconColor: 'text-purple-600',
    },
    ENTERPRISE: {
      icon: Crown,
      label: 'Enterprise',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      iconColor: 'text-yellow-600',
    },
  };

  const { icon: Icon, label, color, iconColor } = config[plan];

  return (
    <div className="flex items-center gap-3">
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${color} font-semibold text-sm`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {label} Plan
      </div>
      {showUpgrade && plan !== 'ENTERPRISE' && (
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-semibold text-sm transition-colors"
        >
          <Zap className="w-4 h-4" />
          Upgrade
        </Link>
      )}
    </div>
  );
}
