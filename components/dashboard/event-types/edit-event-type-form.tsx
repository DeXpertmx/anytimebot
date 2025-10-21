
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
  const router = useRouter();

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
          title: 'Error',
          description: 'Event type name is required',
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
          title: 'Success',
          description: 'Event type updated successfully',
        });
        router.push('/dashboard/event-types');
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update event type',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
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
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Event Type Name</Label>
            <Input
              id="name"
              placeholder="e.g., 30-Minute Meeting"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookingPage">Booking Page</Label>
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
              <Label htmlFor="duration">Duration (minutes)</Label>
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
                      {duration} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bufferTime">Buffer Time (minutes)</Label>
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
                Time between meetings to prepare
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location Type</Label>
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
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.location === 'video' && (
            <div className="space-y-2">
              <Label htmlFor="videoLink">Video Conference Link (optional)</Label>
              <Input
                id="videoLink"
                type="url"
                placeholder="https://zoom.us/j/123456789"
                value={formData.videoLink}
                onChange={(e) => setFormData({ ...formData, videoLink: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Leave empty to generate automatically
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
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
                Requires Confirmation
              </Label>
              <p className="text-sm text-gray-500">
                Manually approve bookings before they are confirmed
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
            <CardTitle>Smart Video Rooms</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Configure native video conferencing with AI-powered features
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="videoProvider">Video Provider</Label>
              <Select
                value={formData.videoProvider}
                onValueChange={(value) => setFormData({ ...formData, videoProvider: value })}
              >
                <SelectTrigger id="videoProvider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Daily.co (Recommended - Native Integration)</SelectItem>
                  <SelectItem value="GOOGLE_MEET">Google Meet</SelectItem>
                  <SelectItem value="ZOOM">Zoom</SelectItem>
                  <SelectItem value="CUSTOM">Custom URL</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Daily.co provides native video rooms with AI features. Other providers use external links.
              </p>
            </div>

            {formData.videoProvider === 'DAILY' && (
              <>
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableEmbeddedVideo" className="text-base">
                      Enable Embedded Video
                    </Label>
                    <p className="text-sm text-gray-600">
                      Embed video call directly in MeetMind (requires Daily.co)
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
                      Enable Recording
                    </Label>
                    <p className="text-sm text-gray-600">
                      Automatically record meetings (with guest consent)
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
                      Enable Transcription
                    </Label>
                    <p className="text-sm text-gray-600">
                      Generate automatic transcripts of meetings
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
                        Enable Live AI Assistant
                      </Label>
                      <span className="text-xs font-semibold bg-purple-600 text-white px-2 py-0.5 rounded-full">
                        PREMIUM
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Real-time transcription, action items, and meeting notes during the call
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
                    Post-Meeting Automation Included:
                  </h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• AI-generated meeting summaries</li>
                    <li>• Automatic action item extraction</li>
                    <li>• Key points and sentiment analysis</li>
                    <li>• Follow-up email automation</li>
                  </ul>
                </div>
              </>
            )}

            {formData.videoProvider === 'CUSTOM' && (
              <div className="space-y-2">
                <Label htmlFor="customVideoLink">Custom Video URL</Label>
                <Input
                  id="customVideoLink"
                  type="url"
                  placeholder="https://meet.jit.si/your-room"
                  value={formData.videoLink}
                  onChange={(e) => setFormData({ ...formData, videoLink: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  Enter your custom video conference URL (Jitsi, Microsoft Teams, etc.)
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
              <CardTitle>Custom Form Fields</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Add additional fields to collect information from guests
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addFormField}>
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formFields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No custom fields added yet.</p>
              <p className="text-sm mt-1">Click "Add Field" to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {formFields.map((field, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg bg-gray-50 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Field {index + 1}</h4>
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
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={field.label}
                        onChange={(e) =>
                          updateFormField(index, 'label', e.target.value)
                        }
                        placeholder="Field label"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Type</Label>
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
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Placeholder (optional)</Label>
                    <Input
                      value={field.placeholder || ''}
                      onChange={(e) =>
                        updateFormField(index, 'placeholder', e.target.value)
                      }
                      placeholder="Placeholder text"
                    />
                  </div>

                  {field.type === 'SELECT' && (
                    <div>
                      <Label className="text-xs">Options (comma-separated)</Label>
                      <Input
                        value={field.options.join(', ')}
                        onChange={(e) =>
                          updateFormField(
                            index,
                            'options',
                            e.target.value.split(',').map((s) => s.trim())
                          )
                        }
                        placeholder="Option 1, Option 2, Option 3"
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
                    <Label className="text-sm">Required field</Label>
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
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
