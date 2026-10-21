const STATE_KEY = 'kior:selfbot:v1';
const LOCK_KEY  = 'kior:selfbot-lock:v1';

export const DEFAULT_STATE = {
  tokens: [],          // [{ id, token, label, message, channelIds, intervalSeconds, status:'idle'|'running'|'stopped', currentIndex:0, sentCount:0, nextSendAt:null, logs:[] }]
};

export async function redisCommand(...command) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Persistent storage is not configured. Add Upstash Redis env vars.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Redis request failed (${response.status}).`);
  return payload.result;
}

export async function readState() {
  const raw = await redisCommand('GET', STATE_KEY);
  if (!raw) return { ...DEFAULT_STATE, tokens: [] };
  try {
    const parsed = JSON.parse(raw);
    return { tokens: [], ...parsed };
  } catch {
    return { ...DEFAULT_STATE, tokens: [] };
  }
}

export async function writeState(state) {
  await redisCommand('SET', STATE_KEY, JSON.stringify(state));
}

export function addTokenLog(token, entry) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  token.logs = [item, ...(token.logs || [])].slice(0, 100);
  return item;
}

export async function acquireSendLock() {
  const value  = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const result = await redisCommand('SET', LOCK_KEY, value, 'NX', 'EX', 55);
  return result ? value : null;
}
