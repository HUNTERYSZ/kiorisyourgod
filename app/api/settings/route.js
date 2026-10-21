import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../lib/auth';
import { readState, writeState } from '../../../lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  try {
    const state = await readState();
    // Strip raw tokens from response for safety – send masked version only
    const safe = {
      tokens: (state.tokens || []).map(t => ({
        ...t,
        token: t.token ? `${t.token.slice(0, 10)}...` : '',
        _hasToken: !!t.token,
      })),
    };
    return NextResponse.json(safe, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not load settings.' }, { status: 500 });
  }
}

// PUT /api/settings  — add or update a token entry
export async function PUT(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  try {
    const body  = await request.json();
    const state = await readState();

    if (body.action === 'add') {
      const { token, label, message, channelIds, intervalSeconds } = body;
      if (!token || !token.trim()) return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
      if (!message || !message.trim()) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
      const ids = (channelIds || []).map(id => String(id).trim()).filter(id => /^\d{17,20}$/.test(id));
      if (!ids.length) return NextResponse.json({ error: 'At least one valid channel ID is required.' }, { status: 400 });
      const entry = {
        id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        token: token.trim(),
        label: (label || '').trim() || `Token ${(state.tokens || []).length + 1}`,
        message: message.trim(),
        channelIds: ids,
        intervalSeconds: Math.max(30, Math.min(3600, Number(intervalSeconds) || 120)),
        status: 'idle',
        currentIndex: 0,
        sentCount: 0,
        nextSendAt: null,
        logs: [],
      };
      state.tokens = [...(state.tokens || []), entry];
      await writeState(state);
      return NextResponse.json({ ok: true, id: entry.id }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (body.action === 'update') {
      const { id, message, channelIds, intervalSeconds, label } = body;
      state.tokens = (state.tokens || []).map(t => {
        if (t.id !== id) return t;
        const ids = channelIds
          ? (channelIds || []).map(c => String(c).trim()).filter(c => /^\d{17,20}$/.test(c))
          : t.channelIds;
        return {
          ...t,
          label: label !== undefined ? label.trim() : t.label,
          message: message !== undefined ? message.trim() : t.message,
          channelIds: ids,
          intervalSeconds: intervalSeconds !== undefined
            ? Math.max(30, Math.min(3600, Number(intervalSeconds) || 120))
            : t.intervalSeconds,
        };
      });
      await writeState(state);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'remove') {
      state.tokens = (state.tokens || []).filter(t => t.id !== body.id);
      await writeState(state);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not save.' }, { status: 500 });
  }
}
