/**
 * Coach proxy: the only server route the app calls. The client POSTs ONLY
 * the aggregate summary object to /api/coach (see src/coach/summary.ts);
 * this server validates it, forwards it to the configured Muse Spark
 * endpoint, and returns the coaching message.
 *
 * - Key and base URL come from environment variables only (see .env.example).
 * - Timeout and cooldown come from src/config/config.default.json.
 * - Cooldown starts after every proxied call, success or failure.
 * - Failures and fallbacks are logged to the console only, never with
 *   request values. Nothing is written to disk or sent anywhere else.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCoachSummary } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BODY_LIMIT = 100 * 1024;

function loadCoachConfig() {
  const raw = readFileSync(path.join(ROOT, 'src', 'config', 'config.default.json'), 'utf-8');
  const cfg = JSON.parse(raw);
  return {
    timeoutMs: cfg.coach.timeout_ms,
    cooldownMs: cfg.coach.cooldown_ms,
    maxReplyChars: cfg.coach.max_reply_chars,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

/** Accept the common message shapes without ever logging the payload. */
function extractMessage(upstream) {
  if (typeof upstream !== 'object' || upstream === null) return null;
  if (typeof upstream.message === 'string' && upstream.message.length > 0) return upstream.message;
  if (typeof upstream.text === 'string' && upstream.text.length > 0) return upstream.text;
  const choices = upstream.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const content = choices[0]?.message?.content ?? choices[0]?.text;
    if (typeof content === 'string' && content.length > 0) return content;
  }
  return null;
}

/**
 * What the model is asked to do with the summary. Sent with every request;
 * the client never sends anything but the summary, and the server never
 * sends anything but this instruction plus that summary.
 */
export const PROMPT_INSTRUCTION =
  'You are a kind movement coach. Reply with 1-2 encouraging sentences. ' +
  'Suggest ONE small adjustment. Do not diagnose any condition. ' +
  'Do not tell the person to push through pain. Do not use failure language.';

/**
 * System 1 labels never reach the model verbatim: they are neutral phrases
 * in the forwarded summary, so the reply cannot parrot diagnostic wording.
 */
const NEUTRAL_SIGNALS = {
  stall: 'paused',
  jitter: 'unsteady',
  compensation: 'shoulder lifting',
  failed_range: 'reached partway',
  drop: 'arm lowering',
};

function neutralizeSummary(summary) {
  const copy = JSON.parse(JSON.stringify(summary));
  const signal = copy?.system1?.top_signal;
  if (typeof signal === 'string' && signal in NEUTRAL_SIGNALS) {
    copy.system1.top_signal = NEUTRAL_SIGNALS[signal];
  }
  return copy;
}

const BANNED_REPLY = ['fail', 'push through', 'pain', 'diagnos'];

/** First reply problem found, else null. Only the reason name is ever logged. */
function replyProblem(message, maxChars) {
  if (message.length > maxChars) return 'reply_too_long';
  const sentences = message
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length > 2) return 'reply_too_many_sentences';
  const lower = message.toLowerCase();
  if (BANNED_REPLY.some((word) => lower.includes(word))) return 'reply_banned_word';
  return null;
}

export function createCoachServer({ apiKey, baseUrl, timeoutMs, cooldownMs, maxReplyChars, fetchImpl = fetch }) {
  let lastCallAt = 0;
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/coach') {
      json(res, 404, { error: 'not found' });
      return;
    }
    let raw;
    try {
      raw = await readBody(req);
    } catch {
      console.error({ event: 'coach_failure', reason: 'body too large' });
      json(res, 413, { error: 'body too large' });
      return;
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      console.error({ event: 'coach_reject', reason: 'invalid json' });
      json(res, 400, { error: 'invalid json' });
      return;
    }
    const check = validateCoachSummary(body);
    if (!check.ok) {
      console.error({ event: 'coach_reject', reason: check.error });
      json(res, 400, { error: check.error });
      return;
    }
    if (Date.now() - lastCallAt < cooldownMs) {
      json(res, 429, { error: 'cooling down' });
      return;
    }
    lastCallAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstream = await fetchImpl(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ instruction: PROMPT_INSTRUCTION, summary: neutralizeSummary(body) }),
        signal: controller.signal,
      });
      if (!upstream.ok) throw new Error(`upstream status ${upstream.status}`);
      const message = extractMessage(await upstream.json());
      if (!message) throw new Error('upstream answered without a message');
      const problem = replyProblem(message, maxReplyChars);
      if (problem) {
        // Guarded reply: a 502-style error the client turns into the local
        // fallback. Only the reason name is logged, never the reply.
        console.error({ event: 'coach_reject', reason: problem });
        json(res, 502, { error: 'coach reply rejected' });
        return;
      }
      json(res, 200, { message });
    } catch (e) {
      console.error({ event: 'coach_failure', reason: e instanceof Error ? e.name : 'unknown' });
      const timedOut = e instanceof Error && e.name === 'AbortError';
      json(res, timedOut ? 504 : 502, { error: timedOut ? 'coach timed out' : 'coach failed' });
    } finally {
      clearTimeout(timer);
    }
  });
  return server;
}

const invokedAsScript = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  if (!process.env.MUSE_SPARK_API_KEY || !process.env.MUSE_SPARK_BASE_URL) {
    console.error({ event: 'coach_config', reason: 'missing env' });
    process.exit(1);
  }
  const { timeoutMs, cooldownMs, maxReplyChars } = loadCoachConfig();
  const server = createCoachServer({
    apiKey: process.env.MUSE_SPARK_API_KEY,
    baseUrl: process.env.MUSE_SPARK_BASE_URL,
    timeoutMs,
    cooldownMs,
    maxReplyChars,
  });
  const port = Number(process.env.COACH_PORT ?? 8787);
  server.listen(port);
}
