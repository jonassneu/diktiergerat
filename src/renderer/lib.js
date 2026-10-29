import { h, render } from 'preact';
import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, useState, useEffect, useRef, useMemo, useCallback };

export const api = window.murmur;

// Accent tones, same math as the design.
export function tones(accent) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(accent || '').trim());
  const v = m ? m[1] : '346BF1';
  const c = [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  const f = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  const a = (al) => 'rgba(' + c.join(', ') + ', ' + al + ')';
  const w = (t) => 'rgb(' + c.map((x) => Math.round(x + (255 - x) * t)).join(', ') + ')';
  const k = (t) => 'rgb(' + c.map((x) => Math.round(x * t)).join(', ') + ')';
  return {
    accent: '#' + v,
    a, w, k,
    ink: 1.05 / (L + 0.05) >= 4.5 ? '#FFFFFF' : '#000000',
    text: w(0.35),
    deep: k(0.22),
    mid: k(0.6),
    tile: k(0.28)
  };
}

// Live app state pushed from the main process.
export function useAppState() {
  const [state, setState] = useState(null);
  useEffect(() => {
    api.invoke('state').then(setState);
    return api.on('state', setState);
  }, []);
  return state;
}

export const MicIcon = ({ size = 20, stroke, width = 1.9 }) => html`
  <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke=${stroke} stroke-width=${width} stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path></svg>`;

export const CheckIcon = ({ size = 20, stroke = '#002A1C', width = 2.6, style }) => html`
  <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke=${stroke} stroke-width=${width} stroke-linecap="round" stroke-linejoin="round" style=${style}><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>`;

export const WarnIcon = ({ size = 16, stroke = '#FFB900', width = 2, style }) => html`
  <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke=${stroke} stroke-width=${width} stroke-linecap="round" stroke-linejoin="round" style=${style}><path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17h.01"></path></svg>`;

export const CloseIcon = ({ size = 14, width = 2.2 }) => html`
  <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${width} stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>`;

export const CopyIcon = ({ size = 18, width = 1.8 }) => html`
  <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${width} stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>`;

export const Logo = ({ size = 32, t, width = 3.6 }) => html`
  <svg aria-hidden="true" width=${size} height=${size} viewBox="0 0 48 48"><rect width="48" height="48" rx="13" fill=${t.tile}></rect><g stroke=${t.text} stroke-width=${width} stroke-linecap="round"><path d="M12 21v6M18 16v16M24 11v26M30 17v14M36 21v6"></path></g></svg>`;

export const Keycap = ({ label, height = 40, pad, radius = 10, size = 15 }) => html`
  <span class="lg lg-soft lg-btn" style=${{ display: 'inline-flex', alignItems: 'center', height: height + 'px', padding: pad || (label === 'Space' ? '0 30px' : '0 13px'), borderRadius: radius + 'px', fontSize: size + 'px', fontWeight: 600, color: '#F5F5F5' }}>${label}</span>`;

export const MiniKey = ({ label, wide }) => html`
  <span style=${{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '22px', minWidth: '22px', padding: wide ? '0 14px' : '0 7px', borderRadius: '5px', background: 'rgba(245,245,245,0.1)', fontSize: '12px', fontWeight: 500, color: '#E5E5E5' }}>${label}</span>`;

// Decorative background shared by the windows (the "desktop" in the design).
export const Backdrop = ({ t, variant = 'side' }) => {
  const blobs = variant === 'setup'
    ? [['-180px', null, null, '-340px', 820, t.deep], ['58%', '52%', null, null, 360, t.mid], [null, '-200px', '-120px', null, 560, '#12152B']]
    : [['-200px', '80px', null, null, 820, t.deep], ['6%', '32%', null, null, 340, t.mid], [null, null, '-140px', '-200px', 560, '#12152B']];
  return html`
    <div aria-hidden="true" style=${{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none' }}>
      ${blobs.map(([left, top, right, bottom, size, bg]) => html`<div style=${{ position: 'absolute', left, top, right, bottom, width: size + 'px', height: size + 'px', borderRadius: '50%', background: bg, opacity: 0.55 }}></div>`)}
      <div style=${{ position: 'absolute', inset: 0, backgroundImage: 'repeating-radial-gradient(circle at 8% 40%, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 64px)' }}></div>
      <div class="t3-grain" style=${{ position: 'absolute', inset: 0 }}></div>
    </div>`;
};
