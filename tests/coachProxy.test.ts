import { describe, expect, it } from 'vitest';
import { validateCoachSummary } from '../server/validate.mjs';
import { createCoachServer } from '../server/proxy.mjs';

const GOOD_BODY = {
  task: 'wash your face with the cloth',
  angles: { r_elbow_flexion: { min: 80, max: 100, mean: 90 } },
  duration_s: 2,
  reached: false,
  held_s: 0,
  system1: { state: 'hesitating', top_signal: 'stall' },
};

describe('validateCoachSummary', () => {
  it('accepts the aggregate summary shape', () => {
    expect(validateCoachSummary(GOOD_BODY)).toEqual({ ok: true });
  });

  it('accepts a moving_well state with no top_signal', () => {
    expect(
      validateCoachSummary({ ...GOOD_BODY, system1: { state: 'moving_well' } }),
    ).toEqual({ ok: true });
  });

  it('rejects an unexpected top-level field', () => {
    expect(validateCoachSummary({ ...GOOD_BODY, joints: {} }).ok).toBe(false);
  });

  it('rejects image data smuggled in an extra field', () => {
    const blob = `data:image/png;base64,${'A'.repeat(600)}`;
    expect(validateCoachSummary({ ...GOOD_BODY, photo: blob }).ok).toBe(false);
  });

  it('rejects a data: URI in the task', () => {
    expect(validateCoachSummary({ ...GOOD_BODY, task: 'data:text/plain,hi' }).ok).toBe(false);
  });

  it('rejects a long base64-looking angle name', () => {
    expect(
      validateCoachSummary({ ...GOOD_BODY, angles: { ['x'.repeat(10) + 'A'.repeat(600)]: { min: 1, max: 1, mean: 1 } } }).ok,
    ).toBe(false);
  });

  it('rejects a bad top_signal', () => {
    expect(
      validateCoachSummary({ ...GOOD_BODY, system1: { state: 'struggling', top_signal: 'nope' } }).ok,
    ).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(validateCoachSummary([GOOD_BODY]).ok).toBe(false);
  });

  it('rejects a non-boolean reached and an out-of-range held_s', () => {
    expect(validateCoachSummary({ ...GOOD_BODY, reached: 'yes' }).ok).toBe(false);
    expect(validateCoachSummary({ ...GOOD_BODY, held_s: 601 }).ok).toBe(false);
    expect(validateCoachSummary({ ...GOOD_BODY, held_s: -1 }).ok).toBe(false);
    expect(validateCoachSummary({ ...GOOD_BODY, reached: true, held_s: 12.5 }).ok).toBe(true);
  });
});

function listen(server: import('node:http').Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function postJson(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${url}/api/coach`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

describe('coach proxy', () => {
  it('forwards a valid summary and returns the message', async () => {
    const server = createCoachServer({
      apiKey: 'test-key',
      baseUrl: 'https://coach.example/v1',
      timeoutMs: 5000,
      cooldownMs: 60000,
      maxReplyChars: 300,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ message: 'Take your time.' }),
      })) as unknown as typeof fetch,
    });
    const url = await listen(server);
    try {
      const { status, json } = await postJson(url, GOOD_BODY);
      expect(status).toBe(200);
      expect(json).toEqual({ message: 'Take your time.' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects a body carrying image data without calling upstream', async () => {
    let upstreamCalls = 0;
    const server = createCoachServer({
      apiKey: 'test-key',
      baseUrl: 'https://coach.example/v1',
      timeoutMs: 5000,
      cooldownMs: 60000,
      maxReplyChars: 300,
      fetchImpl: (async () => {
        upstreamCalls += 1;
        return { ok: true, json: async () => ({ message: 'hi' }) };
      }) as unknown as typeof fetch,
    });
    const url = await listen(server);
    try {
      const blob = `data:image/png;base64,${'B'.repeat(600)}`;
      const { status } = await postJson(url, { ...GOOD_BODY, photo: blob });
      expect(status).toBe(400);
      expect(upstreamCalls).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('sends the instruction plus only the summary upstream, no image data', async () => {
    let sentBody = '';
    const server = createCoachServer({
      apiKey: 'test-key',
      baseUrl: 'https://coach.example/v1',
      timeoutMs: 5000,
      cooldownMs: 60000,
      maxReplyChars: 300,
      fetchImpl: (async (_url: unknown, init?: { body?: unknown }) => {
        sentBody = String(init?.body ?? '');
        return { ok: true, json: async () => ({ message: 'Take your time.' }) };
      }) as unknown as typeof fetch,
    });
    const url = await listen(server);
    try {
      expect((await postJson(url, GOOD_BODY)).status).toBe(200);
      const upstream = JSON.parse(sentBody) as Record<string, unknown>;
      expect(Object.keys(upstream).sort()).toEqual(['instruction', 'summary']);
      expect(upstream['summary']).toEqual({
        ...GOOD_BODY,
        system1: { state: 'hesitating', top_signal: 'paused' },
      });
      expect(typeof upstream['instruction']).toBe('string');
      expect(upstream['instruction'] as string).toContain('ONE small adjustment');
      expect(sentBody).not.toMatch(/data:|base64/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('cools down after a proxied call', async () => {
    const server = createCoachServer({
      apiKey: 'test-key',
      baseUrl: 'https://coach.example/v1',
      timeoutMs: 5000,
      cooldownMs: 60000,
      maxReplyChars: 300,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ message: 'Take your time.' }),
      })) as unknown as typeof fetch,
    });
    const url = await listen(server);
    try {
      expect((await postJson(url, GOOD_BODY)).status).toBe(200);
      expect((await postJson(url, GOOD_BODY)).status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function guardedServer(reply: string) {
    return createCoachServer({
      apiKey: 'test-key',
      baseUrl: 'https://coach.example/v1',
      timeoutMs: 5000,
      cooldownMs: 0,
      maxReplyChars: 300,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ message: reply }),
      })) as unknown as typeof fetch,
    });
  }

  async function guardedStatus(reply: string): Promise<number> {
    const server = guardedServer(reply);
    const url = await listen(server);
    try {
      return (await postJson(url, GOOD_BODY)).status;
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('replaces a reply containing "push through" with a 502 the client turns into the fallback', async () => {
    expect(await guardedStatus('Keep going, push through the burn.')).toBe(502);
  });

  it('rejects replies that are too long, too many sentences, or carry failure language', async () => {
    expect(await guardedStatus('Take your time. '.repeat(20).trim())).toBe(502);
    expect(await guardedStatus('Nice. Keep going. You can do it.')).toBe(502);
    expect(await guardedStatus('Do not worry about failure.')).toBe(502);
    expect(await guardedStatus('Take your time. Try slowing down.')).toBe(200);
  });

  it('maps System 1 labels to neutral phrases before they go upstream', async () => {
    let sentBody = '';
    const server = createCoachServer({
      apiKey: 'test-key',
      baseUrl: 'https://coach.example/v1',
      timeoutMs: 5000,
      cooldownMs: 0,
      maxReplyChars: 300,
      fetchImpl: (async (_url: unknown, init?: { body?: unknown }) => {
        sentBody = String(init?.body ?? '');
        return { ok: true, json: async () => ({ message: 'Take your time.' }) };
      }) as unknown as typeof fetch,
    });
    const url = await listen(server);
    try {
      const body = { ...GOOD_BODY, system1: { state: 'hesitating', top_signal: 'stall' } };
      expect((await postJson(url, body)).status).toBe(200);
      const upstream = JSON.parse(sentBody) as { summary: { system1: { top_signal: string } } };
      expect(upstream.summary.system1.top_signal).toBe('paused');
      expect(sentBody).not.toContain('stall');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('maps the drop signal to a neutral phrase before it goes upstream', async () => {
    let sentBody = '';
    const server = createCoachServer({
      apiKey: 'test-key',
      baseUrl: 'https://coach.example/v1',
      timeoutMs: 5000,
      cooldownMs: 0,
      maxReplyChars: 300,
      fetchImpl: (async (_url: unknown, init?: { body?: unknown }) => {
        sentBody = String(init?.body ?? '');
        return { ok: true, json: async () => ({ message: 'Take your time.' }) };
      }) as unknown as typeof fetch,
    });
    const url = await listen(server);
    try {
      const body = { ...GOOD_BODY, system1: { state: 'struggling', top_signal: 'drop' } };
      expect((await postJson(url, body)).status).toBe(200);
      const upstream = JSON.parse(sentBody) as { summary: { system1: { top_signal: string } } };
      expect(upstream.summary.system1.top_signal).toBe('arm lowering');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
