import { html, render, useState, useEffect, useRef, api, tones, MicIcon, CheckIcon, WarnIcon, CloseIcon, MiniKey } from './lib.js';

const PILL = { display: 'flex', alignItems: 'center', height: '64px', boxSizing: 'border-box', borderRadius: '999px' };
const ICON = { width: '44px', height: '44px', flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const TITLE = { fontSize: '14px', fontWeight: 600, letterSpacing: '-0.006em', color: '#F5F5F5' };
const SUB = { fontSize: '12.5px', color: '#B5B5B5' };
const BUBBLE = { maxWidth: '600px', boxSizing: 'border-box', padding: '14px 22px', borderRadius: '24px', fontSize: '16px', lineHeight: 1.5, fontWeight: 500, letterSpacing: '-0.011em', color: '#F5F5F5', textWrap: 'pretty' };

const Spinner = ({ t }) => html`
  <span style=${{ ...ICON, background: 'rgba(255,255,255,0.08)' }}>
    <svg class="mm-spin mm-anim" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" stroke="rgba(255,255,255,0.14)"></circle><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" stroke=${t.text}></path></svg>
  </span>`;

const Lines = ({ title, sub }) => html`
  <span style=${{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
    <span style=${TITLE}>${title}</span>
    ${sub && html`<span style=${SUB}>${sub}</span>`}
  </span>`;

// Waveform from real input levels, newest on the right.
function Bars({ levels, t }) {
  const n = 30;
  const list = levels.slice(-n);
  while (list.length < n) list.unshift(0);
  return html`
    <span aria-hidden="true" style=${{ display: 'flex', alignItems: 'center', gap: '3px', height: '36px' }}>
      ${list.map((lv) => {
        const e = Math.min(1, Math.pow(lv / 0.1, 0.6));
        return html`<span style=${{ display: 'block', width: '3px', height: Math.round(4 + 30 * e) + 'px', borderRadius: '2px', background: t.text, transition: 'height .12s ease-out' }}></span>`;
      })}
    </span>`;
}

const ThinkBars = ({ t }) => html`
  <span aria-hidden="true" style=${{ display: 'flex', alignItems: 'center', gap: '3px', height: '36px' }}>
    ${Array.from({ length: 30 }, (_, i) => html`<span class="mm-think mm-anim" style=${{ display: 'block', width: '3px', height: '4px', borderRadius: '2px', background: t.text, animationDelay: (i * 0.035).toFixed(3) + 's' }}></span>`)}
  </span>`;

function Listening({ v, t }) {
  const hasWords = !!(v.settled || v.live);
  const time = Math.floor(v.secs / 60) + ':' + String(v.secs % 60).padStart(2, '0');
  return html`
    <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div class="lg lg-dim pill" style=${BUBBLE}>
        ${hasWords
          ? html`<span>${v.settled}</span> <span style=${{ color: 'rgba(245,245,245,0.5)' }}>${v.live}</span>`
          : html`<span style=${{ color: 'rgba(245,245,245,0.6)' }}>Listening…</span>`}
      </div>
      <div class="lg pill" style=${{ ...PILL, gap: '6px', padding: '0 10px' }}>
        <span style=${{ ...ICON, position: 'relative', background: t.accent, boxShadow: `inset 0 1px rgba(255,255,255,0.22), 0 4px 14px ${t.a(0.4)}` }}>
          <span class="mm-ring mm-anim" aria-hidden="true" style=${{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid ' + t.text }}></span>
          <${MicIcon} stroke=${t.ink} />
        </span>
        <button type="button" class="mm-press" onClick=${() => api.send('overlay:action', 'stop')} aria-label="Stop listening and type"
          style=${{ display: 'flex', alignItems: 'center', gap: '16px', height: '44px', padding: '0 14px 0 10px', border: 0, borderRadius: '999px', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
          <${Bars} levels=${v.levels || []} t=${t} />
          <span class="mono" style=${{ minWidth: '34px', fontSize: '13px', color: '#A1A1A1', fontVariantNumeric: 'tabular-nums' }}>${time}</span>
          <span aria-hidden="true" style=${{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.12)' }}></span>
          <span style=${{ fontSize: '14px', fontWeight: 500, letterSpacing: '-0.006em', color: '#F5F5F5', whiteSpace: 'nowrap' }}>${v.mode === 'tap' ? 'Tap again to stop' : 'Let go to type'}</span>
        </button>
        <button type="button" class="mm-press" onClick=${() => api.send('overlay:action', 'cancel')} aria-label="Cancel dictation"
          style=${{ ...ICON, border: 0, background: 'rgba(255,255,255,0.08)', color: '#D4D4D4', cursor: 'pointer' }}>
          <${CloseIcon} size=${16} width=${2} />
        </button>
      </div>
    </div>`;
}

function Warming({ v, t }) {
  return html`
    <div class="lg pill" style=${{ ...PILL, gap: '14px', padding: '0 22px 0 10px' }}>
      <${Spinner} t=${t} />
      <${Lines} title=${'Loading ' + v.model} sub=${v.mode === 'tap' ? 'Keep talking, almost ready' : 'Keep holding, almost ready'} />
      <span aria-hidden="true" style=${{ width: '72px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.14)', overflow: 'hidden', display: 'flex' }}>
        <span class="mm-fill" style=${{ width: Math.round((v.progress || 0) * 100) + '%', height: '4px', borderRadius: '2px', background: t.text }}></span>
      </span>
    </div>`;
}

function Transcribing({ v, t }) {
  return html`
    <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      ${v.text && html`<div class="lg lg-dim pill" style=${BUBBLE}>${v.text}</div>`}
      <div class="lg pill" style=${{ ...PILL, gap: '16px', padding: '0 24px 0 10px' }}>
        <${Spinner} t=${t} />
        <${ThinkBars} t=${t} />
        <span style=${{ fontSize: '14px', fontWeight: 500, letterSpacing: '-0.006em', color: '#F5F5F5' }}>Transcribing…</span>
      </div>
    </div>`;
}

function Typed({ v }) {
  return html`
    <div class="mm-in lg pill" style=${{ ...PILL, gap: '14px', padding: v.canUndo ? '0 10px' : '0 24px 0 10px' }}>
      <span style=${{ ...ICON, background: '#00D492', boxShadow: 'inset 0 1px rgba(255,255,255,0.3)' }}><${CheckIcon} /></span>
      <span style=${{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em', color: '#F5F5F5', whiteSpace: 'nowrap', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis' }}>Typed ${v.words} ${v.words === 1 ? 'word' : 'words'} into ${v.target}</span>
      ${v.canUndo && html`
        <button type="button" class="mm-press" onClick=${() => api.send('overlay:action', 'undo')}
          style=${{ height: '44px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 18px 0 14px', border: 0, borderRadius: '999px', background: 'rgba(255,255,255,0.09)', color: '#F5F5F5', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"></path><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path></svg>
          Undo
        </button>`}
    </div>`;
}

function Copied({ t }) {
  return html`
    <div class="mm-in lg pill" style=${{ ...PILL, gap: '14px', padding: '0 20px 0 10px' }}>
      <span style=${{ ...ICON, background: 'rgba(255,255,255,0.08)' }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke=${t.text} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="17" rx="2.5"></rect><path d="M9 4.5h6v3H9z"></path></svg>
      </span>
      <${Lines} title="Copied to clipboard" sub="No text field to type into" />
      <span style=${{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
        <${MiniKey} label="Ctrl" /><${MiniKey} label="V" />
        <span style=${{ ...SUB, marginLeft: '4px' }}>to paste</span>
      </span>
    </div>`;
}

const Nothing = () => html`
  <div class="mm-in lg pill" style=${{ ...PILL, gap: '14px', padding: '0 24px 0 10px' }}>
    <span style=${{ ...ICON, background: 'rgba(255,185,0,0.16)' }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFB900" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16"></path></svg>
    </span>
    <${Lines} title="Didn’t catch anything" sub="Your mic may be muted or too quiet" />
  </div>`;

const Problem = ({ title, sub, action }) => html`
  <div class="mm-in lg pill" style=${{ ...PILL, gap: '14px', padding: action ? '0 10px' : '0 24px 0 10px', maxWidth: '720px' }}>
    <span style=${{ ...ICON, background: 'rgba(255,100,103,0.16)' }}><${WarnIcon} size=${20} stroke="#FF6467" width=${1.9} /></span>
    <span style=${{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style=${TITLE}>${title}</span>
      <span style=${{ ...SUB, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '480px' }}>${sub}</span>
    </span>
    ${action && html`
      <button type="button" class="mm-press" onClick=${() => api.send('overlay:action', action.id)}
        style=${{ height: '44px', display: 'flex', alignItems: 'center', padding: '0 18px', border: 0, borderRadius: '999px', background: 'rgba(255,255,255,0.09)', color: '#F5F5F5', fontSize: '14px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>${action.label}</button>`}
  </div>`;

function View({ v }) {
  const t = tones(v.accent);
  switch (v.kind) {
    case 'listening': return html`<${Listening} v=${v} t=${t} />`;
    case 'warming': return html`<${Warming} v=${v} t=${t} />`;
    case 'transcribing': return html`<${Transcribing} v=${v} t=${t} />`;
    case 'typed': return html`<${Typed} v=${v} />`;
    case 'copied': return html`<${Copied} t=${t} />`;
    case 'nothing': return html`<${Nothing} />`;
    case 'nomic': return html`<${Problem} title="No microphone found" sub="Plug one in or pick another input" action=${{ id: 'choose-input', label: 'Choose input' }} />`;
    case 'error': return html`<${Problem} title="Something went wrong" sub=${v.msg || 'Check `murmur status`'} />`;
    default: return null;
  }
}

function Overlay() {
  const [view, setView] = useState({ kind: 'hidden' });
  const [shown, setShown] = useState(null); // last visible view, kept during fade-out
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(0);
  const root = useRef(null);

  useEffect(() => api.on('view', (v) => {
    setView((prev) => {
      if (prev.kind === 'hidden' && v.kind !== 'hidden') setEntered((n) => n + 1);
      return v;
    });
  }), []);

  useEffect(() => {
    if (view.kind === 'hidden') {
      setLeaving(true);
    } else {
      setLeaving(false);
      setShown(view);
    }
  }, [view]);

  // Only the pills take clicks; the rest of the window is see-through.
  useEffect(() => {
    if (!root.current) return;
    const rects = view.kind === 'hidden' ? [] : [...root.current.querySelectorAll('.pill')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    api.send('overlay:shape', rects);
  });

  return html`
    <div ref=${root} style=${{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '36px' }}>
      ${shown && html`
        <div key=${entered} class=${leaving ? 'mm-out' : 'mm-in'} style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <${View} v=${shown} />
        </div>`}
    </div>`;
}

render(html`<${Overlay} />`, document.getElementById('root'));
