
'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, VideoOff, Mic, MicOff, Monitor, MonitorOff, Phone, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface VideoRoomProps {
  roomUrl: string;
  bookingId: string;
  isHost: boolean;
  guestName?: string;
  hostName?: string;
  enableLiveAI?: boolean;
  enableRecording?: boolean;
  onMeetingEnd?: () => void;
}

declare global {
  interface Window {
    DailyIframe: any;
  }
}

export default function VideoRoom({
  roomUrl,
  bookingId,
  isHost,
  guestName,
  hostName,
  enableLiveAI,
  enableRecording,
  onMeetingEnd,
}: VideoRoomProps) {
  const { t } = useTranslation();
  const [callFrame, setCallFrame] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load Daily.co library
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@daily-co/daily-js';
    script.async = true;
    script.onload = initializeCall;
    document.body.appendChild(script);

    return () => {
      if (callFrame) {
        callFrame.destroy();
      }
      document.body.removeChild(script);
    };
  }, []);

  const initializeCall = async () => {
    if (!window.DailyIframe || !containerRef.current) return;

    try {
      const frame = window.DailyIframe.createFrame(containerRef.current, {
        showLeaveButton: false,
        showFullscreenButton: true,
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '0.5rem',
        },
      });

      // Set up event listeners
      frame
        .on('loaded', () => {
          setIsLoading(false);
        })
        .on('joined-meeting', (event: any) => {
          setMeetingStarted(true);
          console.log('Joined meeting:', event);
        })
        .on('participant-joined', (event: any) => {
          updateParticipants(frame);
        })
        .on('participant-left', (event: any) => {
          updateParticipants(frame);
        })
        .on('left-meeting', () => {
          setMeetingStarted(false);
          handleMeetingEnd();
        })
        .on('error', (error: any) => {
          console.error('Daily error:', error);
        });

      // Join the call
      await frame.join({ url: roomUrl });
      setCallFrame(frame);
    } catch (error) {
      console.error('Error initializing call:', error);
      setIsLoading(false);
    }
  };

  const updateParticipants = (frame: any) => {
    const participantList = Object.values(frame.participants());
    setParticipants(participantList);
  };

  const toggleMute = () => {
    if (callFrame) {
      callFrame.setLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (callFrame) {
      callFrame.setLocalVideo(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (callFrame) {
      if (isScreenSharing) {
        await callFrame.stopScreenShare();
      } else {
        await callFrame.startScreenShare();
      }
      setIsScreenSharing(!isScreenSharing);
    }
  };

  const leaveMeeting = () => {
    if (callFrame) {
      callFrame.leave();
    }
  };

  const handleMeetingEnd = async () => {
    // Save meeting data
    try {
      await fetch(`/api/video/${bookingId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: Math.floor((Date.now() - (callFrame?.joinedDate || Date.now())) / 60000),
        }),
      });
    } catch (error) {
      console.error('Error ending meeting:', error);
    }

    if (onMeetingEnd) {
      onMeetingEnd();
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-[600px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">
              {t('videoRoom.loading', 'Cargando sala de video...')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Video Container */}
      <Card className="overflow-hidden">
        <div ref={containerRef} className="w-full h-[600px] bg-black" />
        
        {/* Controls */}
        <CardContent className="flex items-center justify-between p-4 bg-muted">
          <div className="flex items-center gap-2">
            <Badge variant={meetingStarted ? 'default' : 'secondary'}>
              {meetingStarted ? t('videoRoom.live', 'En vivo') : t('videoRoom.waiting', 'Esperando')}
            </Badge>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{participants.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon"
              onClick={toggleMute}
              title={isMuted ? t('videoRoom.unmute', 'Activar micrófono') : t('videoRoom.mute', 'Silenciar')}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>

            <Button
              variant={isVideoOff ? 'destructive' : 'secondary'}
              size="icon"
              onClick={toggleVideo}
              title={isVideoOff ? t('videoRoom.startVideo', 'Activar video') : t('videoRoom.stopVideo', 'Desactivar video')}
            >
              {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </Button>

            <Button
              variant={isScreenSharing ? 'default' : 'secondary'}
              size="icon"
              onClick={toggleScreenShare}
              title={t('videoRoom.shareScreen', 'Compartir pantalla')}
            >
              {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            </Button>

            <Button
              variant="destructive"
              onClick={leaveMeeting}
              className="ml-4"
            >
              <Phone className="w-4 h-4 mr-2" />
              {t('videoRoom.leave', 'Salir')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live AI Notes (Premium Feature) */}
      {enableLiveAI && isHost && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('videoRoom.liveNotes', 'Notas en Vivo')}
            </CardTitle>
            <CardDescription>
              {t('videoRoom.liveNotesDesc', 'Asistente de IA analizando la conversación')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transcript.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('videoRoom.noNotes', 'Las notas aparecerán aquí durante la reunión...')}
                </p>
              ) : (
                transcript.slice(-5).map((note, index) => (
                  <div key={index} className="text-sm p-2 bg-muted rounded-lg">
                    {note}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recording Notice */}
      {enableRecording && (
        <Card className="border-orange-500">
          <CardContent className="p-4">
            <p className="text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {t('videoRoom.recordingNotice', 'Esta reunión está siendo grabada para referencia futura.')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
