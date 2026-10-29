import { html, render, useState, useEffect, useRef, api, tones, useAppState, Logo, Keycap, CheckIcon, WarnIcon, CloseIcon, CopyIcon, Backdrop } from './lib.js';

const B = window.MurmurBinds;

const CARD = { borderRadius: '16px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' };
const H2 = { margin: 0, paddingLeft: '4px', fontSize: '13px', fontWeight: 600, letterSpacing: '0.01em', color: '#8F8F8F' };
const ROW_TITLE = { fontSize: '15px', fontWeight: 500, color: '#F5F5F5' };
const ROW_SUB = { fontSize: '13px', lineHeight: 1.45, color: '#8F8F8F' };
const DIVIDER = (ml = 20) => html`<div aria-hidden="true" style=${{ height: '1px', marginLeft: ml + 'px', background: 'rgba(255,255,255,0.06)' }}></div>`;

function SoftButton({ onClick, children, style, label, disabled }) {
  return html`<button type="button" class="lg lg-soft lg-btn lg-press" onClick=${onClick} aria-label=${label} disabled=${disabled}
    style=${{ height: '44px', padding: '0 20px', border: 0, borderRadius: '999px', color: '#F5F5F5', fontSize: '14px', fontWeight: 500, cursor: 'pointer', ...style }}>${children}</button>`;
}

function AccentButton({ onClick, children, t, disabled, style }) {
  return html`<button type="button" class="t3-btn" onClick=${onClick} disabled=${disabled}
    style=${{ height: '44px', padding: '0 20px', border: 0, borderRadius: '999px', background: t.accent, color: t.ink, boxShadow: `inset 0 1px rgba(255,255,255,0.16), 0 1px 2px ${t.a(0.24)}`, fontSize: '14px', fontWeight: 600, cursor: 'pointer', ...style }}>${children}</button>`;
}

function Radio({ on, t }) {
  return html`<span aria-hidden="true" style=${{ width: '20px', height: '20px', flex: 'none', boxSizing: 'border-box', borderRadius: '50%', border: on ? '0' : '1.5px solid rgba(255,255,255,0.3)', background: on ? t.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style=${{ width: '8px', height: '8px', borderRadius: '50%', background: on ? t.ink : 'transparent' }}></span></span>`;
}

function Switch({ on, label, onToggle, t }) {
  return html`
    <button type="button" role="switch" aria-checked=${on} aria-label=${label} onClick=${onToggle}
      style=${{ flex: 'none', width: '60px', height: '44px', border: 0, padding: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <span class="mm-track" style=${{ width: '44px', height: '26px', boxSizing: 'border-box', padding: '2px', borderRadius: '999px', background: on ? t.accent : 'rgba(255,255,255,0.18)', display: 'flex' }}>
        <span class="mm-knob" style=${{ width: '22px', height: '22px', borderRadius: '50%', background: on ? (t.ink === '#FFFFFF' ? '#FFFFFF' : '#000000') : '#A1A1A1', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transform: `translateX(${on ? 18 : 0}px)` }}></span>
      </span>
    </button>`;
}

// ---------- sidebar ----------

const NAV = [
  { id: 'transcripts', label: 'Transcripts', icon: (c) => html`<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke=${c} stroke-width="1.9" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"></path></svg>` },
  { id: 'shortcut', label: 'Shortcut', icon: (c) => html`<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke=${c} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"></rect><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17.5 10h.01M8 14h8"></path></svg>` },
  { id: 'models', label: 'Models', icon: (c) => html`<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke=${c} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"></path><path d="M4 7.5l8 4.5 8-4.5M12 12v9"></path></svg>` }
];

function Sidebar({ page, go, s, t }) {
  const dot = s.whisperState === 'ready' ? '#00D492' : s.whisperState === 'loading' ? '#FFB900' : s.whisperState === 'error' ? '#FF6467' : '#8F8F8F';
  return html`
    <aside class="lg" style=${{ flex: '0 0 224px', boxSizing: 'border-box', padding: '14px 10px 10px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div class="drag" style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 8px' }}>
        <${Logo} t=${t} />
        <div style=${{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style=${{ fontSize: '15px', fontWeight: 650, letterSpacing: '-0.012em', color: '#F1F3F7' }}>Murmur</span>
          <span style=${{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#A3A3A3' }}><span aria-hidden="true" style=${{ width: '7px', height: '7px', borderRadius: '50%', background: dot }}></span>${s.status}</span>
        </div>
      </div>
      <nav aria-label="Sections" style=${{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        ${NAV.map((n) => {
          const on = n.id === page;
          return html`
            <a href=${'#' + n.id} onClick=${(e) => { e.preventDefault(); go(n.id); }} aria-current=${on ? 'page' : undefined} class="mm-nav no-drag"
              style=${{ height: '44px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 12px', borderRadius: '9px', backgroundColor: on ? 'rgba(255,255,255,0.11)' : undefined, color: on ? '#F1F3F7' : '#D4D4D4', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
              ${n.icon(on ? t.text : '#A3A3A3')}
              ${n.label}
            </a>`;
        })}
      </nav>
      <div style=${{ flex: '1 1 auto' }}></div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '12.5px' }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style=${{ color: '#A3A3A3' }}>Model</span><span class="mono" style=${{ color: '#F1F3F7' }}>${s.modelName}</span></div>
        <div style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style=${{ color: '#A3A3A3' }}>Runs on</span><span style=${{ color: '#F1F3F7' }}>${s.runsOn}</span></div>
        <div style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}><span style=${{ color: '#A3A3A3' }}>Input</span><span style=${{ color: '#F1F3F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${s.inputLabel}</span></div>
      </div>
    </aside>`;
}

function Header({ title, children }) {
  return html`
    <header style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 8px 0 32px', flexWrap: 'wrap', flex: 'none' }}>
      <h1 class="drag" style=${{ margin: 0, flex: '1 1 auto', alignSelf: 'stretch', display: 'flex', alignItems: 'center', fontSize: '26px', lineHeight: 1.15, fontWeight: 650, letterSpacing: '-0.022em' }}>${title}</h1>
      ${children}
      <button type="button" class="lg lg-soft lg-btn lg-press" aria-label="Close window" onClick=${() => api.invoke('window:close')}
        style=${{ width: '44px', height: '44px', flex: 'none', border: 0, borderRadius: '50%', color: '#D4D4D4', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <${CloseIcon} />
      </button>
    </header>`;
}

// ---------- Transcripts ----------

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function Transcripts({ s, t }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    api.invoke('history').then(setItems);
    return api.on('history', setItems);
  }, []);

  const copy = (r) => {
    api.invoke('history:copy', r.id);
    clearTimeout(timer.current);
    setCopied(r.id);
    timer.current = setTimeout(() => setCopied(null), 1600);
  };

  const needle = q.trim().toLowerCase();
  const shown = items.filter((r) => !needle || (r.text + ' ' + r.target).toLowerCase().includes(needle));
  const groups = [];
  for (const r of shown) {
    const label = dayLabel(r.ts);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) groups.push((g = { label, rows: [] }));
    g.rows.push(r);
  }
  const combo = s.config.combo;
  const tap = s.config.mode === 'tap';

  return html`
    <${Header} title="Transcripts">
      <label class="lg lg-soft lg-btn" style=${{ height: '44px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px 0 14px', borderRadius: '999px', cursor: 'text' }}>
        <span class="mm-sr">Search transcripts</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1A1" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>
        <input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Search"
          style=${{ width: '180px', height: '40px', padding: 0, border: 0, outline: 'none', background: 'transparent', color: '#F5F5F5', fontSize: '14px' }} />
      </label>
    <//>
    <div style=${{ boxSizing: 'border-box', maxWidth: '760px', padding: '24px 24px 24px 32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <section aria-label="How to dictate" style=${{ ...CARD, display: 'flex', flexDirection: 'column', gap: '16px', padding: '28px' }}>
        <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          ${combo.map((k) => html`<${Keycap} label=${k} pad=${k === 'Space' ? '0 36px' : '0 14px'} />`)}
        </div>
        <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h2 style=${{ margin: 0, fontSize: '22px', lineHeight: 1.2, fontWeight: 650, letterSpacing: '-0.02em' }}>${tap ? 'Tap to talk. Tap again to type.' : 'Hold to talk. Let go to type.'}</h2>
          <p style=${{ margin: 0, fontSize: '15px', lineHeight: 1.5, color: '#A1A1A1' }}>Works in any app. The text lands wherever your cursor is.</p>
        </div>
        <p style=${{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#8F8F8F' }}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"></rect><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"></path></svg>
          Everything runs on this PC. Audio is never saved or sent.
        </p>
      </section>
      ${groups.map((g) => html`
        <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style=${H2}>${g.label}</h2>
          <ul style=${{ ...CARD, listStyle: 'none', margin: 0, padding: 0, overflow: 'hidden' }}>
            ${g.rows.map((r, i) => {
              const on = copied === r.id;
              const time = new Date(r.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
              return html`
                <li key=${r.id} style=${{ display: 'flex', alignItems: 'flex-start', gap: '16px', padding: '14px 10px 14px 18px', borderTop: i === 0 ? '0' : '1px solid rgba(255,255,255,0.06)' }}>
                  <span class="mono" style=${{ flex: 'none', width: '44px', paddingTop: '3px', fontSize: '12.5px', color: '#8F8F8F', fontVariantNumeric: 'tabular-nums' }}>${time}</span>
                  <span style=${{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '1px' }}>
                    <span style=${{ fontSize: '15px', lineHeight: 1.45, color: '#F5F5F5', textWrap: 'pretty', userSelect: 'text' }}>${r.text}</span>
                    <span style=${{ fontSize: '12.5px', color: '#8F8F8F' }}>${r.target} · ${r.dur}</span>
                  </span>
                  <button type="button" class="t3-ghost" aria-label=${on ? 'Copied' : 'Copy transcript'} onClick=${() => copy(r)}
                    style=${{ flex: 'none', width: '44px', height: '44px', border: 0, borderRadius: '10px', background: 'transparent', color: on ? t.text : '#A1A1A1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    ${on ? html`<${CheckIcon} size=${18} stroke="currentColor" width=${2.4} />` : html`<${CopyIcon} />`}
                  </button>
                </li>`;
            })}
          </ul>
        </section>`)}
      ${needle && !shown.length && html`<p style=${{ margin: 0, padding: '32px 0', textAlign: 'center', fontSize: '15px', color: '#A1A1A1' }}>No transcripts match “${q.trim()}”.</p>`}
      ${!needle && !items.length && html`<p style=${{ margin: 0, padding: '24px 0', textAlign: 'center', fontSize: '15px', color: '#A1A1A1' }}>Nothing yet. What you dictate shows up here.</p>`}
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontSize: '13px', color: '#8F8F8F' }}>
        <span>Transcripts stay on this PC for 30 days.</span>
        ${confirm
          ? html`<span style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style=${{ color: '#D4D4D4' }}>Delete all transcripts?</span>
              <button type="button" class="t3-ghost" onClick=${() => setConfirm(false)} style=${{ height: '44px', padding: '0 14px', border: 0, borderRadius: '999px', background: 'transparent', color: '#F5F5F5', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button type="button" class="t3-ghost" onClick=${() => { api.invoke('history:clear').then(setItems); setConfirm(false); }} style=${{ height: '44px', padding: '0 14px', border: 0, borderRadius: '999px', background: 'rgba(255,100,103,0.14)', color: '#FF8A8C', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            </span>`
          : html`<button type="button" class="t3-ghost" disabled=${!items.length} onClick=${() => setConfirm(true)} style=${{ height: '44px', padding: '0 14px', border: 0, borderRadius: '999px', background: 'transparent', color: items.length ? '#F5F5F5' : '#8F8F8F', fontSize: '13px', fontWeight: 500, cursor: items.length ? 'pointer' : 'default' }}>Clear history…</button>`}
      </div>
    </div>`;
}

// ---------- Shortcut ----------

function Shortcut({ s, t }) {
  const cfg = s.config;
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState(null);
  const [live, setLive] = useState([]);
  const [draftCheck, setDraftCheck] = useState(null);
  const [comboCheck, setComboCheck] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const recRef = useRef(null);
  const copyTimer = useRef(null);

  useEffect(() => {
    api.invoke('shortcut:check', cfg.combo).then(setComboCheck);
  }, [cfg.combo.join('+'), s.hypr.added]);

  useEffect(() => {
    if (recording && recRef.current) recRef.current.focus();
  }, [recording]);

  useEffect(() => {
    setDraftCheck(null);
    if (draft) api.invoke('shortcut:check', draft).then(setDraftCheck);
  }, [draft && draft.join('+')]);

  const onKey = (e) => {
    if (!recording) return;
    const mods = B.modsOf(e);
    const key = B.keyOf(e);
    if (key === 'Tab' && mods.length === 0) return;
    e.preventDefault();
    if (key === 'Escape' && mods.length === 0) { cancelRec(); return; }
    if (!key) { setLive(mods); return; }
    setDraft(B.sortMods(mods).concat([key]));
    setLive([]);
  };
  const onKeyUp = (e) => { if (recording && !draft) setLive(B.modsOf(e)); };
  const startRec = () => { setRecording(true); setDraft(null); setLive([]); };
  const cancelRec = () => { setRecording(false); setDraft(null); setLive([]); };
  const useDraft = () => {
    if (!draft || !draftCheck || !draftCheck.ok) return;
    api.invoke('config:set', { combo: draft });
    cancelRec();
  };

  const draftKeys = draft || (live.length ? live.concat(['…']) : []);
  const f = cfg.fmt;
  const fileName = f === 'lua' ? s.hypr.lua : s.hypr.conf;
  const lines = B.lines(cfg.combo, cfg.mode, f);
  const roleColor = { dim: '#8F8F8F', fg: '#D4D4D4', acc: t.text, kw: '#E3A6FF' };
  const codeText = B.text(cfg.combo, cfg.mode, f);
  const added = s.hypr.added;

  const copyCode = () => {
    navigator.clipboard.writeText(codeText).catch(() => {});
    clearTimeout(copyTimer.current);
    setCopiedCode(true);
    copyTimer.current = setTimeout(() => setCopiedCode(false), 1600);
  };

  const seg = (on) => ({ background: on ? 'rgba(255,255,255,0.14)' : 'transparent', color: on ? '#F5F5F5' : '#A1A1A1', boxShadow: on ? 'inset 0 1px rgba(255,255,255,0.18), 0 2px 8px -2px rgba(0,0,0,0.6)' : 'none' });
  const tab = (on) => ({ background: on ? 'rgba(255,255,255,0.1)' : 'transparent', color: on ? '#F5F5F5' : '#A1A1A1' });

  return html`
    <${Header} title="Shortcut" />
    <div style=${{ boxSizing: 'border-box', maxWidth: '760px', padding: '24px 24px 28px 32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style=${H2}>Dictation shortcut</h2>
        <div style=${{ ...CARD, display: 'flex', flexDirection: 'column', gap: '16px', padding: '22px 22px 20px' }}>
          ${!recording ? html`
            <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto', flexWrap: 'wrap' }}>
                ${cfg.combo.map((k) => html`<${Keycap} label=${k} />`)}
              </div>
              <${SoftButton} onClick=${startRec}>Change…<//>
            </div>
            ${comboCheck && html`
              <p style=${{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', lineHeight: 1.45, color: '#D4D4D4' }}>
                ${comboCheck.ok ? html`<${CheckIcon} size=${16} stroke="#00D492" width=${2.4} style=${{ flex: 'none', marginTop: '2px' }} />` : html`<${WarnIcon} style=${{ flex: 'none', marginTop: '2px' }} />`}
                <span>${comboCheck.msg}</span>
              </p>`}
            <p style=${{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#8F8F8F' }}>Picked to stay clear of CachyOS defaults like Super + Space (launcher) and Super + Alt + Space (floating). Murmur checks again whenever your Hyprland config changes.</p>
          ` : html`
            <button type="button" class="mm-rec mm-anim" ref=${recRef} onKeyDown=${onKey} onKeyUp=${onKeyUp} aria-label="Shortcut recorder. Press the new key combination, or Escape to cancel."
              style=${{ height: '64px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', borderRadius: '16px', border: '1px solid ' + t.accent, background: t.a(0.1), color: '#F5F5F5', cursor: 'text', textAlign: 'left' }}>
              ${draftKeys.length ? draftKeys.map((k) => html`<${Keycap} label=${k} />`) : html`<span style=${{ fontSize: '15px', color: '#D4D4D4' }}>Press the new shortcut</span>`}
            </button>
            ${draft && draftCheck && html`
              <p style=${{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', lineHeight: 1.45, color: '#D4D4D4' }}>
                ${draftCheck.ok ? html`<${CheckIcon} size=${16} stroke="#00D492" width=${2.4} style=${{ flex: 'none', marginTop: '2px' }} />` : html`<${WarnIcon} style=${{ flex: 'none', marginTop: '2px' }} />`}
                <span>${draftCheck.msg}</span>
              </p>`}
            <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <span style=${{ fontSize: '13px', color: '#8F8F8F' }}>${draft ? 'Press another combination to try again.' : 'Hold the keys together, then let go. Esc cancels.'}</span>
              <div style=${{ display: 'flex', gap: '10px' }}>
                <${SoftButton} onClick=${cancelRec}>Cancel<//>
                <${AccentButton} t=${t} onClick=${useDraft} disabled=${!(draftCheck && draftCheck.ok)}>Use shortcut<//>
              </div>
            </div>
          `}
        </div>
      </section>

      <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style=${H2}>How it works</h2>
        <div style=${{ ...CARD, display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px 22px 20px' }}>
          <div style=${{ alignSelf: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '2px', borderRadius: '999px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button type="button" class="mm-seg" aria-pressed=${cfg.mode === 'hold'} onClick=${() => api.invoke('config:set', { mode: 'hold' })} style=${{ height: '40px', padding: '0 18px', border: 0, borderRadius: '999px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', ...seg(cfg.mode === 'hold') }}>Hold to talk</button>
            <button type="button" class="mm-seg" aria-pressed=${cfg.mode === 'tap'} onClick=${() => api.invoke('config:set', { mode: 'tap' })} style=${{ height: '40px', padding: '0 18px', border: 0, borderRadius: '999px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', ...seg(cfg.mode === 'tap') }}>Tap to start, tap to stop</button>
          </div>
          <p style=${{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: '#A1A1A1' }}>${cfg.mode === 'hold' ? 'Hold the shortcut while you speak. Let go and the text is typed.' : 'Tap once to start listening and tap again to stop. Easier for longer thoughts.'}</p>
        </div>
      </section>

      <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style=${H2}>After you speak</h2>
        <fieldset style=${{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
          <legend class="mm-sr">Where the text goes</legend>
          <div style=${CARD}>
            ${[['type', 'Type it where the cursor is', 'If no text field is focused, it’s copied to the clipboard instead.'], ['copy', 'Copy to clipboard only', 'Paste it yourself with Ctrl V.']].map(([id, title, sub], i) => html`
              ${i > 0 && DIVIDER(54)}
              <label class="mm-row" style=${{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px 20px', cursor: 'pointer' }}>
                <input class="mm-sr" type="radio" name="after" checked=${cfg.after === id} onChange=${() => api.invoke('config:set', { after: id })} />
                <span style=${{ marginTop: '1px' }}><${Radio} on=${cfg.after === id} t=${t} /></span>
                <span style=${{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style=${ROW_TITLE}>${title}</span>
                  <span style=${ROW_SUB}>${sub}</span>
                </span>
              </label>`)}
          </div>
        </fieldset>
        <div style=${CARD}>
          ${[['enter', 'Press Enter after typing', 'Handy for chats and terminals.'], ['sound', 'Sound when listening starts and stops', 'A soft tick, so you know it caught the shortcut.']].map(([key, title, sub], i) => html`
            ${i > 0 && DIVIDER()}
            <div style=${{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 12px 10px 20px' }}>
              <span style=${{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style=${ROW_TITLE}>${title}</span>
                <span style=${ROW_SUB}>${sub}</span>
              </span>
              <${Switch} on=${!!cfg[key]} label=${title} t=${t} onToggle=${() => api.invoke('config:set', { [key]: !cfg[key] })} />
            </div>`)}
        </div>
      </section>

      <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style=${H2}>Startup</h2>
        <div style=${CARD}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 12px 10px 20px' }}>
            <span style=${{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style=${ROW_TITLE}>Start Murmur when you log in</span>
              <span style=${ROW_SUB}>${s.autostart.available ? 'Runs quietly in the background, so the shortcut works right away.' : 'Run scripts/install.sh first to set up the background service.'}</span>
            </span>
            ${s.autostart.available && html`<${Switch} on=${s.autostart.on} label="Start Murmur when you log in" t=${t} onToggle=${() => api.invoke('autostart:set', !s.autostart.on)} />`}
          </div>
        </div>
      </section>

      <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style=${H2}>Hyprland</h2>
        <div style=${{ ...CARD, display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px 22px' }}>
          <div style=${{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <p style=${{ margin: 0, flex: '1 1 320px', fontSize: '14px', lineHeight: 1.5, color: '#A1A1A1' }}>${cfg.mode === 'hold'
              ? 'Two lines in ' + fileName + ': one starts listening when you press the shortcut, one stops when you let go.'
              : 'One line in ' + fileName + ' turns listening on and off.'}</p>
            <span style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '26px', padding: '0 10px', borderRadius: '999px', background: added ? 'rgba(0,212,146,0.14)' : 'rgba(255,185,0,0.14)', color: added ? '#00D492' : '#FFB900', fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>${added ? 'In ' + fileName : 'Not added yet'}</span>
          </div>
          <div class="t3-grain" style=${{ borderRadius: '14px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '4px 4px 4px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style=${{ display: 'flex', gap: '2px' }}>
                ${[['lua', s.hypr.lua], ['conf', s.hypr.conf]].map(([id, name]) => html`
                  <button type="button" class="t3-ghost mono" aria-pressed=${f === id} onClick=${() => api.invoke('config:set', { fmt: id })}
                    style=${{ height: '36px', padding: '0 12px', border: 0, borderRadius: '8px', fontSize: '12.5px', cursor: 'pointer', ...tab(f === id) }}>${name}</button>`)}
              </div>
              <button type="button" class="t3-ghost" onClick=${copyCode} style=${{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: 0, borderRadius: '8px', background: 'transparent', color: copiedCode ? '#00D492' : '#D4D4D4', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                <${CopyIcon} size=${15} width=${1.9} />
                ${copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div class="mono" style=${{ margin: 0, padding: '14px 16px 16px', overflowX: 'auto', whiteSpace: 'pre', fontSize: '13px', lineHeight: 1.75, color: '#D4D4D4', userSelect: 'text' }}>
              ${lines.map((ln) => html`<div>${ln.map(([text, role]) => html`<span style=${{ color: roleColor[role] }}>${text}</span>`)}</div>`)}
            </div>
          </div>
          <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span style=${{ fontSize: '13px', color: '#8F8F8F' }}>${s.hypr.running ? (f === 'lua' ? 'Also adds window rules for the overlay. Nothing else in your config is touched.' : 'Hyprland reloads by itself. Nothing else in your config is touched.') : 'Hyprland is not running, so the lines take effect on its next start.'}</span>
            ${added
              ? html`<${SoftButton} onClick=${() => api.invoke('hypr:remove', f)}>Remove from ${fileName}<//>`
              : html`<${AccentButton} t=${t} onClick=${() => api.invoke('hypr:add', f)}>Add to ${fileName}<//>`}
          </div>
        </div>
      </section>
    </div>`;
}

// ---------- Models ----------

const LANGS = [['auto', 'Detect automatically'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['pt', 'Português']];

function Select({ id, value, onChange, children }) {
  return html`
    <span style=${{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select id=${id} class="mm-field" value=${value} onChange=${(e) => onChange(e.target.value)}
        style=${{ height: '44px', minWidth: '210px', maxWidth: '280px', boxSizing: 'border-box', padding: '0 38px 0 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.11)', backgroundColor: 'rgba(255,255,255,0.035)', color: '#F5F5F5', fontSize: '14px', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', textOverflow: 'ellipsis' }}>
        ${children}
      </select>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A1A1A1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style=${{ position: 'absolute', right: '14px', pointerEvents: 'none' }}><path d="M7 10l5 5 5-5"></path></svg>
    </span>`;
}

function SettingRow({ forId, title, sub, children }) {
  return html`
    <div style=${{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 14px 12px 20px', flexWrap: 'wrap' }}>
      <label for=${forId} style=${{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '3px', cursor: 'pointer' }}>
        <span style=${ROW_TITLE}>${title}</span>
        <span style=${ROW_SUB}>${sub}</span>
      </label>
      ${children}
    </div>`;
}

function fmtBytes(b) {
  return b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB';
}

function Models({ s, t }) {
  const cfg = s.config;
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.invoke('inputs:refresh'); }, []);

  const built = s.builtBackend;
  const builtName = { vulkan: 'Vulkan', cuda: 'CUDA', rocm: 'ROCm' }[built];
  const pick = (id) => {
    setError(null);
    setPending(id);
    api.invoke('model:pick', id).then((err) => { setPending(null); if (err) setError(err); });
  };
  const download = (id) => {
    setError(null);
    api.invoke('model:download', id).then((err) => err && setError(err));
  };
  const dots = (n) => [1, 2, 3, 4, 5].map((i) => html`<span aria-hidden="true" style=${{ width: '7px', height: '7px', borderRadius: '50%', background: i <= n ? t.text : 'rgba(255,255,255,0.16)' }}></span>`);
  const problem = error || (s.whisperState === 'error' && s.whisperError) || (!s.whisperBuilt && 'whisper.cpp is not installed yet. Run scripts/build-whisper.sh, then restart Murmur.');

  return html`
    <${Header} title="Models" />
    <div style=${{ boxSizing: 'border-box', maxWidth: '760px', padding: '10px 24px 28px 32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <p style=${{ margin: 0, maxWidth: '560px', fontSize: '15px', lineHeight: 1.5, color: '#A1A1A1', textWrap: 'pretty' }}>Whisper runs on this PC through whisper.cpp. Larger models hear you better but take a moment longer.</p>
      ${problem && html`
        <div role="status" style=${{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 18px', borderRadius: '14px', background: 'rgba(255,100,103,0.1)', border: '1px solid rgba(255,100,103,0.25)', fontSize: '14px', lineHeight: 1.45, color: '#F5F5F5' }}>
          <${WarnIcon} stroke="#FF6467" style=${{ flex: 'none', marginTop: '2px' }} />
          <span style=${{ userSelect: 'text' }}>${problem}</span>
        </div>`}
      <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style=${H2}>Hardware and language</h2>
        <div style=${CARD}>
          <${SettingRow} forId="mm-backend" title="Run on" sub="Auto uses your graphics card when it can.">
            <${Select} id="mm-backend" value=${cfg.backend} onChange=${(v) => api.invoke('config:set', { backend: v })}>
              <option value="auto">${builtName ? 'Auto · ' + builtName + ' (GPU)' : 'Auto · CPU'}</option>
              ${['vulkan', 'cuda', 'rocm'].map((b) => html`<option value=${b} disabled=${built !== b}>${{ vulkan: 'Vulkan', cuda: 'CUDA', rocm: 'ROCm' }[b]}${built !== b ? ' (not built)' : ''}</option>`)}
              <option value="cpu">CPU only</option>
            <//>
          <//>
          ${DIVIDER()}
          <${SettingRow} forId="mm-lang" title="Language" sub="Set it if you always speak one language. It’s a little faster.">
            <${Select} id="mm-lang" value=${cfg.lang} onChange=${(v) => api.invoke('config:set', { lang: v })}>
              ${LANGS.map(([v, l]) => html`<option value=${v}>${l}</option>`)}
            <//>
          <//>
          ${DIVIDER()}
          <${SettingRow} forId="mm-input" title="Microphone" sub="Default follows your system’s input in PipeWire.">
            <${Select} id="mm-input" value=${cfg.input} onChange=${(v) => api.invoke('config:set', { input: v })}>
              <option value="default">Default${(() => { const d = s.inputs.find((i) => i.isDefault); return d ? ' · ' + d.label : ''; })()}</option>
              ${s.inputs.map((i) => html`<option value=${i.name}>${i.label}</option>`)}
            <//>
          <//>
        </div>
      </section>
      <section style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style=${H2}>Whisper models</h2>
        <fieldset style=${{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
          <legend class="mm-sr">Whisper model to use</legend>
          <div style=${{ ...CARD, overflow: 'hidden' }}>
            ${s.models.map((m, i) => {
              const loading = m.pct != null;
              const sel = cfg.model === m.id;
              const on = pending ? pending === m.id : sel;
              return html`
                <div key=${m.id} style=${{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px 12px 16px', flexWrap: 'wrap', borderTop: i === 0 ? '0' : '1px solid rgba(255,255,255,0.06)', background: sel ? t.a(0.08) : 'transparent' }}>
                  <label class="mm-pick" style=${{ position: 'relative', flex: '1 1 400px', minWidth: 0, display: 'flex', alignItems: 'center', gap: '14px', padding: '4px', cursor: 'pointer', flexWrap: 'wrap' }}>
                    <input class="mm-sr" type="radio" name="model" checked=${on} onChange=${() => pick(m.id)} />
                    <${Radio} on=${on} t=${t} />
                    <span style=${{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style=${{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span class="mono" style=${{ fontSize: '14px', fontWeight: 600, color: '#F5F5F5' }}>${m.name}</span>
                        ${m.tag && html`<span style=${{ display: 'inline-flex', alignItems: 'center', height: '22px', padding: '0 8px', borderRadius: '999px', background: t.a(0.16), color: t.text, fontSize: '11.5px', fontWeight: 600 }}>${m.tag}</span>`}
                      </span>
                      <span style=${{ fontSize: '13px', lineHeight: 1.4, color: '#8F8F8F' }}>${m.desc} · ${m.size}${m.local ? ' · found on this PC' : ''}</span>
                    </span>
                    <span style=${{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: '10px', rowGap: '5px', alignItems: 'center', fontSize: '12px', color: '#8F8F8F' }}>
                      <span>Speed</span><span style=${{ display: 'flex', gap: '3px' }}><span class="mm-sr">${m.speed} of 5</span>${dots(m.speed)}</span>
                      <span>Accuracy</span><span style=${{ display: 'flex', gap: '3px' }}><span class="mm-sr">${m.acc} of 5</span>${dots(m.acc)}</span>
                    </span>
                  </label>
                  <span style=${{ flex: 'none', minWidth: '132px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    ${m.installed && sel && html`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '28px', padding: '0 12px', borderRadius: '999px', background: t.a(0.16), color: t.text, fontSize: '12.5px', fontWeight: 600 }}><${CheckIcon} size=${13} stroke="currentColor" width=${2.8} />In use</span>`}
                    ${m.installed && !sel && html`<span style=${{ fontSize: '13px', color: '#A1A1A1', paddingRight: '12px' }}>Installed</span>`}
                    ${!m.installed && !loading && html`
                      <button type="button" class="lg lg-soft lg-btn lg-press" onClick=${() => download(m.id)} aria-label=${'Download ' + m.name + ', ' + m.size}
                        style=${{ height: '44px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px 0 14px', border: 0, borderRadius: '999px', color: '#F5F5F5', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }}>
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>
                        Download
                      </button>`}
                    ${loading && html`
                      <span style=${{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '8px' }}>
                        <span aria-hidden="true" style=${{ width: '64px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden', display: 'flex' }}><span class="mm-fill" style=${{ width: m.pct + '%', height: '4px', borderRadius: '2px', background: t.text }}></span></span>
                        <span class="mono" style=${{ minWidth: '36px', textAlign: 'right', fontSize: '12.5px', color: '#D4D4D4', fontVariantNumeric: 'tabular-nums' }}>${m.pct}%</span>
                      </span>`}
                  </span>
                </div>`;
            })}
          </div>
        </fieldset>
      </section>
      <div style=${{ ...CARD, display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px 12px 20px', flexWrap: 'wrap' }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1A1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style=${{ flex: 'none' }}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
        <span style=${{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span class="mono" style=${{ fontSize: '13px', color: '#F5F5F5', overflowWrap: 'anywhere' }}>${s.modelsDir}</span>
          <span style=${{ fontSize: '13px', color: '#8F8F8F' }}>${fmtBytes(s.usedBytes)} used by downloaded models</span>
        </span>
        <${SoftButton} onClick=${() => api.invoke('models:show')} style=${{ padding: '0 18px' }}>Show in Files<//>
      </div>
    </div>`;
}

// ---------- shell ----------

const PAGES = { transcripts: Transcripts, shortcut: Shortcut, models: Models };

function App() {
  const s = useAppState();
  const [page, setPage] = useState(() => (PAGES[location.hash.slice(1)] ? location.hash.slice(1) : 'transcripts'));
  const scroller = useRef(null);
  const go = (p) => {
    if (!PAGES[p]) p = 'transcripts';
    history.replaceState(null, '', '#' + p);
    setPage(p);
    if (scroller.current) scroller.current.scrollTop = 0;
  };
  useEffect(() => api.on('navigate', go), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && document.activeElement?.tagName !== 'INPUT') api.invoke('window:close'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!s) return null;
  const t = tones(s.config.accent);
  const Page = PAGES[page];
  return html`
    <div style=${{ position: 'fixed', inset: 0, borderRadius: '20px', overflow: 'hidden', background: '#000' }}>
      <${Backdrop} t=${t} />
      <div class="mm-win t3-glass t3-grain" style=${{ position: 'absolute', inset: 0, boxSizing: 'border-box', padding: '8px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px rgba(255,255,255,0.04)', display: 'flex' }}>
        <${Sidebar} page=${page} go=${go} s=${s} t=${t} />
        <main ref=${scroller} style=${{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <${Page} s=${s} t=${t} />
        </main>
      </div>
    </div>`;
}

render(html`<${App} />`, document.getElementById('root'));
