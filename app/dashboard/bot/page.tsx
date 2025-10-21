
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Bot, Upload, Trash2, FileText, Loader2, Sparkles, Brain, Star, User } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface BotConfig {
  id: string;
  name: string;
  avatar: string;
  greeting: string;
  personality?: string;
  tone?: string;
}

interface BotDocument {
  id: string;
  fileName: string;
  fileType: string;
  url?: string;
  content: string;
  createdAt: string;
}

const AVATAR_OPTIONS = [
  { value: 'robot', label: 'Robot 🤖', icon: Bot },
  { value: 'brain', label: 'Cerebro 🧠', icon: Brain },
  { value: 'sparkle', label: 'Brillo ✨', icon: Sparkles },
  { value: 'star', label: 'Estrella ⭐', icon: Star },
  { value: 'assistant', label: 'Asistente 👤', icon: User },
];

const TONE_OPTIONS = [
  { value: 'professional', label: 'Profesional' },
  { value: 'friendly', label: 'Amigable' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
];

export default function BotConfigPage() {
  const { data: session } = useSession() || {};
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    id: '',
    name: 'MindBot',
    avatar: 'robot',
    greeting: '¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?',
    personality: '',
    tone: 'friendly',
  });
  const [documents, setDocuments] = useState<BotDocument[]>([]);
  const [uploadType, setUploadType] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (session?.user) {
      fetchBotConfig();
      fetchDocuments();
    }
  }, [session]);

  const fetchBotConfig = async () => {
    try {
      const response = await fetch('/api/bot/config');
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setBotConfig(data);
        }
      }
    } catch (error) {
      console.error('Error fetching bot config:', error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/bot/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig),
      });

      if (response.ok) {
        toast({
          title: '✅ Configuración guardada',
          description: 'La configuración del bot se ha actualizado correctamente.',
        });
      } else {
        throw new Error('Failed to save config');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración del bot.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/bot/documents', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        toast({
          title: '✅ Documento subido',
          description: `El archivo ${file.name} se ha subido correctamente.`,
        });
        fetchDocuments();
      } else {
        throw new Error('Failed to upload file');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo subir el documento.',
        variant: 'destructive',
      });
    } finally {
      setUploadLoading(false);
      e.target.value = '';
    }
  };

  const handleUrlUpload = async () => {
    if (!url) return;

    setUploadLoading(true);
    try {
      const response = await fetch('/api/bot/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (response.ok) {
        toast({
          title: '✅ URL agregada',
          description: 'El contenido de la URL se ha agregado correctamente.',
        });
        setUrl('');
        fetchDocuments();
      } else {
        throw new Error('Failed to add URL');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo agregar la URL.',
        variant: 'destructive',
      });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      const response = await fetch(`/api/bot/documents?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: '✅ Documento eliminado',
          description: 'El documento se ha eliminado correctamente.',
        });
        fetchDocuments();
      } else {
        throw new Error('Failed to delete document');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el documento.',
        variant: 'destructive',
      });
    }
  };

  const getAvatarIcon = (avatar: string) => {
    const option = AVATAR_OPTIONS.find((opt) => opt.value === avatar);
    return option ? option.icon : Bot;
  };

  const AvatarIcon = getAvatarIcon(botConfig.avatar);

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AvatarIcon className="h-8 w-8 text-primary" />
            Configuración de {botConfig.name}
          </h1>
          <p className="text-muted-foreground mt-2">
            Personaliza tu asistente de IA para WhatsApp
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Basic Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Personalización básica</CardTitle>
            <CardDescription>
              Configura el nombre, avatar y mensaje de bienvenida de tu bot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="bot-name">Nombre del bot</Label>
              <Input
                id="bot-name"
                value={botConfig.name}
                onChange={(e) => setBotConfig({ ...botConfig, name: e.target.value })}
                placeholder="MindBot"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-avatar">Avatar del bot</Label>
              <Select
                value={botConfig.avatar}
                onValueChange={(value) => setBotConfig({ ...botConfig, avatar: value })}
              >
                <SelectTrigger id="bot-avatar">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVATAR_OPTIONS.map((option) => {
                    const IconComponent = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <IconComponent className="h-4 w-4" />
                          {option.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-tone">Tono de conversación</Label>
              <Select
                value={botConfig.tone || 'friendly'}
                onValueChange={(value) => setBotConfig({ ...botConfig, tone: value })}
              >
                <SelectTrigger id="bot-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-greeting">Mensaje de bienvenida</Label>
              <Textarea
                id="bot-greeting"
                value={botConfig.greeting}
                onChange={(e) => setBotConfig({ ...botConfig, greeting: e.target.value })}
                placeholder="¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-personality">
                Personalidad (opcional)
              </Label>
              <Textarea
                id="bot-personality"
                value={botConfig.personality || ''}
                onChange={(e) => setBotConfig({ ...botConfig, personality: e.target.value })}
                placeholder="Describe la personalidad del bot, por ejemplo: 'Sé servicial y entusiasta, pero mantén un tono profesional...'"
                rows={4}
              />
              <p className="text-sm text-muted-foreground">
                Define características específicas de personalidad para tu bot
              </p>
            </div>

            <Button onClick={handleSaveConfig} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar configuración
            </Button>
          </CardContent>
        </Card>

        {/* Knowledge Base */}
        <Card>
          <CardHeader>
            <CardTitle>Base de conocimiento</CardTitle>
            <CardDescription>
              Sube documentos para entrenar a tu bot con información personalizada
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={uploadType === 'file' ? 'default' : 'outline'}
                  onClick={() => setUploadType('file')}
                  size="sm"
                >
                  Subir archivo
                </Button>
                <Button
                  variant={uploadType === 'url' ? 'default' : 'outline'}
                  onClick={() => setUploadType('url')}
                  size="sm"
                >
                  Agregar URL
                </Button>
              </div>

              {uploadType === 'file' ? (
                <div className="space-y-2">
                  <Label htmlFor="file-upload">
                    Subir documento (TXT)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".txt"
                      onChange={handleFileUpload}
                      disabled={uploadLoading}
                    />
                    {uploadLoading && (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="url-upload">URL del documento</Label>
                  <div className="flex gap-2">
                    <Input
                      id="url-upload"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://ejemplo.com/documento"
                      disabled={uploadLoading}
                    />
                    <Button onClick={handleUrlUpload} disabled={uploadLoading || !url}>
                      {uploadLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Documents List */}
            <div className="space-y-2">
              <Label>Documentos cargados ({documents.length})</Label>
              {documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No hay documentos cargados</p>
                  <p className="text-sm">Sube documentos para entrenar a tu bot</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{doc.fileName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {doc.fileType.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Cómo funciona</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-3">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Personalización avanzada</p>
                  <p className="text-sm text-muted-foreground">
                    Configura el nombre, avatar, tono y personalidad de tu bot para que refleje tu marca
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Brain className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Base de conocimiento</p>
                  <p className="text-sm text-muted-foreground">
                    Sube documentos para que tu bot pueda responder preguntas específicas sobre tu negocio
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Bot className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Respuestas inteligentes</p>
                  <p className="text-sm text-muted-foreground">
                    Tu bot usa IA avanzada para entender el contexto y proporcionar respuestas relevantes
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
