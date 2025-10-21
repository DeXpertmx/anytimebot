
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { User, Globe, Bell, Lock } from 'lucide-react';

interface User {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  image: string | null;
  timezone: string;
}

interface SettingsFormProps {
  user: User;
}

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function SettingsForm({ user }: SettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name || '',
    username: user.username || '',
    email: user.email,
    timezone: user.timezone,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate username format
      if (formData.username) {
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(formData.username)) {
          toast({
            title: 'Invalid Username',
            description: 'Username can only contain letters, numbers, hyphens, and underscores.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
      }

      const response = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast({
          title: 'Settings Updated',
          description: 'Your settings have been saved successfully.',
        });
        router.refresh();
      } else {
        const error = await response.json();
        toast({
          title: 'Update Failed',
          description: error.error || 'Failed to update settings',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while updating your settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <User className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="John Doe"
            />
          </div>

          <div>
            <Label htmlFor="username">
              Username <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                placeholder="johndoe"
                required
              />
              <div className="mt-1 text-sm text-gray-500">
                Your booking page will be: meetmind.abacusai.app/
                {formData.username || 'username'}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              disabled
              className="bg-gray-50 cursor-not-allowed"
            />
            <p className="mt-1 text-sm text-gray-500">
              Email cannot be changed
            </p>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? 'Saving...' : 'Save Profile'}
          </Button>
        </form>
      </Card>

      {/* Timezone Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Globe className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">
            Regional Settings
          </h2>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setIsLoading(true);

            try {
              const response = await fetch('/api/user/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: formData.timezone }),
              });

              if (response.ok) {
                toast({
                  title: 'Timezone Updated',
                  description: 'Your timezone has been updated successfully.',
                });
                router.refresh();
              }
            } catch (error) {
              toast({
                title: 'Error',
                description: 'Failed to update timezone',
                variant: 'destructive',
              });
            } finally {
              setIsLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={formData.timezone}
              onValueChange={(value) =>
                setFormData({ ...formData, timezone: value })
              }
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-sm text-gray-500">
              This timezone will be used for all your bookings
            </p>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? 'Saving...' : 'Save Timezone'}
          </Button>
        </form>
      </Card>

      {/* Notification Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Bell className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Email Notifications</p>
              <p className="text-sm text-gray-600">
                Receive booking confirmations and updates via email
              </p>
            </div>
            <div className="text-sm text-indigo-600 font-medium">Enabled</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Booking Reminders</p>
              <p className="text-sm text-gray-600">
                Send reminders 24 hours before scheduled meetings
              </p>
            </div>
            <div className="text-sm text-indigo-600 font-medium">Enabled</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Cancellation Alerts</p>
              <p className="text-sm text-gray-600">
                Get notified when a booking is cancelled
              </p>
            </div>
            <div className="text-sm text-indigo-600 font-medium">Enabled</div>
          </div>
        </div>
      </Card>

      {/* Security Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Lock className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Security</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-medium text-gray-900 mb-2">Password</p>
            <p className="text-sm text-gray-600 mb-4">
              {user.image ? (
                'You are signed in with Google OAuth. Password management is handled by Google.'
              ) : (
                'Change your password to keep your account secure.'
              )}
            </p>
            {!user.image && (
              <Button variant="outline">Change Password</Button>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="font-medium text-gray-900 mb-2">Connected Accounts</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-white border rounded-lg flex items-center justify-center mr-3">
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Google</p>
                  <p className="text-sm text-gray-600">
                    {user.image ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
              {user.image ? (
                <div className="text-sm text-green-600 font-medium">
                  Connected
                </div>
              ) : (
                <Button variant="outline" size="sm">
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="p-6 border-red-200">
        <div className="flex items-center mb-6">
          <div className="w-5 h-5 text-red-600 mr-2">⚠️</div>
          <h2 className="text-xl font-semibold text-red-600">Danger Zone</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-medium text-gray-900 mb-2">Delete Account</p>
            <p className="text-sm text-gray-600 mb-4">
              Once you delete your account, there is no going back. Please be
              certain.
            </p>
            <Button variant="destructive">Delete Account</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
