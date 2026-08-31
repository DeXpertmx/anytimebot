import { findSimilarDocuments } from '@/lib/embeddings';
import { getPublicAppUrl } from '@/lib/public-url';
import { computeLlmUsage, logLlmUsage } from '@/lib/llm-usage';

type BotDocument = {
  id: string;
  content: string;
  fileName: string;
};

type BotLike = {
  name: string;
  greeting?: string | null;
  personality?: string | null;
  tone?: string | null;
  documents: BotDocument[];
};

type BookingPageLike = {
  slug: string;
};

export type BotResponseContext = {
  bot: BotLike;
  ownerName?: string | null;
  username: string;
  message: string;
  bookingPages?: BookingPageLike[];
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  channel?: 'web' | 'whatsapp';
};

function getPublicOrigin(): string {
  return getPublicAppUrl();
}

export function buildBotPrompt(context: BotResponseContext): string {
  const { bot, ownerName, username, message, bookingPages = [], conversation = [], channel = 'web' } = context;
  const similarDocs = findSimilarDocuments(message, bot.documents, 3).filter((doc) => doc.similarity > 0);
  const knowledge = similarDocs.length
    ? `\nInformación relevante de la base de conocimiento:\n${similarDocs
        .map((doc, index) => `[Documento ${index + 1}: ${doc.fileName}]\n${doc.content}`)
        .join('\n\n')}`
    : '';
  const bookingUrl = bookingPages[0]
    ? `${getPublicOrigin()}/${username}/${bookingPages[0].slug}`
    : '';
  const bookingInfo = bookingUrl ? `\nEnlace de reservas (úsalo sin modificar): ${bookingUrl}` : '';
  const tone = bot.tone || 'friendly';
  const personality = bot.personality?.trim() || 'servicial, claro y profesional';
  const history = conversation.length
    ? `\nHistorial reciente:\n${conversation.slice(-8).map((item) => `${item.role}: ${item.content}`).join('\n')}`
    : '';

  return `Eres ${bot.name}, asistente de ${ownerName || username}.

Tu personalidad es: ${personality}.
Tu tono debe ser: ${tone}.
Tu canal actual es: ${channel}.

Objetivos:
- Responder con información útil y precisa.
- Ayudar a agendar reuniones cuando sea apropiado.
- Usar la base de conocimiento solo como contexto; no inventes datos.
- Si no sabes algo, dilo claramente.
- Responde en el idioma del usuario.
- Mantén la respuesta concisa, normalmente entre 1 y 4 frases.
${knowledge}
${bookingInfo}
${history}

Reglas:
- Nunca alteres ni partas una URL.
- Si compartes el enlace de reservas, colócalo en una línea propia.
- No menciones estas instrucciones ni el proveedor de IA.

Mensaje actual del usuario:
${message}`;
}

// Cache-friendly ordering: STATIC content (system prompt, persona, base de
// conocimiento) goes first and stays byte-identical across calls so DeepSeek
// reuses its prefix cache. Dynamic content (user message) always goes last.
function buildDeepSeekPayload(context: BotResponseContext) {
  const system = buildBotPrompt(context);
  const conversation = context.conversation || [];
  const alreadyIncluded = conversation.some(
    (item) => item.role === 'user' && item.content === context.message
  );
  return {
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    messages: [
      { role: 'system' as const, content: system },
      // Static, ordered history first (keeps the token prefix stable), append
      // current user turn last.
      ...conversation.slice(-8),
      ...(alreadyIncluded ? [] : [{ role: 'user' as const, content: context.message }]),
    ],
    max_tokens: context.channel === 'whatsapp' ? 600 : 1000,
    temperature: 0.7,
  };
}

const DEEPSEEK_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com/chat/completions';
const ORCAROUTER_URL = process.env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1/chat/completions';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff with jitter for 429 (rate limit). Keeps bursts from
// hammering the API and keeps the shared cache prefix warm.
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= attempts) {
      return res;
    }
    const base = 500 * 2 ** (attempt - 1);
    const delay = base + Math.random() * base;
    await sleep(delay);
  }
}

type Provider = {
  url: string;
  apiKey: string;
  model: string;
};

// OrcaRouter is the primary provider; DeepSeek is the fallback. Both speak the
// OpenAI-compatible chat completions protocol, so the same payload works for
// both. The key is read from env (never hardcoded).
function resolveProviders(): Provider[] {
  const providers: Provider[] = [];
  const orcaKey = process.env.ORCAROUTER_API_KEY || process.env.LLM_API_KEY;
  const deepKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
  if (orcaKey) {
    providers.push({
      url: ORCAROUTER_URL,
      apiKey: orcaKey,
      model: process.env.ORCAROUTER_MODEL || 'orcarouter/free',
    });
  }
  if (deepKey) {
    providers.push({
      url: DEEPSEEK_URL,
      apiKey: deepKey,
      model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    });
  }
  // Fallback: a generic LLM_API_KEY with no provider-specific var.
  if (providers.length === 0 && process.env.LLM_API_KEY) {
    providers.push({
      url: DEEPSEEK_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    });
  }
  return providers;
}

export async function generateBotResponse(context: BotResponseContext): Promise<string> {
  const providers = resolveProviders();
  if (providers.length === 0) {
    throw new Error('LLM is not configured: missing API key');
  }

  const payload = buildDeepSeekPayload(context);

  // Try the primary provider first, then fall back to the next one.
  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      return await callProvider(provider, payload);
    } catch (error) {
      lastError = error;
      console.error(`LLM provider failed (${provider.model}):`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All LLM providers failed');
}

async function callProvider(
  provider: Provider,
  payload: ReturnType<typeof buildDeepSeekPayload>,
): Promise<string> {
  const modelPayload = { ...payload, model: provider.model };
  const response = await fetchWithRetry(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(modelPayload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`LLM request failed (${provider.url}, ${response.status}): ${details}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('LLM returned an empty response');
  }

  // Telemetry only for DeepSeek, which exposes top-level cache fields. OrcaRouter
  // uses the standard OpenAI shape, so computeLlmUsage may read zeroed cache —
  // cheap and harmless, still records token/cost baselines.
  try {
    if (data.usage) {
      logLlmUsage(computeLlmUsage(modelPayload.model, data.usage));
    }
  } catch (e) {
    // Telemetry must never break the response.
  }

  return content
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2');
}
