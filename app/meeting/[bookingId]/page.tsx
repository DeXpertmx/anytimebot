
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2, Video, FileText, Users, CheckCircle, MessageSquare, Flag, Save, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface VideoSession {
  id: string;
  bookingId: string;
  provider: string;
  roomUrl: string;
  hostRoomUrl: string;
  roomName: string;
  recordingConsent: boolean;
  liveNotesEnabled: boolean;
  booking: {
    id: string;
    guestName: string;
    guestEmail: string;
    startTime: string;
    endTime: string;
    status: string;
    notes?: string | null;
    completedAt?: string | null;
    formData: any;
    eventType: {
      id: string;
      name: string;
      description?: string;
      duration: number;
      enableLiveAI: boolean;
      enableRecording: boolean;
      bookingPage: {
        user: {
          name: string;
          email: string;
        };
      };
    };
  };
}

interface MeetingBriefing {
  hostBriefing: string;
  guestBriefing: string;
  talkingPoints: string[];
  context: any;
}

interface RelevantDocument {
  fileName: string;
  content: string;
  similarity: number;
}

export default function MeetingPage() {
  const params = useParams();
  const bookingId = params?.bookingId as string;
  
  const [videoSession, setVideoSession] = useState<VideoSession | null>(null);
  const [briefing, setBriefing] = useState<MeetingBriefing | null>(null);
  const [documents, setDocuments] = useState<RelevantDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomJoined, setRoomJoined] = useState(false);
  const [externalOpened, setExternalOpened] = useState(false);
  const [bookingStatus, setBookingStatus] = useState('PENDING');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const bookingStatusLabel = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return 'Confirmada';
      case 'CANCELLED': return 'Cancelada';
      case 'COMPLETED': return 'Finalizada';
      default: return 'Pendiente';
    }
  };

  useEffect(() => {
    if (!bookingId) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch video session
        const sessionRes = await fetch(`/api/video-sessions/${bookingId}`);
        const sessionData = await sessionRes.json();

        if (!sessionData.success) {
          throw new Error(sessionData.error || 'Failed to load video session');
        }

        setVideoSession(sessionData.videoSession);
        setConsentGiven(sessionData.videoSession.recordingConsent);
        setBookingStatus(sessionData.videoSession.booking?.status ?? 'PENDING');
        setNotesDraft(sessionData.videoSession.booking?.notes ?? '');

        // Fetch briefing
        const briefingRes = await fetch(`/api/briefings/${bookingId}`);
        const briefingData = await briefingRes.json();

        if (briefingData.success && briefingData.briefing) {
          setBriefing(briefingData.briefing);

          // Extract relevant documents from context
          if (briefingData.briefing.context?.relevantDocuments) {
            setDocuments(briefingData.briefing.context.relevantDocuments);
          }
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Error loading meeting data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, [bookingId]);

  const handleConsentChange = async (checked: boolean) => {
    setConsentGiven(checked);

    try {
      await fetch('/api/video-sessions/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          consent: checked,
        }),
      });
    } catch (err) {
      console.error('Error updating consent:', err);
    }
  };

  const joinMeeting = () => {
    if (videoSession?.booking.eventType.enableRecording && !consentGiven) {
      alert('Por favor, acepta los términos de grabación antes de unirte a la reunión.');
      return;
    }

    if (!videoSession) return;
    const url = isHost ? videoSession.hostRoomUrl : videoSession.roomUrl;
    const external = /^(https?:\/\/)?(meet\.google\.com|zoom\.us|teams\.microsoft\.com)(\/|$)/i.test(url);
    if (external) {
      window.location.assign(url);
      return;
    }

    setRoomJoined(true);
  };

  // Mark the meeting as finished from inside the room without leaving the call.
  const updateBookingStatus = async (status: 'COMPLETED') => {
    if (!videoSession || actionLoading) return;
    if (!window.confirm('¿Marcar esta cita como finalizada? Podrás añadir notas o un resumen después.')) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/bookings/${videoSession.booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setBookingStatus(status);
        // The server may have auto-generated an AI summary into the notes.
        const generatedNotes = data.data?.notes;
        setVideoSession({
          ...videoSession,
          booking: {
            ...videoSession.booking,
            status,
            ...(generatedNotes !== undefined ? { notes: generatedNotes } : {}),
          },
        });
        if (generatedNotes) setNotesDraft(generatedNotes);
        toast.success(generatedNotes ? 'Cita finalizada y resumen generado' : 'Cita finalizada');
      } else {
        toast.error(data?.error || 'No se pudo finalizar la cita');
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error('Error al finalizar la cita');
    } finally {
      setActionLoading(false);
    }
  };

  // Save the host notes / meeting summary without changing the status.
  const saveNotes = async () => {
    if (!videoSession || notesSaving) return;
    setNotesSaving(true);
    try {
      const response = await fetch(`/api/bookings/${videoSession.booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: bookingStatus,
          notes: notesDraft.trim() ? notesDraft.trim() : null,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success('Notas guardadas');
        setVideoSession({
          ...videoSession,
          booking: { ...videoSession.booking, notes: notesDraft.trim() ? notesDraft.trim() : null },
        });
      } else {
        toast.error(data?.error || 'No se pudieron guardar las notas');
      }
    } catch (error) {
      console.error('Error saving booking notes:', error);
      toast.error('Error al guardar las notas');
    } finally {
      setNotesSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando sala de reunión...</p>
        </div>
      </div>
    );
  }

  if (error || !videoSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="p-8 max-w-md">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle className="w-8 h-8" />
            <h2 className="text-xl font-semibold">Error</h2>
          </div>
          <p className="text-gray-600">{error || 'Sala de reunión no encontrada'}</p>
        </Card>
      </div>
    );
  }

  const meetingUrl = isHost ? videoSession.hostRoomUrl : videoSession.roomUrl;
  const isExternalMeeting = /^(https?:\/\/)?(meet\.google\.com|zoom\.us|teams\.microsoft\.com)(\/|$)/i.test(meetingUrl);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Video Section */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {videoSession.booking.eventType.name}
              </h1>
              <p className="text-sm text-gray-600">
                Con {videoSession.booking.guestName} • {new Date(videoSession.booking.startTime).toLocaleString('es-ES', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {videoSession.booking.eventType.enableLiveAI && (
                <span className="flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  AI Asistente Activo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Video Container */}
        <div className="flex-1 flex items-center justify-center p-6">
          {!roomJoined ? (
            <Card className="p-8 max-w-2xl w-full">
              <div className="text-center mb-6">
                <Video className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Sala de Reunión Virtual
                </h2>
                <p className="text-gray-600">
                  Estás a punto de unirte a la reunión con {videoSession.booking.guestName}
                </p>
              </div>

              {videoSession.booking.eventType.enableRecording && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 font-medium mb-2">
                        Esta reunión será grabada y transcrita
                      </p>
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="consent"
                          checked={consentGiven}
                          onCheckedChange={handleConsentChange}
                        />
                        <label
                          htmlFor="consent"
                          className="text-sm text-gray-700 cursor-pointer"
                        >
                          Acepto que esta reunión sea grabada y procesada por IA de forma segura para generar resúmenes y notas.
                          La grabación será utilizada únicamente para propósitos de documentación.
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={joinMeeting}
                  className="w-full h-12 text-lg"
                  disabled={videoSession.booking.eventType.enableRecording && !consentGiven}
                >
                  <Video className="w-5 h-5 mr-2" />
                  Unirse a la Reunión
                </Button>

                {/* <div className="flex items-center gap-2">
                  <Checkbox
                    id="host"
                    checked={isHost}
                    onCheckedChange={(checked) => setIsHost(checked as boolean)}
                  />
                  <label htmlFor="host" className="text-sm text-gray-600 cursor-pointer">
                    Soy el anfitrión de esta reunión
                  </label>
                </div> */}
              </div>
            </Card>
          ) : (
            <div className="w-full h-full bg-black rounded-lg overflow-hidden flex flex-col">
              {isExternalMeeting ? (
                <div className="flex-1 flex items-center justify-center bg-white p-8 text-center">
                  <div className="max-w-md">
                    <Video className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Videollamada externa</h2>
                    <p className="text-gray-600 mb-6">Esta reunión se abrirá directamente en el servicio de videollamada.</p>
                    <Button onClick={() => window.location.assign(meetingUrl)} className="h-12 px-6">
                      <Video className="w-5 h-5 mr-2" />
                      Abrir videollamada
                    </Button>
                  </div>
                </div>
              ) : (
                <iframe
                  src={`${meetingUrl}${meetingUrl.includes('?') ? '&' : '?'}disableDeepLinking=true`}
                  allow="camera; microphone; fullscreen; display-capture; autoplay"
                  className="w-full h-full"
                  title="Sala de reunión"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context Sidebar */}
      {roomJoined && (
        <div className="w-96 bg-white border-l flex flex-col">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Contexto de la Reunión</h3>
          </div>

          <Tabs defaultValue="briefing" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="briefing" className="flex-1">
                <FileText className="w-4 h-4 mr-2" />
                Briefing
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex-1">
                <FileText className="w-4 h-4 mr-2" />
                Docs
              </TabsTrigger>
              {videoSession.booking.formData && (
                <TabsTrigger value="answers" className="flex-1">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Info
                </TabsTrigger>
              )}
              <TabsTrigger value="close" className="flex-1">
                <Flag className="w-4 h-4 mr-2" />
                Cierre
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 px-4 pb-4">
              <TabsContent value="briefing" className="mt-4">
                {briefing ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900 mb-2">
                        Puntos Clave a Discutir
                      </h4>
                      <ul className="space-y-2">
                        {briefing.talkingPoints?.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-semibold text-sm text-gray-900 mb-2">
                        Briefing Completo
                      </h4>
                      <div 
                        className="prose prose-sm max-w-none text-gray-700"
                        dangerouslySetInnerHTML={{ 
                          __html: isHost ? briefing.hostBriefing : briefing.guestBriefing 
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No hay briefing disponible para esta reunión
                  </p>
                )}
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                {documents.length > 0 ? (
                  <div className="space-y-3">
                    {documents.map((doc, idx) => (
                      <Card key={idx} className="p-3">
                        <h4 className="font-semibold text-sm text-gray-900 mb-1">
                          {doc.fileName}
                        </h4>
                        <p className="text-xs text-gray-600 line-clamp-3">
                          {doc.content.substring(0, 200)}...
                        </p>
                        <p className="text-xs text-indigo-600 mt-2">
                          Relevancia: {Math.round(doc.similarity * 100)}%
                        </p>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No hay documentos relevantes
                  </p>
                )}
              </TabsContent>

              <TabsContent value="answers" className="mt-4">
                {videoSession.booking.formData ? (
                  <div className="space-y-3">
                    {Object.entries(videoSession.booking.formData).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                          {key}
                        </p>
                        <p className="text-sm text-gray-900">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No hay respuestas del formulario
                  </p>
                )}
              </TabsContent>

              <TabsContent value="close" className="mt-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-2">Estado de la cita</h4>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      bookingStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700'
                      : bookingStatus === 'CANCELLED' ? 'bg-rose-100 text-rose-700'
                      : bookingStatus === 'CONFIRMED' ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>
                      {bookingStatus === 'COMPLETED' && <CheckCircle className="w-3.5 h-3.5" />}
                      {bookingStatusLabel(bookingStatus)}
                    </span>
                  </div>

                  {bookingStatus === 'COMPLETED' ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                      Cita finalizada. Puedes seguir añadiendo notas o un resumen de la reunión.
                    </div>
                  ) : bookingStatus === 'CANCELLED' ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-800">
                      Esta cita fue cancelada.
                    </div>
                  ) : (
                    <Button
                      onClick={() => updateBookingStatus('COMPLETED')}
                      disabled={actionLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Flag className="w-4 h-4 mr-2" />}
                      Finalizar cita
                    </Button>
                  )}

                  {!actionLoading && bookingStatus !== 'COMPLETED' && (
                    <p className="text-xs text-gray-500">
                      Al finalizar se genera automáticamente un resumen con IA que se guarda en las notas.
                    </p>
                  )}

                  <Separator />

                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-2 flex items-center gap-1.5">
                      <NotebookPen className="w-4 h-4" />
                      Notas y resumen
                    </h4>
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      rows={5}
                      placeholder="Escribe lo sucedido, acuerdos tomados o un resumen de la cita..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
                    />
                    <Button
                      variant="outline"
                      onClick={saveNotes}
                      disabled={notesSaving}
                      className="w-full mt-2"
                    >
                      {notesSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Guardar notas
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      )}
    </div>
  );
}
