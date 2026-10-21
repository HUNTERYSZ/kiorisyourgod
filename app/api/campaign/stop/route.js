import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../../lib/auth';
import { addTokenLog, readState, writeState } from '../../../../lib/store';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  try {
    const body  = await request.json().catch(() => ({}));
    const { id } = body;
    const state = await readState();
    state.tokens = (state.tokens || []).map(t => {
      if (id && t.id !== id) return t;
      if (t.status !== 'running') return t;
      addTokenLog(t, { status: 'warning', detail: 'Stopped manually.' });
      return { ...t, status: 'stopped', nextSendAt: null };
    });
    await writeState(state);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not stop.' }, { status: 500 });
  }
}
