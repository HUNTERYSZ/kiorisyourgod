'use client';
import { useCallback, useEffect, useState } from 'react';

const INTERVALS = [
  { label: '30s',  value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
];

function dateText(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function relText(v) {
  if (!v) return '—';
  const s = Math.max(0, Math.ceil((new Date(v) - Date.now()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.ceil(s / 60)}m`;
}

const EMPTY_FORM = { token: '', label: '', message: '', channelInput: '', channelIds: [], intervalSeconds: 120 };

export default function Home() {
  const [auth, setAuth]       = useState('checking');
  const [password, setPassword] = useState('');
  const [tokens, setTokens]   = useState([]);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [busy, setBusy]       = useState(false);
  const [notice, setNotice]   = useState({ msg: '', type: 'info' });
  const [expandedLogs, setExpandedLogs] = useState({});
  const [gtModal, setGtModal]   = useState(false);
  const [gtStep, setGtStep]     = useState('form'); // 'form' | 'mfa' | 'done'
  const [gtEmail, setGtEmail]   = useState('');
  const [gtPass, setGtPass]     = useState('');
  const [gtMfa, setGtMfa]       = useState('');
  const [gtTicket, setGtTicket] = useState('');
  const [gtToken, setGtToken]   = useState('');
  const [gtBusy, setGtBusy]     = useState(false);
  const [gtErr, setGtErr]       = useState('');
  const [gtCopied, setGtCopied] = useState(false);

  function openGtModal() { setGtModal(true); setGtStep('form'); setGtEmail(''); setGtPass(''); setGtMfa(''); setGtToken(''); setGtErr(''); setGtCopied(false); }
  function closeGtModal() { setGtModal(false); }

  async function gtSubmitLogin() {
    setGtBusy(true); setGtErr('');
    try {
      const r = await fetch('/api/gettoken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: gtEmail, password: gtPass }),
      });
      const d = await r.json();
      if (r.status === 429 && d.captcha) {
        setGtErr('');
        setGtStep('popup');
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Login failed.');
      if (d.mfa) { setGtTicket(d.ticket); setGtStep('mfa'); }
      else { setGtToken(d.token); setGtStep('done'); }
    } catch (e) { setGtErr(e.message); }
    finally { setGtBusy(false); }
  }

  function gtOpenPopup() {
    const w = 500, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open(
      'https://discord.com/login',
      'discord_login',
      `width=${w},height=${h},left=${left},top=${top},toolbar=0,menubar=0,location=0`
    );
    setGtStep('popup_console');
  }

  async function gtSubmitMfa() {
    setGtBusy(true); setGtErr('');
    try {
      const r = await fetch('/api/gettoken/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: gtMfa, ticket: gtTicket }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'MFA failed.');
      setGtToken(d.token); setGtStep('done');
    } catch (e) { setGtErr(e.message); }
    finally { setGtBusy(false); }
  }

  function gtCopy() {
    navigator.clipboard.writeText(gtToken).then(() => { setGtCopied(true); setTimeout(() => setGtCopied(false), 2000); });
  }

  function gtUseToken() {
    setForm(f => ({ ...f, token: gtToken }));
    closeGtModal();
    showNotice('Token pasted into the form!', 'success');
  }

  const showNotice = (msg, type = 'info') => setNotice({ msg, type });

  const loadState = useCallback(async (quiet = false) => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      if (r.status === 401) {
        setAuth(current => {
          if (current === 'checking') return 'logged-out';
          showNotice('Your session could not be verified. Refresh and sign in again.', 'error');
          return current;
        });
        return false;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Load failed.');
      setTokens(d.tokens || []);
      setAuth('logged-in');
    } catch (e) {
      // A successful login should still reveal the dashboard if the first
      // state read fails, so the user can see the storage error and retry.
      setAuth(cur => cur === 'checking' ? 'error' : 'logged-in');
      if (!quiet) showNotice(e.message, 'error');
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    loadState();
    const t = setInterval(() => loadState(true), 8000);
    return () => clearInterval(t);
  }, [loadState]);


  async function login(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Login failed.');
      setPassword('');
      // Switch views immediately after the cookie is set. If Redis is
      // unavailable, the dashboard can show the actionable storage error.
      setAuth('logged-in');
      await loadState();
      showNotice('Welcome to @Kior Selfbot.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    setAuth('logged-out');
    setTokens([]);
  }

  function addChannelToForm() {
    const id = form.channelInput.trim();
    if (!/^\d{17,20}$/.test(id)) { showNotice('Enter a valid Discord channel ID (17–20 digits).', 'error'); return; }
    if (form.channelIds.includes(id)) { showNotice('Already added.', 'error'); return; }
    setForm(f => ({ ...f, channelIds: [...f.channelIds, id], channelInput: '' }));
  }

  async function addToken() {
    if (!form.token.trim())   { showNotice('Token is required.', 'error'); return; }
    if (!form.message.trim()) { showNotice('Message is required.', 'error'); return; }
    if (!form.channelIds.length) { showNotice('Add at least one channel ID.', 'error'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          token: form.token,
          label: form.label,
          message: form.message,
          channelIds: form.channelIds,
          intervalSeconds: form.intervalSeconds,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save.');
      setForm(EMPTY_FORM);
      await loadState();
      showNotice('Token added and saved.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function removeToken(id) {
    if (!confirm('Remove this token entry?')) return;
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id }),
    });
    await loadState(true);
  }

  async function startToken(id) {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not start.');
      await loadState(true);
      showNotice('Started.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function stopToken(id) {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not stop.');
      await loadState(true);
      showNotice('Stopped.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function startAll() {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not start all.');
      await loadState(true);
      showNotice(`Started ${d.started} token(s).`, 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function stopAll() {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not stop all.');
      await loadState(true);
      showNotice('All stopped.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  if (auth === 'checking') {
    return <main className="center-screen"><div className="loader-orbit" /><p>Connecting…</p></main>;
  }

  if (auth !== 'logged-in') {
    return (
      <main className="login-shell">
        <div className="space-glow" />
        <section className="login-card glass-card">
          <div className="logo-frame"><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/file_00000000d9b0820d80c2943934712d0c-9HSXp5TxRN14t743Og6eZkbZOynHjA.png" alt="Kior" /></div>
          <div className="eyebrow"><span className="tiny-star">✦</span> PRIVATE CONTROL ROOM</div>
          <h1><span>@</span>Kior</h1>
          <p className="login-copy">Self-account token spammer. Authorized use only.</p>
          {notice.msg && <div className={`notice ${notice.type}`}>{notice.msg}</div>}
          <form onSubmit={login} className="login-form">
            <label htmlFor="pw">Dashboard password</label>
            <input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
            <button className="button button-primary button-wide" type="submit" disabled={busy}>
              {busy ? 'Opening…' : 'Enter'} <span>↗</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  const runningCount = tokens.filter(t => t.status === 'running').length;

  return (
    <main className="app-shell">
      <div className="space-glow glow-one" /><div className="space-glow glow-two" />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-logo"><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/file_00000000d9b0820d80c2943934712d0c-9HSXp5TxRN14t743Og6eZkbZOynHjA.png" alt="" /></div>
          <div>
            <div className="brand-name"><span>@</span>Kior</div>
            <div className="brand-subtitle">SELFBOT CONTROL ROOM</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="connection-pill"><span className="live-dot" /> {runningCount} RUNNING</div>
          <button className="button button-ghost button-small" onClick={logout}>Log out</button>
        </div>
      </header>

      {notice.msg && (
        <div className={`notice page-notice ${notice.type}`}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice({ msg: '', type: 'info' })} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* GLOBAL CONTROLS */}
      <section className="global-controls glass-card">
        <div className="gc-left">
          <div className="section-kicker">GLOBAL CONTROLS</div>
          <p>{tokens.length} token(s) saved · {runningCount} running</p>
        </div>
        <div className="gc-right">
          <button className="button button-primary" onClick={startAll} disabled={busy}>▶ Start All</button>
          <button className="button button-danger"  onClick={stopAll}  disabled={busy}>■ Stop All</button>
        </div>
      </section>

      {/* ADD TOKEN FORM */}
      <section className="panel glass-card add-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">ADD TOKEN</div>
            <h2>New selfbot entry</h2>
          </div>
          <div className="heading-icon">✧</div>
        </div>

        <div className="add-grid">
          <div className="field-col">
            <label className="field-label" htmlFor="tok-token">User Token</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input id="tok-token" type="password" className="field-input" value={form.token}
                onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
                placeholder="Your Discord user account token" style={{ flex: 1 }} />
              <button className="button button-secondary button-small" type="button" onClick={openGtModal} style={{ whiteSpace: 'nowrap' }}>
                🔑 GET TOKEN
              </button>
            </div>
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="tok-label">Label (optional)</label>
            <input id="tok-label" type="text" className="field-input" value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Main account" />
          </div>
        </div>

        <label className="field-label" htmlFor="tok-msg">Message</label>
        <textarea id="tok-msg" className="message-box" rows={4} maxLength={2000}
          value={form.message}
          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
          placeholder="Message to send to every channel…" />
        <div className="field-meta"><span /><span>{form.message.length}/2000</span></div>

        <label className="field-label">Interval</label>
        <div className="interval-pills">
          {INTERVALS.map(opt => (
            <button key={opt.value}
              className={`pill ${form.intervalSeconds === opt.value ? 'pill-active' : ''}`}
              onClick={() => setForm(f => ({ ...f, intervalSeconds: opt.value }))}>
              {opt.label}
            </button>
          ))}
        </div>

        <label className="field-label">Channel IDs</label>
        <div className="channel-add-row">
          <input className="field-input" value={form.channelInput}
            onChange={e => setForm(f => ({ ...f, channelInput: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChannelToForm(); }}}
            inputMode="numeric" placeholder="123456789012345678" />
          <button className="button button-secondary" onClick={addChannelToForm}>+ Add</button>
        </div>

        {form.channelIds.length > 0 && (
          <div className="channel-tags">
            {form.channelIds.map(id => (
              <span key={id} className="tag">
                #{id}
                <button onClick={() => setForm(f => ({ ...f, channelIds: f.channelIds.filter(c => c !== id) }))}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="button-row" style={{ marginTop: '1.5rem' }}>
          <button className="button button-primary" onClick={addToken} disabled={busy}>
            <span>＋</span> Add Token
          </button>
        </div>
      </section>

      {/* TOKEN QUEUE */}
      <section className="panel glass-card queue-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">TOKEN QUEUE</div>
            <h2>Active entries</h2>
          </div>
          <div className="count-badge">{tokens.length}</div>
        </div>

        {tokens.length === 0 ? (
          <div className="empty-state">
            <div className="empty-orbit">✧</div>
            <strong>No tokens yet</strong>
            <p>Add a token above to get started.</p>
          </div>
        ) : tokens.map(t => (
          <div key={t.id} className={`token-card ${t.status === 'running' ? 'tc-running' : t.status === 'stopped' ? 'tc-stopped' : ''}`}>
            <div className="tc-header">
              <div className="tc-info">
                <div className="tc-label">{t.label}</div>
                <div className="tc-token-masked">{t._hasToken ? '••••••••••…' : '(no token)'}</div>
              </div>
              <div className="tc-status-badge" data-status={t.status}>{(t.status || 'idle').toUpperCase()}</div>
            </div>

            <div className="tc-body">
              <div className="tc-row">
                <span className="tc-key">Message</span>
                <span className="tc-val tc-msg">{t.message || '—'}</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Channels</span>
                <span className="tc-val">{(t.channelIds || []).join(', ') || '—'}</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Interval</span>
                <span className="tc-val">{t.intervalSeconds}s</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Sent</span>
                <span className="tc-val">{t.sentCount || 0}</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Next send</span>
                <span className="tc-val">{t.status === 'running' ? `${relText(t.nextSendAt)} · ${dateText(t.nextSendAt)}` : '—'}</span>
              </div>
            </div>

            <div className="tc-actions">
              {t.status !== 'running'
                ? <button className="button button-primary button-small" onClick={() => startToken(t.id)} disabled={busy}>▶ Start</button>
                : <button className="button button-danger button-small"  onClick={() => stopToken(t.id)}  disabled={busy}>■ Stop</button>
              }
              <button className="button button-ghost button-small"
                onClick={() => setExpandedLogs(x => ({ ...x, [t.id]: !x[t.id] }))}>
                {expandedLogs[t.id] ? 'Hide logs' : 'Logs'}
              </button>
              <button className="button button-ghost button-small remove-btn" onClick={() => removeToken(t.id)}>Remove</button>
            </div>

            {expandedLogs[t.id] && (
              <div className="tc-logs">
                {!(t.logs || []).length
                  ? <div className="logs-empty">No activity yet.</div>
                  : t.logs.map(log => (
                    <div key={log.id} className={`log-row log-${log.status}`}>
                      <span className="log-time">{dateText(log.timestamp)}</span>
                      <span className="log-detail">{log.detail}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        ))}
      </section>

      <footer className="app-footer">
        <span>✦ @KIOR CONTROL ROOM</span>
        <span>Use only on accounts and channels you own.</span>
      </footer>

      {/* GET TOKEN MODAL */}
      {gtModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            background: 'rgba(15,10,30,0.95)',
            border: '1px solid rgba(237,66,69,0.3)',
            borderRadius: '1.25rem',
            padding: '2rem',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 0 60px rgba(237,66,69,0.15)',
            position: 'relative',
          }}>
            {/* Close */}
            <button onClick={closeGtModal} style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'transparent', border: 'none', color: '#aaa',
              fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
            }}>×</button>

            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔑</div>
              <div style={{ color: '#ED4245', fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.75rem', marginBottom: '0.25rem' }}>GET TOKEN</div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.2rem' }}>
                {gtStep === 'form' && 'Login with Discord'}
                {gtStep === 'mfa'  && '2FA Verification'}
                {gtStep === 'done' && 'Token Retrieved ✓'}
              </div>
            </div>

            {gtErr && (
              <div style={{ background: 'rgba(237,66,69,0.15)', border: '1px solid rgba(237,66,69,0.4)', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: '#ff6b6b', fontSize: '0.85rem' }}>
                {gtErr}
              </div>
            )}

            {gtStep === 'form' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>EMAIL</label>
                  <input type="email" className="field-input" value={gtEmail} onChange={e => setGtEmail(e.target.value)}
                    placeholder="your@email.com" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>PASSWORD</label>
                  <input type="password" className="field-input" value={gtPass} onChange={e => setGtPass(e.target.value)}
                    placeholder="Discord password" style={{ width: '100%' }}
                    onKeyDown={e => e.key === 'Enter' && gtSubmitLogin()} />
                </div>
                <button className="button button-primary" onClick={gtSubmitLogin} disabled={gtBusy} style={{ marginTop: '0.5rem' }}>
                  {gtBusy ? 'Logging in…' : 'Get My Token →'}
                </button>
              </div>
            )}

            {gtStep === 'mfa' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0 }}>Enter the 6-digit code from your authenticator app.</p>
                <input type="text" className="field-input" value={gtMfa} onChange={e => setGtMfa(e.target.value)}
                  placeholder="000000" maxLength={6} inputMode="numeric" style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3em', fontSize: '1.2rem' }}
                  onKeyDown={e => e.key === 'Enter' && gtSubmitMfa()} />
                <button className="button button-primary" onClick={gtSubmitMfa} disabled={gtBusy}>
                  {gtBusy ? 'Verifying…' : 'Verify →'}
                </button>
                <button className="button button-ghost button-small" onClick={() => setGtStep('form')}>← Back</button>
              </div>
            )}

            {gtStep === 'popup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                  Discord requires a captcha for this login. Open Discord's real login page in a popup — complete the captcha and log in normally, then extract your token using the console snippet.
                </p>
                <button className="button button-primary" onClick={gtOpenPopup}>
                  🌐 Open Discord Login
                </button>
                <button className="button button-ghost button-small" onClick={() => setGtStep('form')}>
                  ← Try credentials again
                </button>
              </div>
            )}

            {gtStep === 'popup_console' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                  After logging in to Discord in the popup, open its <strong style={{ color: '#fff' }}>DevTools console</strong> (F12) and paste this:
                </p>
                <div style={{
                  background: 'rgba(0,0,0,0.4)', borderRadius: '0.5rem',
                  padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem',
                  color: '#57f287', wordBreak: 'break-all', userSelect: 'all',
                  border: '1px solid rgba(87,242,135,0.2)',
                }}>
                  {`(webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken).exports.default.getToken()`}
                </div>
                <p style={{ color: '#aaa', fontSize: '0.82rem', margin: 0 }}>
                  Copy the token string it outputs, then paste it below.
                </p>
                <div>
                  <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>PASTE TOKEN HERE</label>
                  <input
                    type="text"
                    className="field-input"
                    value={gtToken}
                    onChange={e => setGtToken(e.target.value)}
                    placeholder="your.discord.token.here"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    className="button button-primary"
                    style={{ flex: 1 }}
                    disabled={!gtToken.trim()}
                    onClick={() => { if (gtToken.trim()) setGtStep('done'); }}
                  >
                    ✓ Use This Token
                  </button>
                </div>
                <button className="button button-ghost button-small" onClick={() => setGtStep('form')}>
                  ← Back
                </button>
              </div>
            )}

            {gtStep === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem',
                  padding: '1rem', position: 'relative',
                }}>
                  <div style={{ color: '#aaa', fontSize: '0.7rem', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>YOUR TOKEN</div>
                  <div style={{
                    fontFamily: 'monospace', fontSize: '0.8rem', color: '#fff',
                    wordBreak: 'break-all', userSelect: 'all',
                    lineHeight: 1.6,
                  }}>{gtToken}</div>
                </div>

                <div style={{
                  background: 'rgba(87,242,135,0.1)', border: '1px solid rgba(87,242,135,0.3)',
                  borderRadius: '0.5rem', padding: '0.75rem',
                  color: '#57f287', fontSize: '0.82rem', textAlign: 'center',
                }}>
                  ✓ Token retrieved successfully! Keep it safe — never share it.
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="button button-primary" onClick={gtCopy} style={{ flex: 1 }}>
                    {gtCopied ? '✓ Copied!' : '📋 Copy Token'}
                  </button>
                  <button className="button button-secondary" onClick={gtUseToken} style={{ flex: 1 }}>
                    ✦ Use Token
                  </button>
                </div>

                <button className="button button-ghost button-small" onClick={closeGtModal}>
                  ← Back to dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
