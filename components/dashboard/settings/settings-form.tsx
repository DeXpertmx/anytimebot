
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
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
import { User, Globe, Bell, Lock, X, Download } from 'lucide-react';
import { PhoneCountryInput, getDialCode } from '@/components/ui/phone-country-input';

interface User {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  image: string | null;
  timezone: string;
  country: string;
  currency: string;
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
    country: user.country || 'ES',
    currency: user.currency || 'EUR',
    bio: (user as any).bio || '',
    company: (user as any).company || '',
    website: (user as any).website || '',
    linkedin: (user as any).linkedin || '',
    twitter: (user as any).twitter || '',
    phone: (user as any).phone || '',
    address: (user as any).address || '',
  });
  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/user/export');
      if (!response.ok) {
        throw new Error('Export failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `anytimebot-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Datos exportados', description: 'La descarga de tus datos ha comenzado.' });
    } catch (error) {
      console.error('Error exporting data:', error);
      toast({ title: 'Error', description: 'No se pudieron exportar tus datos.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm.toLowerCase() !== 'delete') {
      toast({ title: 'Escribe DELETE para confirmar', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        toast({ title: 'Cuenta eliminada', description: 'Todos tus datos fueron borrados permanentemente.' });
        await signOut({ redirect: false });
        router.push('/');
      } else {
        const err = await res.json();
        toast({ title: 'Error', description: err.error || 'No se pudo eliminar la cuenta', variant: 'destructive' });
        setIsDeleting(false);
      }
    } catch (e) {
      console.error('Error deleting account:', e);
      toast({ title: 'Error', description: 'Ocurrió un error al eliminar la cuenta', variant: 'destructive' });
      setIsDeleting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {        toast({ title: 'Las contraseñas no coinciden', variant: 'destructive' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast({
        title: 'Contraseña demasiado corta',
        description: 'La nueva contraseña debe tener al menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (response.ok) {
        toast({ title: 'Contraseña actualizada', description: 'Tu contraseña se ha actualizado correctamente.' });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShowPasswordModal(false);
      } else {
        const error = await response.json();
        toast({ title: 'No se pudo cambiar la contraseña', description: error.error || 'No se pudo cambiar la contraseña', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error changing password:', error);
      toast({ title: 'Error', description: 'Ocurrió un error al cambiar tu contraseña', variant: 'destructive' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate username format
      if (formData.username) {
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(formData.username)) {
          toast({              title: 'Usuario no válido',
              description: 'El usuario solo puede contener letras, números, guiones y guiones bajos.',
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
          title: 'Configuración actualizada',
          description: 'Tu configuración se ha guardado correctamente.',
        });
        router.refresh();
      } else {
        const error = await response.json();
        toast({
          title: 'No se pudo actualizar',
          description: error.error || 'No se pudo actualizar la configuración',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: 'Error',
        description: 'Ocurrió un error al actualizar tu configuración',
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
          <h2 className="text-xl font-semibold text-gray-900">Perfil</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre completo</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }                placeholder="Juan Pérez"
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
                Tu página de reservas será: anytimebot.app/
                {formData.username || 'username'}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              disabled
              className="bg-gray-50 cursor-not-allowed"
            />
            <p className="mt-1 text-sm text-gray-500">
              El correo electrónico no se puede cambiar
            </p>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? 'Guardando...' : 'Guardar perfil'}
          </Button>
        </form>
      </Card>

      {/* Public Profile Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Globe className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Perfil público</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Configura el perfil público que verán tus clientes en{' '}
          <span className="font-mono text-indigo-600">anytimebot.app/{formData.username || 'username'}</span>
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setIsLoading(true);
            try {
              const response = await fetch('/api/user/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bio: formData.bio,
                  company: formData.company,
                  website: formData.website,
                  linkedin: formData.linkedin,
                  twitter: formData.twitter,
                  phone: formData.phone,
                  address: formData.address,
                }),
              });
              if (response.ok) {
                toast({ title: 'Perfil actualizado', description: 'Tu perfil público se ha actualizado correctamente.' });
                router.refresh();
              }
            } catch (error) {
              toast({ title: 'Error', description: 'Failed to update profile', variant: 'destructive' });
            } finally {
              setIsLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="bio">Biografía</Label>
            <textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Cuéntales a tus clientes sobre ti..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company">Empresa</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Nombre de tu empresa"
              />
            </div>
            <div>
              <Label htmlFor="website">Sitio web</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://tusitio.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input
                id="linkedin"
                value={formData.linkedin}
                onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                placeholder="https://linkedin.com/in/yourprofile"
              />
            </div>
            <div>
              <Label htmlFor="twitter">Twitter / X</Label>
              <Input
                id="twitter"
                value={formData.twitter}
                onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                placeholder="https://twitter.com/yourprofile"
              />
            </div>
          </div>          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <PhoneCountryInput
                id="phone"
                value={formData.phone}
                country={formData.country}
                onCountryChange={(country) => setFormData({ ...formData, country })}
                onChange={(phone) => setFormData({ ...formData, phone: `${getDialCode(formData.country)} ${phone.replace(/^\+\d+\s*/, '')}` })}
                placeholder="612 345 678"
              />
            </div>
            <div>
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Dirección de tu negocio"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? 'Guardando...' : 'Guardar perfil público'}
          </Button>
        </form>
      </Card>

      {/* Timezone Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Globe className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">
            Configuración regional
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
                body: JSON.stringify({ timezone: formData.timezone, country: formData.country, currency: formData.currency }),
              });

              if (response.ok) {
                toast({
                  title: 'Zona horaria actualizada',
                  description: 'Tu zona horaria se ha actualizado correctamente.',
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
            <Label htmlFor="country">País donde operas</Label>
            <Select value={formData.country} onValueChange={(value) => setFormData({ ...formData, country: value })}>
              <SelectTrigger id="country"><SelectValue placeholder="Selecciona un país" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ES">España (+34)</SelectItem>
                <SelectItem value="MX">México (+52)</SelectItem>
                <SelectItem value="US">Estados Unidos (+1)</SelectItem>
                <SelectItem value="CA">Canadá (+1)</SelectItem>
                <SelectItem value="GB">Reino Unido (+44)</SelectItem>
                <SelectItem value="FR">Francia (+33)</SelectItem>
                <SelectItem value="DE">Alemania (+49)</SelectItem>
                <SelectItem value="IT">Italia (+39)</SelectItem>
                <SelectItem value="PT">Portugal (+351)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="currency">Moneda de operación</Label>
            <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
              <SelectTrigger id="currency"><SelectValue placeholder="Selecciona una moneda" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="USD">USD — Dólar estadounidense</SelectItem>
                <SelectItem value="MXN">MXN — Peso mexicano</SelectItem>
                <SelectItem value="GBP">GBP — Libra esterlina</SelectItem>
                <SelectItem value="CAD">CAD — Dólar canadiense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="timezone">Zona horaria</Label>
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
              Esta zona horaria se utilizará para todas tus reservas
            </p>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? 'Guardando...' : 'Guardar zona horaria'}
          </Button>
        </form>
      </Card>

      {/* Notification Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Bell className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Notificaciones</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Notificaciones por correo</p>
              <p className="text-sm text-gray-600">
                Recibe confirmaciones y actualizaciones de tus reservas por correo
              </p>
            </div>
            <div className="text-sm text-indigo-600 font-medium">Activado</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Recordatorios de reservas</p>
              <p className="text-sm text-gray-600">
                Envía recordatorios 24 horas antes de las reuniones programadas
              </p>
            </div>
            <div className="text-sm text-indigo-600 font-medium">Activado</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Alertas de cancelación</p>
              <p className="text-sm text-gray-600">
                Recibe una notificación cuando se cancele una reserva
              </p>
            </div>
            <div className="text-sm text-indigo-600 font-medium">Activado</div>
          </div>
        </div>
      </Card>

      {/* Security Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Lock className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Seguridad</h2>
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
              <Button variant="outline" onClick={() => setShowPasswordModal(true)}>
                Cambiar contraseña
              </Button>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="font-medium text-gray-900 mb-2">Cuentas conectadas</p>
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
                    {user.image ? 'Conectada' : 'No conectada'}
                  </p>
                </div>
              </div>
              {user.image ? (
                <div className="text-sm text-green-600 font-medium">
                  Conectada
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

      {/* Privacy and data */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Download className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Privacidad y datos</h2>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Descarga una copia estructurada de los datos personales asociados a tu cuenta.
          </p>
          <Button variant="outline" onClick={handleExportData} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exportando...' : 'Exportar mis datos'}
          </Button>
        </div>
      </Card>

      {/* Danger Zone — intentionally kept as the final section of this form */}
      <Card className="order-last border-red-200 p-6">
        <div className="flex items-center mb-6">
          <div className="w-5 h-5 text-red-600 mr-2">⚠️</div>
          <h2 className="text-xl font-semibold text-red-600">Zona de peligro</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-medium text-gray-900 mb-2">Eliminar cuenta</p>
            <p className="text-sm text-gray-600 mb-4">
              Al eliminar tu cuenta no podrás deshacer esta acción. Confirma que deseas continuar.
            </p>
            <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
              Eliminar cuenta
            </Button>
          </div>
        </div>
      </Card>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-red-600">Eliminar cuenta</h3>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600">
                Esta acción es irreversible. Se eliminarán permanentemente tu cuenta, tus reservas, tu bot, tus
                conversaciones y los datos de WhatsApp. Escribe{' '}
                <span className="font-mono font-semibold">DELETE</span> para confirmar.
              </p>
              <div>
                <Label htmlFor="delete-confirm">Confirmación</Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Escribe DELETE"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirm.toLowerCase() !== 'delete'}
                >
                  {isDeleting ? 'Eliminando...' : 'Eliminar cuenta'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cambiar contraseña Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Cambiar contraseña</h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="px-6 py-4 space-y-4">
              <div>
                <Label htmlFor="current-password">Contraseña actual</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                  }
                  placeholder="Tu contraseña actual"
                  required
                />
              </div>
              <div>
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                  }
                  placeholder="Nueva contraseña (mínimo 6 caracteres)"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                  }
                  placeholder="Vuelve a escribir la nueva contraseña"
                  required
                  minLength={6}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Guardando...' : 'Actualizar contraseña'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
