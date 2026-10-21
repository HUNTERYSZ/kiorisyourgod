import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../../lib/auth';
import { addTokenLog, readState, writeState } from '../../../../lib/store';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  try {
    const body  = await request.json().catch(() => ({}));
    const { id } = body; // token entry id, or omit to start all idle ones
    const state = await readState();

    let started = 0;
    state.tokens = (state.tokens || []).map(t => {
      if (id && t.id !== id) return t;
      if (t.status === 'running') return t;
      if (!t.token || !t.message || !(t.channelIds || []).length) return t;
      started++;
      addTokenLog(t, { status: 'info', detail: `Started — will send to ${t.channelIds.length} channel(s) every ${t.intervalSeconds}s.` });
      return { ...t, status: 'running', currentIndex: 0, sentCount: 0, nextSendAt: new Date().toISOString() };
    });

    if (!started) return NextResponse.json({ error: 'Nothing to start. Make sure tokens have a message and channel IDs.' }, { status: 400 });
    await writeState(state);
    return NextResponse.json({ ok: true, started });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not start.' }, { status: 500 });
  }
}
