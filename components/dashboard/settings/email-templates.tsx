'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, Edit2, Save, X, Plus, Trash2, Eye } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface EmailTemplate {
  id: string;
  type: string;
  name: string;
  subject: string;
  htmlBody: string;
  isActive: boolean;
}

const templateTypes = [
  { value: 'confirmation', label: 'Confirmación de Reserva', description: 'Email enviado al confirmar una reserva' },
  { value: 'reminder_24h', label: 'Recordatorio 24h', description: 'Recordatorio enviado 24 horas antes de la cita' },
  { value: 'reminder_1h', label: 'Recordatorio 1h', description: 'Recordatorio enviado 1 hora antes de la cita' },
  { value: 'cancellation', label: 'Cancelación', description: 'Email enviado al cancelar una reserva' },
  { value: 'reschedule', label: 'Reprogramación', description: 'Email enviado al reprogramar una reserva' },
];

const defaultTemplates: Record<string, { subject: string; htmlBody: string }> = {
  confirmation: {
    subject: '✅ Reserva Confirmada: {{eventTitle}}',
    htmlBody: `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background-color: #00BFFF; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; font-size: 28px;">¡Reserva Confirmada! 🎉</h1>
    </div>
    <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <p style="font-size: 18px; margin-top: 0;">Hola {{guestName}},</p>
      <p style="font-size: 16px; color: #555;">Tu reserva ha sido confirmada exitosamente.</p>
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
        <h2 style="margin-top: 0; color: white; font-size: 24px;">{{eventTitle}}</h2>
        <p style="margin: 8px 0;"><strong>📅 Cuándo:</strong> {{startTime}}</p>
        <p style="margin: 8px 0;"><strong>⏱️ Duración:</strong> {{duration}} minutos</p>
        <p style="margin: 8px 0;"><strong>📍 Ubicación:</strong> {{location}}</p>
        {{#if videoLink}}<p style="margin: 8px 0;"><strong>🎥 Enlace:</strong> {{videoLink}}</p>{{/if}}
      </div>
      <p style="font-size: 16px; margin-top: 30px;">¡Nos vemos pronto! 👋</p>
    </div>
  </body>
</html>`,
  },
  reminder_24h: {
    subject: '⏰ Recordatorio: {{eventTitle}} es mañana',
    htmlBody: `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background-color: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; font-size: 28px;">Recordatorio de Reunión ⏰</h1>
    </div>
    <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <p style="font-size: 18px; margin-top: 0;">Hola {{guestName}},</p>
      <p style="font-size: 16px; color: #555;">Este es un recordatorio de que tienes una reunión programada para mañana:</p>
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
        <h2 style="margin-top: 0; color: white; font-size: 24px;">{{eventTitle}}</h2>
        <p style="margin: 8px 0;"><strong>📅 Cuándo:</strong> {{startTime}}</p>
        <p style="margin: 8px 0;"><strong>🌍 Zona horaria:</strong> {{timezone}}</p>
        {{#if videoLink}}<p style="margin: 8px 0;"><strong>🎥 Enlace:</strong> {{videoLink}}</p>{{/if}}
      </div>
      <p style="font-size: 16px; margin-top: 30px;">¡Nos vemos pronto! 👋</p>
    </div>
  </body>
</html>`,
  },
  reminder_1h: {
    subject: '⏰ Recordatorio: {{eventTitle}} en 1 hora',
    htmlBody: `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background-color: #ef4444; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; font-size: 28px;">¡Tu reunión es en 1 hora! ⏰</h1>
    </div>
    <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <p style="font-size: 18px; margin-top: 0;">Hola {{guestName}},</p>
      <p style="font-size: 16px; color: #555;">Tu reunión comienza en 1 hora:</p>
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
        <h2 style="margin-top: 0; color: white; font-size: 24px;">{{eventTitle}}</h2>
        <p style="margin: 8px 0;"><strong>📅 Cuándo:</strong> {{startTime}}</p>
        {{#if videoLink}}<p style="margin: 8px 0;"><strong>🎥 Enlace:</strong> {{videoLink}}</p>{{/if}}
      </div>
      <p style="font-size: 16px; margin-top: 30px;">¡Nos vemos pronto! 👋</p>
    </div>
  </body>
</html>`,
  },
  cancellation: {
    subject: '❌ Reserva Cancelada: {{eventTitle}}',
    htmlBody: `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background-color: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; font-size: 28px;">Reserva Cancelada</h1>
    </div>
    <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <p style="font-size: 18px; margin-top: 0;">Hola {{guestName}},</p>
      <p style="font-size: 16px; color: #555;">Tu reserva ha sido cancelada:</p>
      <div style="background-color: #fee2e2; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #dc2626;">
        <h2 style="margin-top: 0; color: #991b1b; font-size: 24px;">{{eventTitle}}</h2>
        <p style="margin: 8px 0; color: #7f1d1d;"><strong>📅 Fecha cancelada:</strong> {{startTime}}</p>
      </div>
      <p style="font-size: 16px; margin-top: 30px;">Si deseas agendar una nueva cita, no dudes en contactarnos.</p>
    </div>
  </body>
</html>`,
  },
  reschedule: {
    subject: '🔄 Reserva Reprogramada: {{eventTitle}}',
    htmlBody: `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background-color: #3b82f6; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; font-size: 28px;">Reserva Reprogramada 🔄</h1>
    </div>
    <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <p style="font-size: 18px; margin-top: 0;">Hola {{guestName}},</p>
      <p style="font-size: 16px; color: #555;">Tu reserva ha sido reprogramada exitosamente.</p>
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
        <h2 style="margin-top: 0; color: white; font-size: 24px;">{{eventTitle}}</h2>
        <p style="margin: 8px 0;"><strong>✅ Nueva fecha:</strong> {{startTime}}</p>
        <p style="margin: 8px 0;"><strong>📍 Ubicación:</strong> {{location}}</p>
        {{#if videoLink}}<p style="margin: 8px 0;"><strong>🎥 Enlace:</strong> {{videoLink}}</p>{{/if}}
      </div>
      <p style="font-size: 16px; margin-top: 30px;">¡Nos vemos pronto! 👋</p>
    </div>
  </body>
</html>`,
  },
};

export function EmailTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ subject: '', htmlBody: '' });
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/user/email-templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (templateType: string) => {
    setSaving(true);
    try {
      const response = await fetch('/api/user/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: templateType,
          name: templateTypes.find(t => t.value === templateType)?.label || templateType,
          subject: editForm.subject,
          htmlBody: editForm.htmlBody,
          isActive: true,
        }),
      });

      if (response.ok) {
        toast({ title: 'Plantilla guardada', description: 'La plantilla de email ha sido actualizada.' });
        setEditingId(null);
        fetchTemplates();
      } else {
        toast({ title: 'Error', description: 'No se pudo guardar la plantilla', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Ocurrió un error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (templateId: string, isActive: boolean) => {
    try {
      const template = templates.find(t => t.id === templateId);
      if (!template) return;

      const response = await fetch('/api/user/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: template.type,
          name: template.name,
          subject: template.subject,
          htmlBody: template.htmlBody,
          isActive,
        }),
      });

      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error toggling template:', error);
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const response = await fetch(`/api/user/email-templates?id=${templateId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({ title: 'Plantilla eliminada', description: 'La plantilla ha sido eliminada.' });
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const startEditing = (template: EmailTemplate | null, type: string) => {
    if (template) {
      setEditingId(template.id);
      setEditForm({ subject: template.subject, htmlBody: template.htmlBody });
    } else {
      setEditingId(type);
      const defaultTemplate = defaultTemplates[type];
      setEditForm({ subject: defaultTemplate.subject, htmlBody: defaultTemplate.htmlBody });
    }
  };

  const renderPreview = (htmlBody: string) => {
    // Replace template variables with sample data for preview
    const sampleData: Record<string, string> = {
      guestName: 'Juan Pérez',
      eventTitle: 'Consulta de ejemplo',
      startTime: 'lunes, 1 de septiembre de 2026, 10:00',
      duration: '30',
      location: 'Videollamada',
      videoLink: 'https://meet.google.com/abc-defg-hij',
      timezone: 'America/Mexico_City',
      cancelUrl: '#',
      rescheduleUrl: '#',
      meetingPageUrl: '#',
      bookingId: 'booking_123',
      hoursBefore: '24',
    };

    let preview = htmlBody;
    for (const [key, value] of Object.entries(sampleData)) {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return preview;
  };

  if (loading) {
    return <div className="text-center py-8">Cargando plantillas...</div>;
  }

  return (
    <Card className="p-6">
      <div className="flex items-center mb-6">
        <Mail className="h-5 w-5 text-indigo-600 mr-2" />
        <h2 className="text-xl font-semibold text-gray-900">Email Templates</h2>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Personaliza los emails que se envían a tus clientes. Usa variables como {'{{guestName}}'}, {'{{eventTitle}}'}, {'{{startTime}}'} para personalizar.
      </p>

      <div className="space-y-4">
        {templateTypes.map((templateType) => {
          const existing = templates.find(t => t.type === templateType.value);
          const isEditing = editingId === (existing?.id || templateType.value);
          const isPreviewing = previewId === templateType.value;

          return (
            <div key={templateType.value} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{templateType.label}</h3>
                  <p className="text-sm text-gray-500">{templateType.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {existing && (
                    <Switch
                      checked={existing.isActive}
                      onCheckedChange={(checked) => handleToggleActive(existing.id, checked)}
                    />
                  )}
                  <Button variant="outline" size="sm" onClick={() => startEditing(existing || null, templateType.value)}>
                    <Edit2 className="h-4 w-4 mr-1" />
                    {existing ? 'Editar' : 'Crear'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPreviewId(isPreviewing ? null : templateType.value)}>
                    <Eye className="h-4 w-4 mr-1" />
                    Vista previa
                  </Button>
                  {existing && (
                    <Button variant="outline" size="sm" onClick={() => handleDelete(existing.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="mt-4 space-y-4">
                  <div>
                    <Label>Asunto del email</Label>
                    <Input
                      value={editForm.subject}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      placeholder="Asunto del email"
                    />
                  </div>
                  <div>
                    <Label>Cuerpo HTML</Label>
                    <textarea
                      value={editForm.htmlBody}
                      onChange={(e) => setEditForm({ ...editForm, htmlBody: e.target.value })}
                      rows={15}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSave(templateType.value)} disabled={saving}>
                      <Save className="h-4 w-4 mr-1" />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {isPreviewing && (
                <div className="mt-4">
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
                      Vista previa (con datos de ejemplo)
                    </div>
                    <div
                      className="p-4 bg-white"
                      dangerouslySetInnerHTML={{ __html: renderPreview(existing?.htmlBody || defaultTemplates[templateType.value].htmlBody) }}
                    />
                  </div>
                </div>
              )}

              {!isEditing && !isPreviewing && existing && (
                <div className="mt-2 text-sm text-gray-500">
                  <span className="font-medium">Asunto:</span> {existing.subject}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-indigo-50 rounded-lg">
        <h4 className="font-semibold text-indigo-900 mb-2">Variables disponibles</h4>
        <div className="grid grid-cols-2 gap-2 text-sm text-indigo-800">
          <div><code>{'{{guestName}}'}</code> - Nombre del cliente</div>
          <div><code>{'{{eventTitle}}'}</code> - Título del evento</div>
          <div><code>{'{{startTime}}'}</code> - Fecha y hora</div>
          <div><code>{'{{duration}}'}</code> - Duración en minutos</div>
          <div><code>{'{{location}}'}</code> - Ubicación</div>
          <div><code>{'{{videoLink}}'}</code> - Enlace de video</div>
          <div><code>{'{{timezone}}'}</code> - Zona horaria</div>
          <div><code>{'{{cancelUrl}}'}</code> - URL de cancelación</div>
          <div><code>{'{{rescheduleUrl}}'}</code> - URL de reprogramación</div>
          <div><code>{'{{bookingId}}'}</code> - ID de la reserva</div>
        </div>
      </div>
    </Card>
  );
}