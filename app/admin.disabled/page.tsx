
import { requireAdmin, calculateMRR, getHeavyUsers, estimateCosts } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Users, TrendingDown, TrendingUp, Activity, AlertTriangle, CreditCard } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getDashboardData() {
  await requireAdmin();
  
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  
  // MRR
  const mrr = await calculateMRR();
  
  // Total users
  const totalUsers = await prisma.user.count();
  
  // New signups this month
  const newSignups = await prisma.user.count({
    where: {
      createdAt: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
      },
    },
  });
  
  // Churned users (cancelled subscriptions this month)
  const churnedUsers = await prisma.subscription.count({
    where: {
      status: 'CANCELLED',
      updatedAt: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
      },
    },
  });
  
  // Total usage and costs
  const allUsage = await prisma.usage.findMany();
  const totalUsage = allUsage.reduce(
    (acc, usage) => ({
      aiInteractions: acc.aiInteractions + usage.aiInteractions,
      videoMinutes: acc.videoMinutes + usage.videoMinutes,
      whatsappMessages: acc.whatsappMessages + usage.whatsappMessages,
    }),
    { aiInteractions: 0, videoMinutes: 0, whatsappMessages: 0 }
  );
  
  const costs = estimateCosts({
    aiInteractions: totalUsage.aiInteractions,
    videoMinutes: totalUsage.videoMinutes,
  });
  
  // Gross margin
  const grossMargin = mrr - costs.total;
  const marginPercentage = mrr > 0 ? ((grossMargin / mrr) * 100).toFixed(1) : '0.0';
  
  // Heavy users
  const heavyUsers = await getHeavyUsers(5);
  
  // Abnormal usage alerts
  const abnormalUsers = await prisma.user.count({
    where: {
      OR: [
        { usage: { aiInteractions: { gte: 1000 } } },
        { usage: { videoMinutes: { gte: 500 } } },
      ],
    },
  });
  
  return {
    mrr,
    totalUsers,
    newSignups,
    churnedUsers,
    costs,
    grossMargin,
    marginPercentage,
    heavyUsers,
    abnormalUsers,
  };
}

export default async function AdminDashboard() {
  const data = await getDashboardData();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of Anytimebot operations and metrics</p>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monthly Recurring Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.mrr.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.marginPercentage}% gross margin
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalUsers}</div>
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              +{data.newSignups} this month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Churn Rate
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.churnedUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Cancellations this month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estimated Costs
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.costs.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              AI: ${data.costs.aiCost} | Video: ${data.costs.videoCost}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Abnormal Usage Alert */}
      {data.abnormalUsers > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <AlertTriangle className="h-5 w-5" />
              Abnormal Usage Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-800">
              {data.abnormalUsers} user{data.abnormalUsers !== 1 ? 's' : ''} with unusually high usage detected.{' '}
              <Link href="/admin/usage" className="font-semibold underline">
                View details
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Heavy Users */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Heavy Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.heavyUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{user.email}</p>
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {user.plan}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    AI: {user.aiInteractions} | Video: {user.videoMinutes}m | WhatsApp: {user.whatsappMessages}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">${user.estimatedCost}</p>
                  <p className="text-xs text-muted-foreground">est. cost</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/users">
          <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <Users className="h-8 w-8 text-primary mb-2" />
              <h3 className="font-semibold">Manage Users</h3>
              <p className="text-sm text-muted-foreground">View and manage user accounts</p>
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/admin/subscriptions">
          <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <CreditCard className="h-8 w-8 text-primary mb-2" />
              <h3 className="font-semibold">Subscriptions</h3>
              <p className="text-sm text-muted-foreground">Handle billing and payments</p>
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/admin/support">
          <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <Activity className="h-8 w-8 text-primary mb-2" />
              <h3 className="font-semibold">Support Tools</h3>
              <p className="text-sm text-muted-foreground">Search and help users</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
