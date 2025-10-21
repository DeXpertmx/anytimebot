'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Upload, X, FileText, Bot, Sparkles, Link as LinkIcon, HelpCircle, Settings, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

const AVATAR_OPTIONS = [
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'assistant', emoji: '👨‍💼', label: 'Assistant' },
  { id: 'brain', emoji: '🧠', label: 'Brain' },
  { id: 'sparkle', emoji: '✨', label: 'Sparkle' },
  { id: 'star', emoji: '⭐', label: 'Star' },
];

export default function BotConfigPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);

  const [botName, setBotName] = useState('MindBot');
  const [selectedAvatar, setSelectedAvatar] = useState('robot');
  const [greeting, setGreeting] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [documents, setDocuments] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      loadBotConfig();
      loadDocuments();
    }
  }, [status, router]);

  const loadBotConfig = async () => {
    try {
      const response = await fetch('/api/bot/config');
      if (response.ok) {
        const bot = await response.json();
        setBotName(bot.name || 'MindBot');
        setSelectedAvatar(bot.avatar || 'robot');
        setGreeting(bot.greeting || '');
      }
    } catch (error) {
      console.error('Error loading bot config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/bot/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/bot/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: botName, avatar: selectedAvatar, greeting }),
      });

      if (response.ok) {
        toast.success('Configuración guardada correctamente!');
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    const toastId = toast.loading(`Subiendo ${file.name}...`);
    
    try {
      const response = await fetch('/api/bot/upload-document', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        await loadDocuments(); // Reload all documents
        toast.success(`${file.name} subido correctamente!`, { id: toastId });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al subir el documento', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) {
      toast.error('Por favor ingresa una URL');
      return;
    }

    // Validate URL format
    try {
      new URL(urlInput);
    } catch {
      toast.error('URL inválida. Por favor ingresa una URL válida.');
      return;
    }

    setAddingUrl(true);
    const toastId = toast.loading('Procesando URL...');
    
    try {
      const response = await fetch('/api/bot/upload-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      });

      if (response.ok) {
        const data = await response.json();
        await loadDocuments(); // Reload all documents
        setUrlInput('');
        toast.success('URL agregada correctamente!', { id: toastId });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add URL');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar la URL', { id: toastId });
    } finally {
      setAddingUrl(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      const response = await fetch(`/api/bot/delete-document?id=${docId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadDocuments();
        toast.success('Documento eliminado correctamente');
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete document');
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.message || 'Error al eliminar el documento');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const username = (session?.user as any)?.username || session?.user?.email?.split('@')[0] || 'user';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">MindBot - Asistente IA</h1>
          <p className="text-muted-foreground mt-2">
            Configura y entrena tu asistente personalizado con IA
          </p>
        </div>

        <Tabs defaultValue="training" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="training" className="flex items-center gap-2">
              📚 Training Data
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              🔧 Configuración
            </TabsTrigger>
          </TabsList>

          {/* Training Data Tab */}
          <TabsContent value="training" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-blue-600">
                  <HelpCircle className="h-5 w-5" />
                  <CardTitle className="text-base">¿Cómo aprende el bot?</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  El bot analiza cada documento o URL que subes, extrae el contenido y genera embeddings de IA. 
                  Cuando alguien le hace una pregunta, busca en estos documentos la información más relevante y 
                  genera una respuesta personalizada basada en TU contenido.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subir Documentos</CardTitle>
                <CardDescription>
                  Arrastra archivos o haz clic para seleccionar. También puedes agregar URLs de artículos web.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* File Upload */}
                <div className="space-y-2">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                    <Input
                      type="file"
                      accept=".pdf,.txt"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleUploadFile(file);
                          e.target.value = ''; // Reset input
                        }
                      }}
                      disabled={uploading}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Upload className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium mb-1">
                        Click para subir o arrastra y suelta
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF o TXT (Max 10MB)
                      </p>
                    </label>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      O AGREGAR URL
                    </span>
                  </div>
                </div>

                {/* URL Input */}
                <div className="space-y-2">
                  <Label htmlFor="url-input">URL de Artículo o Página Web</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="url-input"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://ejemplo.com/articulo"
                        className="pl-10"
                        disabled={addingUrl}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddUrl();
                          }
                        }}
                      />
                    </div>
                    <Button 
                      onClick={handleAddUrl} 
                      disabled={addingUrl || !urlInput.trim()}
                      className="flex items-center gap-2"
                    >
                      {addingUrl ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <LinkIcon className="h-4 w-4" />
                          Agregar
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    💡 Puedes agregar múltiples URLs. El bot extraerá y aprenderá el contenido automáticamente.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Documents List */}
            <Card>
              <CardHeader>
                <CardTitle>Documentos Cargados ({documents.length})</CardTitle>
                <CardDescription>
                  Estos son los documentos que tu bot conoce y puede usar para responder preguntas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      No hay documentos cargados aún
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sube archivos o agrega URLs para comenzar a entrenar tu bot
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {doc.fileType === 'url' ? (
                            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <LinkIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                          ) : doc.fileType === 'pdf' ? (
                            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                              <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                            </div>
                          ) : (
                            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                              <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{doc.fileName}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="uppercase">{doc.fileType}</span>
                              <span>•</span>
                              <span>{new Date(doc.createdAt).toLocaleDateString('es-ES')}</span>
                            </div>
                            {doc.url && (
                              <a 
                                href={doc.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline truncate block mt-1"
                              >
                                {doc.url}
                              </a>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Configuración Básica
                </CardTitle>
                <CardDescription>
                  Personaliza el nombre, avatar y mensaje de bienvenida de tu bot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="bot-name">Nombre del Bot</Label>
                  <Input
                    id="bot-name"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="MindBot"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Avatar</Label>
                  <div className="grid grid-cols-5 gap-3">
                    {AVATAR_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setSelectedAvatar(option.id)}
                        className={`p-4 border-2 rounded-lg text-center transition-all ${
                          selectedAvatar === option.id
                            ? 'border-primary bg-primary/10 shadow-md'
                            : 'border-border hover:border-primary/50 hover:bg-accent/50'
                        }`}
                      >
                        <div className="text-3xl mb-1">{option.emoji}</div>
                        <div className="text-xs font-medium">{option.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="greeting">Mensaje de Bienvenida</Label>
                  <Textarea
                    id="greeting"
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    placeholder="¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este mensaje aparecerá cuando alguien inicie una conversación con tu bot
                  </p>
                </div>

                <Button onClick={handleSaveConfig} disabled={saving} className="w-full">
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Settings className="mr-2 h-4 w-4" />
                      Guardar Configuración
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Public Link */}
            <Card>
              <CardHeader>
                <CardTitle>Enlace Público del Chat</CardTitle>
                <CardDescription>
                  Comparte este enlace para que cualquiera pueda chatear con tu asistente de IA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={`https://meetmind.abacusai.app/chat/${username}`}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://meetmind.abacusai.app/chat/${username}`);
                      toast.success('¡Enlace copiado!');
                    }}
                  >
                    Copiar
                  </Button>
                </div>
                
                {/* Test Button */}
                <div className="pt-2 border-t">
                  <Button
                    onClick={() => {
                      window.open(`https://meetmind.abacusai.app/chat/${username}`, '_blank');
                    }}
                    className="w-full"
                    variant="outline"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Probar Chat en Nueva Ventana
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
