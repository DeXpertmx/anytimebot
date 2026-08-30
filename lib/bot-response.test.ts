import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBotPrompt, generateBotResponse } from './bot-response';

const bot = {
  name: 'Asistente Demo',
  greeting: 'Hola',
  personality: 'experto y paciente',
  tone: 'formal',
  documents: [
    { id: 'doc-1', fileName: 'precios.txt', content: 'La consulta inicial cuesta 500 pesos.' },
  ],
};

describe('bot response engine', () => {
  it('includes configuration, relevant knowledge and the public booking URL', () => {
    const prompt = buildBotPrompt({
      bot,
      ownerName: 'Negocio Demo',
      username: 'demo',
      message: '¿Cuánto cuesta la consulta inicial?',
      bookingPages: [{ slug: 'agenda' }],
    });

    assert.match(prompt, /experto y paciente/);
    assert.match(prompt, /formal/);
    assert.match(prompt, /500 pesos/);
    assert.match(prompt, /anytimebot\.app\/demo\/agenda/);
  });

  it('returns the provider response and sends configured conversation context', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: any;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Respuesta generada correctamente.' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 20,
        },
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const response = await generateBotResponse({
        bot,
        ownerName: 'Negocio Demo',
        username: 'demo',
        message: 'Necesito ayuda',
        conversation: [{ role: 'user', content: 'Hola' }],
        channel: 'whatsapp',
      });

      assert.equal(response, 'Respuesta generada correctamente.');
      const model = process.env.LLM_MODEL || 'deepseek-v4-flash';
      assert.equal(requestBody.model, model);
      assert.equal(requestBody.messages.at(-1).content, 'Necesito ayuda');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
