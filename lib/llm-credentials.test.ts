import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LLM_MODELS,
  getLlmCredentials,
  maskApiKey,
  mergeLlmCredentials,
} from './llm-credentials';

function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const keys = [
    'LLM_PROVIDER',
    'DEEPSEEK_API_KEY',
    'ORCAROUTER_API_KEY',
    'LLM_API_KEY',
    'LLM_MODEL',
    'ORCAROUTER_MODEL',
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return fn().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('mergeLlmCredentials keeps stored values when a field arrives empty', () => {
  const existing = {
    provider: 'deepseek' as const,
    deepseek: { apiKey: 'sk-guardada', model: 'deepseek-chat' },
    orcarouter: { apiKey: 'orca-guardada' },
  };

  const merged = mergeLlmCredentials(existing, {
    deepseek: { apiKey: '', model: 'deepseek-reasoner' },
    orcarouter: { apiKey: '' },
  });

  assert.deepEqual(merged, {
    provider: 'deepseek',
    deepseek: { apiKey: 'sk-guardada', model: 'deepseek-reasoner' },
    orcarouter: { apiKey: 'orca-guardada' },
  });
});

test('mergeLlmCredentials trims keys and clears a model override with an empty string', () => {
  const merged = mergeLlmCredentials(
    { deepseek: { apiKey: 'sk-vieja', model: 'deepseek-reasoner' } },
    { deepseek: { apiKey: '  sk-nueva  ', model: '' } },
  );

  assert.deepEqual(merged, { deepseek: { apiKey: 'sk-nueva' } });
});

test('mergeLlmCredentials removes the provider preference with "auto"', () => {
  const merged = mergeLlmCredentials({ provider: 'orcarouter' }, { provider: 'auto' });
  assert.equal(merged, null);
});

test('maskApiKey never reveals more than the last four characters', () => {
  assert.equal(maskApiKey(''), '');
  assert.equal(maskApiKey('abcd'), '••••');
  assert.equal(maskApiKey('sk-1234567890abcdef'), '••••cdef');
  assert.ok(!maskApiKey('sk-1234567890abcdef').includes('1234567890'));
});

test('getLlmCredentials falls back to env vars when nothing is stored', async () => {
  await withEnv(
    {
      DEEPSEEK_API_KEY: 'sk-env',
      ORCAROUTER_API_KEY: undefined,
      LLM_API_KEY: undefined,
      LLM_PROVIDER: 'deepseek',
      LLM_MODEL: 'deepseek-chat',
      ORCAROUTER_MODEL: undefined,
    },
    async () => {
      const creds = await getLlmCredentials();
      assert.equal(creds.provider, 'deepseek');
      assert.deepEqual(creds.deepseek, {
        apiKey: 'sk-env',
        model: 'deepseek-chat',
        source: 'env',
      });
      assert.equal(creds.orcarouter.apiKey, '');
      assert.equal(creds.orcarouter.source, 'none');
      assert.equal(creds.orcarouter.model, DEFAULT_LLM_MODELS.orcarouter);
    },
  );
});

test('getLlmCredentials defaults to "auto" when LLM_PROVIDER is unknown', async () => {
  await withEnv(
    { LLM_PROVIDER: 'algo-raro', DEEPSEEK_API_KEY: 'sk-env', ORCAROUTER_API_KEY: 'orca-env' },
    async () => {
      const creds = await getLlmCredentials();
      assert.equal(creds.provider, 'auto');
      assert.equal(creds.deepseek.source, 'env');
      assert.equal(creds.orcarouter.source, 'env');
    },
  );
});
