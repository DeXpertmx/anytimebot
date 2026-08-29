'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader2, Send, Bot, User } from 'lucide-react';

export default function ChatPage() {
  const params = useParams();
  const username = params?.username as string;
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [botName, setBotName] = useState('MindBot');
  const [botAvatar, setBotAvatar] = useState('🤖');
  const [configLoading, setConfigLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load bot config
  useEffect(() => {
    const loadBotConfig = async () => {
      try {
        const response = await fetch(`/api/bot/public-config?username=${username}`);
        if (response.ok) {
          const config = await response.json();
          setBotName(config.name || 'MindBot');
          setBotAvatar(config.avatar || '🤖');
          setMessages([
            {
              role: 'assistant',
              content: config.greeting || "👋 Hi! I'm here to help you schedule meetings. How can I assist you today?",
            },
          ]);
        }
      } catch (error) {
        console.error('Failed to load bot config:', error);
        // Use defaults
        setMessages([
          {
            role: 'assistant',
            content: "👋 Hi! I'm here to help you schedule meetings. How can I assist you today?",
          },
        ]);
      } finally {
        setConfigLoading(false);
      }
    };

    if (username) {
      loadBotConfig();
    }
  }, [username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, username }),
      });

      if (!response.ok) throw new Error('Chat failed');

      const assistantMessage = await response.text();
      if (!assistantMessage.trim()) throw new Error('Empty response');
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Ocurrió un error al procesar tu mensaje. Inténtalo de nuevo.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (configLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container max-w-4xl mx-auto p-4 h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white rounded-t-lg shadow-lg p-4 flex items-center gap-3">
          <div className="text-3xl">{botAvatar}</div>
          <div>
            <h1 className="text-xl font-bold">{botName}</h1>
            <p className="text-sm text-muted-foreground">AI Scheduling Assistant</p>
          </div>
        </div>

        {/* Messages */}
        <Card className="flex-1 overflow-y-auto p-4 space-y-4 rounded-none border-x">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="bg-muted rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </Card>

        {/* Input */}
        <div className="bg-white rounded-b-lg shadow-lg p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              aria-label="Escribe tu mensaje"
              placeholder="Escribe tu mensaje..."
              disabled={loading}
            />
            <Button onClick={() => void handleSend()} disabled={loading || !input.trim()} aria-label="Enviar mensaje">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
