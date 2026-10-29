import { html, render, useState, useEffect, useRef, api, tones, useAppState, Logo, MicIcon, CheckIcon, WarnIcon, Backdrop } from './lib.js';


const CHOICES = [
  { id: 'base', title: 'Quick', desc: 'Fastest. Good for short notes on any machine.' },
  { id: 'small', title: 'Balanced', desc: 'Accurate enough for most writing, and fine on a CPU.' },
  { id: 'turbo', title: 'Best', desc: 'Most accurate. Runs on your graphics card through Vulkan.' }
];

const H1 = { margin: 0, fontSize: '30px', lineHeight: 1.12, fontWeight: 650, letterSpacing: '-0.024em' };
const LEAD = { margin: 0, maxWidth: '520px', fontSize: '16px', lineHeight: 1.5, color: '#A1A1A1', textWrap: 'pretty' };

function Primary({ t, onClick, children, disabled }) {
  return html`<button type="button" class="t3-btn" onClick=${onClick} disabled=${disabled}
    style=${{ height: '44px', padding: '0 22px', border: 0, borderRadius: '999px', background: t.accent, color: t.ink, boxShadow: `inset 0 1px rgba(255,255,255,0.16), 0 1px 2px ${t.a(0.24)}`, fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>${children}</button>`;
}

function Soft({ onClick, children }) {
  return html`<button type="button" class="lg lg-soft lg-btn lg-press" onClick=${onClick}
    style=${{ height: '44px', padding: '0 20px', border: 0, borderRadius: '999px', color: '#F5F5F5', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>${children}</button>`;
}

function Progress({ pct, t, width = 96 }) {
  return html`<span aria-hidden="true" style=${{ width: width + 'px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden', display: 'flex' }}><span class="mm-fill" style=${{ width: pct + '%', height: '4px', borderRadius: '2px', background: t.text }}></span></span>`;
}

function Setup() {
  const s = useAppState();
  const [step, setStep] = useState(1);
  const [model, setModel] = useState(null);
  const [check, setCheck] = useState(null);
  const [trying, setTrying] = useState(false);
  const [tryText, setTryText] = useState('');
  const [error, setError] = useState(null);
  const area = useRef(null);

  useEffect(() => api.on('practice-text', (text) => {
    setTryText((prev) => (prev && !/\s$/.test(prev) ? prev + ' ' : prev) + text);
  }), []);

  useEffect(() => {
    if (s && !model) setModel(s.gpu ? 'turbo' : 'small');
  }, [s]);

  useEffect(() => {
    if (s) api.invoke('shortcut:check', s.config.combo).then(setCheck);
  }, [s && s.config.combo.join('+'), s && s.hypr.added]);

  useEffect(() => {
    if (step === 3 && area.current) area.current.focus();
  }, [step]);

  if (!s || !model) return null;
  const t = tones(s.config.accent);
  const chosen = s.models.find((m) => m.id === model);
  const dlPct = chosen.installed ? 100 : chosen.pct != null ? chosen.pct : 0;
  const dlText = chosen.installed
    ? (s.whisperState === 'loading' ? 'Loading ' + chosen.name + '…' : chosen.name + ' is ready')
    : 'Downloading ' + chosen.name + ' · ' + dlPct + '%';
  const combo = s.config.combo;
  const comboText = combo.join(' ');
  const fileName = s.hypr.fileName;

  const next = () => setStep((n) => Math.min(4, n + 1));
  const back = () => setStep((n) => Math.max(1, n - 1));

  const startDownload = () => {
    setError(null);
    api.invoke('model:choose', model).then((err) => err && setError(err));
    next();
  };
  const addToHyprland = async () => {
    if (!s.hypr.added) await api.invoke('hypr:add');
    next();
  };
  const tryDown = (e) => {
    if (e.button !== 0) return;
    setTrying(true);
    api.invoke('practice:start');
  };
  const tryUp = () => {
    if (!trying) return;
    setTrying(false);
    api.invoke('practice:stop');
  };
  const finish = () => {
    api.invoke('setup:finish');
    next();
  };
  const seg = (n) => (step >= n ? t.accent : 'rgba(255,255,255,0.14)');
  const meterH = [6, 10, 16, 12, 20, 14, 9, 18, 12, 7, 11, 5];

  return html`
    <div style=${{ position: 'fixed', inset: 0, borderRadius: '28px', overflow: 'hidden', background: '#000' }}>
      <${Backdrop} t=${t} variant="setup" />
      <main class="lg lg-sheet" style=${{ position: 'absolute', inset: 0, boxSizing: 'border-box', padding: '36px 44px 32px', borderRadius: '28px', display: 'flex', flexDirection: 'column', gap: '28px', overflowY: 'auto' }}>
        <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div class="drag" style=${{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto' }}>
            <${Logo} size=${44} t=${t} width=${3.4} />
            <span style=${{ fontSize: '17px', fontWeight: 650, letterSpacing: '-0.015em' }}>Murmur</span>
          </div>
          ${step <= 3 && html`
            <div style=${{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style=${{ fontSize: '13px', color: '#A1A1A1' }}>Step ${step} of 3</span>
              <span aria-hidden="true" style=${{ display: 'flex', gap: '4px' }}>
                ${[1, 2, 3].map((n) => html`<span style=${{ width: '22px', height: '4px', borderRadius: '2px', background: seg(n) }}></span>`)}
              </span>
            </div>`}
        </div>

        ${error && html`
          <div role="status" style=${{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 16px', borderRadius: '14px', background: 'rgba(255,100,103,0.1)', border: '1px solid rgba(255,100,103,0.25)', fontSize: '14px', color: '#F5F5F5' }}>
            <${WarnIcon} stroke="#FF6467" style=${{ flex: 'none', marginTop: '2px' }} />
            <span>${error}</span>
          </div>`}

        ${step === 1 && html`
          <div key="s1" class="mm-in-x" style=${{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h1 style=${H1}>Choose how Murmur listens</h1>
              <p style=${LEAD}>Whisper runs right here on your PC, so nothing you say leaves it. You can switch models any time.</p>
            </div>
            <fieldset style=${{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
              <legend class="mm-sr">Model</legend>
              <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '12px' }}>
                ${CHOICES.map((c) => {
                  const m = s.models.find((x) => x.id === c.id);
                  const on = model === c.id;
                  const rec = s.gpu ? c.id === 'turbo' : c.id === 'small';
                  return html`
                    <label class="mm-opt no-drag" style=${{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '172px', boxSizing: 'border-box', padding: '18px', borderRadius: '18px', cursor: 'pointer', background: on ? t.a(0.1) : 'rgba(255,255,255,0.035)', border: '1px solid ' + (on ? t.accent : 'rgba(255,255,255,0.08)'), boxShadow: on ? 'inset 0 1px rgba(255,255,255,0.08), 0 0 0 3px ' + t.a(0.18) : 'inset 0 1px rgba(255,255,255,0.04)' }}>
                      <input class="mm-sr" type="radio" name="model" checked=${on} onChange=${() => setModel(c.id)} />
                      <span style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style=${{ fontSize: '17px', fontWeight: 650, letterSpacing: '-0.015em', color: '#F5F5F5' }}>${c.title}</span>
                        <span aria-hidden="true" style=${{ width: '20px', height: '20px', boxSizing: 'border-box', borderRadius: '50%', border: on ? '0' : '1.5px solid rgba(255,255,255,0.3)', background: on ? t.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style=${{ width: '8px', height: '8px', borderRadius: '50%', background: on ? t.ink : 'transparent' }}></span></span>
                      </span>
                      <span class="mono" style=${{ fontSize: '12.5px', color: '#A1A1A1' }}>${m.name} · ${m.installed || m.local ? 'already on this PC' : m.size}</span>
                      <span style=${{ fontSize: '14px', lineHeight: 1.45, color: '#D4D4D4', textWrap: 'pretty' }}>${c.id === 'turbo' && !s.gpu ? 'Most accurate. Slow without a graphics card.' : c.desc}</span>
                      ${rec && html`<span style=${{ alignSelf: 'flex-start', marginTop: 'auto', display: 'inline-flex', alignItems: 'center', height: '24px', whiteSpace: 'nowrap', padding: '0 10px', borderRadius: '999px', background: t.a(0.16), color: t.text, fontSize: '12px', fontWeight: 600 }}>${s.gpu ? 'Recommended · GPU found' : 'Recommended · no GPU found'}</span>`}
                    </label>`;
                })}
              </div>
            </fieldset>
            <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <${Primary} t=${t} onClick=${startDownload}>${chosen.installed || chosen.local ? 'Continue' : 'Download ' + chosen.size + ' and continue'}<//>
            </div>
          </div>`}

        ${step === 2 && html`
          <div key="s2" class="mm-in-x" style=${{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h1 style=${H1}>Your shortcut</h1>
              <p style=${LEAD}>Hold it in any app and talk. Let go, and your words are typed where the cursor is.</p>
            </div>
            <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', padding: '36px 24px 28px', borderRadius: '20px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                ${combo.map((k) => html`<span class="lg lg-soft lg-btn" style=${{ display: 'inline-flex', alignItems: 'center', height: '56px', padding: k === 'Space' ? '0 56px' : '0 22px', borderRadius: '14px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.01em', color: '#F5F5F5' }}>${k}</span>`)}
              </div>
              ${check && html`
                <p style=${{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#D4D4D4', textAlign: 'center' }}>
                  ${check.ok ? html`<${CheckIcon} size=${16} stroke="#00D492" width=${2.4} />` : html`<${WarnIcon} />`}
                  ${check.ok ? 'Free in your Hyprland setup. It stays clear of Super + Space, your launcher.' : check.msg}
                </p>`}
            </div>
            <p style=${{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#8F8F8F' }}>${s.hypr.added
              ? 'Already in ' + fileName + '. You can change or remove it in Settings.'
              : 'Murmur adds a short block to ' + fileName + ': the shortcut (start on press, stop on release) and rules that keep its overlay floating and out of focus. You can remove it in Settings.'}</p>
            <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#A1A1A1' }}>
                <${Progress} pct=${dlPct} t=${t} />
                <span>${dlText}</span>
              </div>
              <div class="no-drag" style=${{ display: 'flex', gap: '10px' }}>
                <${Soft} onClick=${back}>Back<//>
                <${Primary} t=${t} onClick=${addToHyprland}>${s.hypr.added ? 'Continue' : 'Add to Hyprland'}<//>
              </div>
            </div>
          </div>`}

        ${step === 3 && html`
          <div key="s3" class="mm-in-x" style=${{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h1 style=${H1}>Try it</h1>
              <p style=${{ ...LEAD, maxWidth: '540px' }}>Click into the box, hold ${comboText} and say something. No keyboard handy? Hold the button instead.</p>
            </div>
            <div class="no-drag" style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label for="mm-try" style=${{ fontSize: '13px', fontWeight: 600, color: '#D4D4D4' }}>Practice</label>
              <textarea id="mm-try" ref=${area} value=${tryText} onInput=${(e) => setTryText(e.target.value)} placeholder="Your words will show up here."
                style=${{ height: '120px', boxSizing: 'border-box', resize: 'none', padding: '14px 16px', borderRadius: '16px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.11)', color: '#F5F5F5', fontSize: '16px', lineHeight: 1.5, userSelect: 'text' }}></textarea>
            </div>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <button type="button" class="lg lg-soft lg-btn lg-press" onPointerDown=${tryDown} onPointerUp=${tryUp} onPointerLeave=${tryUp}
                style=${{ height: '44px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 18px 0 14px', border: '1px solid ' + (trying ? t.accent : 'transparent'), borderRadius: '999px', backgroundColor: trying ? t.a(0.18) : 'rgba(255,255,255,0.06)', color: '#F5F5F5', fontSize: '15px', fontWeight: 500, cursor: 'pointer', touchAction: 'none' }}>
                <${MicIcon} size=${18} stroke=${t.text} />
                ${trying ? 'Listening… let go to type' : 'Hold to talk'}
              </button>
              <div style=${{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span aria-hidden="true" style=${{ display: 'flex', alignItems: 'center', gap: '3px', height: '24px' }}>
                  ${meterH.map((h, i) => trying
                    ? html`<span class="mm-bar mm-anim" style=${{ display: 'block', width: '3px', height: h + 'px', borderRadius: '2px', background: t.text, animationDelay: (-((i * 37) % 9) / 10).toFixed(1) + 's' }}></span>`
                    : html`<span style=${{ display: 'block', width: '3px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.22)' }}></span>`)}
                </span>
                <span style=${{ fontSize: '13px', color: '#A1A1A1' }}>${s.inputLabel === 'Default' ? 'Default input · PipeWire' : s.inputLabel}</span>
              </div>
            </div>
            <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <span style=${{ fontSize: '13px', color: '#A1A1A1' }}>${dlText}</span>
              <div class="no-drag" style=${{ display: 'flex', gap: '10px' }}>
                <${Soft} onClick=${back}>Back<//>
                <${Primary} t=${t} onClick=${finish}>Finish<//>
              </div>
            </div>
          </div>`}

        ${step === 4 && html`
          <div key="s4" class="mm-in-x" style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', padding: '24px 0 8px', textAlign: 'center' }}>
            <span style=${{ width: '64px', height: '64px', borderRadius: '50%', background: '#00D492', boxShadow: 'inset 0 1px rgba(255,255,255,0.3), 0 8px 28px rgba(0,212,146,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <${CheckIcon} size=${30} />
            </span>
            <h1 style=${H1}>You’re all set</h1>
            <p style=${{ ...LEAD, maxWidth: '440px' }}>Murmur keeps running in the background. ${s.config.mode === 'tap' ? 'Tap' : 'Hold'} ${comboText} in any app whenever you want to talk instead of type.</p>
            ${s.autostart.available && html`
              <label class="no-drag" style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', fontSize: '14px', color: '#D4D4D4', cursor: 'pointer' }}>
                <input type="checkbox" checked=${s.autostart.on} onChange=${(e) => api.invoke('autostart:set', e.target.checked)} style=${{ width: '18px', height: '18px', accentColor: t.accent, cursor: 'pointer' }} />
                Start Murmur when I log in
              </label>`}
            <div class="no-drag" style=${{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <${Soft} onClick=${() => api.invoke('open', 'shortcut')}>Open settings<//>
              <${Primary} t=${t} onClick=${() => api.invoke('window:close')}>Close<//>
            </div>
          </div>`}
      </main>
    </div>`;
}

render(html`<${Setup} />`, document.getElementById('root'));
