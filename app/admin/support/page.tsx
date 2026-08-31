
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import Link from 'next/link';

interface SearchResult {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  bookingsCount: number;
}

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/support/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Support Tools</h1>
        <p className="text-muted-foreground">Search users and debug issues</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email, booking ID, or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </form>

          {results.length > 0 && (
            <div className="mt-6 space-y-3">
              {results.map((result) => (
                <Link key={result.id} href={`/admin/users/${result.id}`}>
                  <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{result.email}</p>
                        {result.name && (
                          <p className="text-sm text-muted-foreground">{result.name}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded">
                          {result.plan}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {result.bookingsCount} bookings
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/admin/users">
              <Button variant="outline" className="w-full">
                View All Users
              </Button>
            </Link>
            <Link href="/admin/usage">
              <Button variant="outline" className="w-full">
                Check Usage Anomalies
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
