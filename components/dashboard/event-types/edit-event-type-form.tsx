
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';

interface FormField {
  id?: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  placeholder?: string | null;
}

interface EditEventTypeFormProps {
  eventType: {
    id: string;
    name: string;
    duration: number;
    bufferTime: number;
    location: string;
    videoLink?: string | null;
    color: string;
    requiresConfirmation: boolean;
    bookingPageId: string;
    formFields: FormField[];
    videoProvider?: string;
    enableEmbeddedVideo?: boolean;
    enableLiveAI?: boolean;
    enableRecording?: boolean;
    enableTranscription?: boolean;
  };
  bookingPages: Array<{
    id: string;
    title: string;
    slug: string;
  }>;
}

const LOCATION_OPTIONS = [
  { value: 'video', label: 'Video Call' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'in-person', label: 'In Person' },
];

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'TEXTAREA', label: 'Textarea' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'SELECT', label: 'Select' },
  { value: 'CHECKBOX', label: 'Checkbox' },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export function EditEventTypeForm({ eventType, bookingPages }: EditEventTypeFormProps) {
  const [formData, setFormData] = useState({
    name: eventType.name,
    duration: eventType.duration,
    bufferTime: eventType.bufferTime,
    location: eventType.location,
    videoLink: eventType.videoLink || '',
    color: eventType.color,
    requiresConfirmation: eventType.requiresConfirmation,
    bookingPageId: eventType.bookingPageId,
    videoProvider: eventType.videoProvider || 'DAILY',
    enableEmbeddedVideo: eventType.enableEmbeddedVideo || false,
    enableLiveAI: eventType.enableLiveAI || false,
    enableRecording: eventType.enableRecording || false,
    enableTranscription: eventType.enableTranscription || false,
  });
  const [formFields, setFormFields] = useState<FormField[]>(eventType.formFields);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const router = useRouter();

  const locationLabel = (value: string) =>
    value === 'video'
      ? t('eventTypes.videoCall')
      : value === 'phone'
        ? t('eventTypes.phoneCall')
        : t('eventTypes.inPerson');

  const durationLabel = (duration: number) =>
    duration < 60
      ? t('eventTypes.durationMinutes', { count: duration })
      : duration === 60
        ? t('eventTypes.oneHour')
        : duration === 90
          ? t('eventTypes.hourAndHalf')
          : t('eventTypes.twoHours');

  const fieldTypeLabel = (value: string) =>
    ({
      TEXT: t('eventTypes.fieldTypeText'),
      TEXTAREA: t('eventTypes.fieldTypeTextarea'),
      EMAIL: t('eventTypes.fieldTypeEmail'),
      PHONE: t('eventTypes.fieldTypePhone'),
      SELECT: t('eventTypes.fieldTypeSelect'),
      CHECKBOX: t('eventTypes.fieldTypeCheckbox'),
    }[value] || value);

  const addFormField = () => {
    setFormFields([
      ...formFields,
      {
        label: '',
        type: 'TEXT',
        required: false,
        options: [],
        placeholder: '',
      },
    ]);
  };

  const removeFormField = (index: number) => {
    setFormFields(formFields.filter((_, i) => i !== index));
  };

  const updateFormField = (index: number, field: keyof FormField, value: any) => {
    const updated = [...formFields];
    updated[index] = { ...updated[index], [field]: value };
    setFormFields(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.name.trim()) {
        toast({
          title: t('common.error'),
          description: t('eventTypes.nameRequired'),
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/event-types/${eventType.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          formFields,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('eventTypes.updated'),
        });
        router.push('/dashboard/event-types');
        router.refresh();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('eventTypes.updateFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('eventTypes.updateFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('eventTypes.basicInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t('eventTypes.name')}</Label>
            <Input
              id="name"
              placeholder={t('eventTypes.namePlaceholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookingPage">{t('eventTypes.bookingPage')}</Label>
            <Select
              value={formData.bookingPageId}
              onValueChange={(value) => setFormData({ ...formData, bookingPageId: value })}
            >
              <SelectTrigger id="bookingPage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bookingPages.map((page) => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="duration">{t('eventTypes.duration')}</Label>
              <Select
                value={formData.duration.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, duration: parseInt(value) })
                }
              >
                <SelectTrigger id="duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((duration) => (
                    <SelectItem key={duration} value={duration.toString()}>
                      {durationLabel(duration)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bufferTime">{t('eventTypes.bufferTime')}</Label>
              <Input
                id="bufferTime"
                type="number"
                min="0"
                max="60"
                value={formData.bufferTime}
                onChange={(e) =>
                  setFormData({ ...formData, bufferTime: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-gray-500">
                {t('eventTypes.bufferTimeHint')}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">{t('eventTypes.location')}</Label>
            <Select
              value={formData.location}
              onValueChange={(value) => setFormData({ ...formData, location: value })}
            >
              <SelectTrigger id="location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {locationLabel(option.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.location === 'video' && (
            <div className="space-y-2">
              <Label htmlFor="videoLink">{t('eventTypes.videoConferenceLink')}</Label>
              <Input
                id="videoLink"
                type="url"
                placeholder="https://zoom.us/j/123456789"
                value={formData.videoLink}
                onChange={(e) => setFormData({ ...formData, videoLink: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                {t('eventTypes.videoLinkHint')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="color">{t('eventTypes.color')}</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="color"
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-20 h-10"
              />
              <Input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                placeholder="#6366f1"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="requiresConfirmation" className="text-base">
                {t('eventTypes.requiresConfirmation')}
              </Label>
              <p className="text-sm text-gray-500">
                {t('eventTypes.requiresConfirmationDesc')}
              </p>
            </div>
            <Switch
              id="requiresConfirmation"
              checked={formData.requiresConfirmation}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, requiresConfirmation: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Smart Video Rooms */}
      {formData.location === 'video' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('eventTypes.smartVideoRooms')}</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {t('eventTypes.smartVideoRoomsDesc')}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="videoProvider">{t('eventTypes.videoProvider')}</Label>
              <Select
                value={formData.videoProvider}
                onValueChange={(value) => setFormData({ ...formData, videoProvider: value })}
              >
                <SelectTrigger id="videoProvider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">{t('eventTypes.dailyRecommendedFull')}</SelectItem>
                  <SelectItem value="GOOGLE_MEET">{t('eventTypes.googleMeet')}</SelectItem>
                  <SelectItem value="ZOOM">{t('eventTypes.zoom')}</SelectItem>
                  <SelectItem value="TEAMS">{t('eventTypes.teams')}</SelectItem>
                  <SelectItem value="CUSTOM">{t('eventTypes.custom')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {t('eventTypes.dailyHint')}
              </p>
            </div>

            {formData.videoProvider === 'DAILY' && (
              <>
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableEmbeddedVideo" className="text-base">
                      {t('eventTypes.enableEmbeddedVideo')}
                    </Label>
                    <p className="text-sm text-gray-600">
                      {t('eventTypes.enableEmbeddedVideoDesc')}
                    </p>
                  </div>
                  <Switch
                    id="enableEmbeddedVideo"
                    checked={formData.enableEmbeddedVideo}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, enableEmbeddedVideo: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableRecording" className="text-base">
                      {t('eventTypes.enableRecording')}
                    </Label>
                    <p className="text-sm text-gray-600">
                      {t('eventTypes.enableRecordingDesc')}
                    </p>
                  </div>
                  <Switch
                    id="enableRecording"
                    checked={formData.enableRecording}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, enableRecording: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableTranscription" className="text-base">
                      {t('eventTypes.enableTranscription')}
                    </Label>
                    <p className="text-sm text-gray-600">
                      {t('eventTypes.enableTranscriptionDesc')}
                    </p>
                  </div>
                  <Switch
                    id="enableTranscription"
                    checked={formData.enableTranscription}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, enableTranscription: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border-2 border-purple-200">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="enableLiveAI" className="text-base">
                        {t('eventTypes.enableLiveAI')}
                      </Label>
                      <span className="text-xs font-semibold bg-purple-600 text-white px-2 py-0.5 rounded-full">
                        {t('eventTypes.premium')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {t('eventTypes.enableLiveAIDesc')}
                    </p>
                  </div>
                  <Switch
                    id="enableLiveAI"
                    checked={formData.enableLiveAI}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, enableLiveAI: checked })
                    }
                  />
                </div>

                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-medium text-sm text-green-900 mb-2">
                    {t('eventTypes.postMeetingAutomation')}
                  </h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>{t('eventTypes.aiSummaries')}</li>
                    <li>{t('eventTypes.actionItems')}</li>
                    <li>{t('eventTypes.keyPoints')}</li>
                    <li>{t('eventTypes.followUpEmail')}</li>
                  </ul>
                </div>
              </>
            )}

            {formData.videoProvider === 'CUSTOM' && (
              <div className="space-y-2">
                <Label htmlFor="customVideoLink">{t('eventTypes.customVideoUrl')}</Label>
                <Input
                  id="customVideoLink"
                  type="url"
                  placeholder="https://meet.jit.si/your-room"
                  value={formData.videoLink}
                  onChange={(e) => setFormData({ ...formData, videoLink: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  {t('eventTypes.customVideoUrlHint')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Custom Form Fields */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('eventTypes.customFormFields')}</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {t('eventTypes.customFormFieldsDesc')}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addFormField}>
              <Plus className="h-4 w-4 mr-2" />
              {t('eventTypes.addField')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formFields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>{t('eventTypes.noCustomFields')}</p>
              <p className="text-sm mt-1">{t('eventTypes.noCustomFieldsHint')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {formFields.map((field, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg bg-gray-50 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{t('eventTypes.field', { number: index + 1 })}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFormField(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">{t('eventTypes.fieldLabel')}</Label>
                      <Input
                        value={field.label}
                        onChange={(e) =>
                          updateFormField(index, 'label', e.target.value)
                        }
                        placeholder={t('eventTypes.fieldLabelPlaceholder')}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">{t('eventTypes.fieldType')}</Label>
                      <Select
                        value={field.type}
                        onValueChange={(value) =>
                          updateFormField(index, 'type', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {fieldTypeLabel(type.value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>                      <Label className="text-xs">{t('eventTypes.fieldPlaceholder')}</Label>
                      <Input
                        value={field.placeholder || ''}
                        onChange={(e) =>
                          updateFormField(index, 'placeholder', e.target.value)
                        }
                        placeholder={t('eventTypes.fieldPlaceholderHint')}
                      />
                  </div>

                  {field.type === 'SELECT' && (
                    <div>
                      <Label className="text-xs">{t('eventTypes.fieldOptions')}</Label>
                      <Input
                        value={field.options.join(', ')}
                        onChange={(e) =>
                          updateFormField(
                            index,
                            'options',
                            e.target.value.split(',').map((s) => s.trim())
                          )
                        }
                        placeholder={t('eventTypes.fieldOptionsPlaceholder')}
                      />
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={field.required}
                      onCheckedChange={(checked) =>
                        updateFormField(index, 'required', checked)
                      }
                    />
                    <Label className="text-sm">{t('eventTypes.requiredField')}</Label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              {t('eventTypes.saving')}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {t('eventTypes.saveChanges')}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
