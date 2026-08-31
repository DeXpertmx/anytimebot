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
    process.env.DEEPSEEK_API_KEY = 'deep-key';
    const originalFetch = globalThis.fetch;
    let requestBody: any;
    let requestUrl: string;
    globalThis.fetch = (async (_input, init) => {
      requestUrl = String(_input);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Respuesta generada correctamente.' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
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
      assert.ok(requestBody.messages.at(-1).content.includes('Necesito ayuda'));
      assert.equal(requestBody.model, 'deepseek-v4-flash');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  it('uses OrcaRouter as primary provider when its key is set', async () => {
    process.env.ORCAROUTER_API_KEY = 'orca-key';
    process.env.DEEPSEEK_API_KEY = 'deep-key';
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let requestModel = '';
    globalThis.fetch = (async (_input, init) => {
      requestUrl = String(_input);
      requestModel = JSON.parse(String(init?.body)).model;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Orca dice hola' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const response = await generateBotResponse({
        bot,
        ownerName: 'Negocio Demo',
        username: 'demo',
        message: 'Hola',
        channel: 'web',
      });
      assert.equal(response, 'Orca dice hola');
      assert.ok(requestUrl.includes('api.orcarouter.ai'));
      assert.equal(requestModel, 'orcarouter/free');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.ORCAROUTER_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  it('falls back to DeepSeek when the primary provider fails', async () => {
    process.env.ORCAROUTER_API_KEY = 'orca-key';
    process.env.DEEPSEEK_API_KEY = 'deep-key';
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (_input) => {
      const url = String(_input);
      urls.push(url);
      if (url.includes('api.orcarouter.ai')) {
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Respaldo funcionando' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const response = await generateBotResponse({
        bot,
        ownerName: 'Negocio Demo',
        username: 'demo',
        message: 'Ayuda',
        channel: 'web',
      });
      assert.equal(response, 'Respaldo funcionando');
      assert.ok(urls.some((u) => u.includes('api.orcarouter.ai')));
      assert.ok(urls.some((u) => u.includes('api.deepseek.com')));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.ORCAROUTER_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  it('throws when no provider is configured', async () => {
    const originalFetch = globalThis.fetch;
    delete process.env.ORCAROUTER_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.LLM_API_KEY;
    try {
      await assert.rejects(
        () => generateBotResponse({ bot, ownerName: 'Demo', username: 'demo', message: 'X' }),
        /not configured/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
