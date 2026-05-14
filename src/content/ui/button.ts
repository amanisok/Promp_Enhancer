/**
 * Floating "Enhance" button injected next to the host page's prompt input.
 * Owns its own visual state machine — idle / loading / disabled.
 */

import { PE_CLASS } from '../../utils/constants';

export type ButtonState = 'idle' | 'loading' | 'disabled';

export interface EnhanceButton {
  readonly element: HTMLButtonElement;
  setState(state: ButtonState): void;
  destroy(): void;
}

const ICON_SVG = `
<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" class="pe-icon">
  <path d="M10 2.5l1.6 4 4 1.6-4 1.6L10 13.7l-1.6-4-4-1.6 4-1.6L10 2.5z" fill="currentColor"/>
  <path d="M15.5 12.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" fill="currentColor" opacity="0.7"/>
</svg>`.trim();

const SPINNER_SVG = `
<svg viewBox="0 0 24 24" class="pe-spinner" aria-hidden="true">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-dasharray="40 60"></circle>
</svg>`.trim();

/**
 * Create an enhance button. Caller is responsible for inserting `element`
 * into the DOM and calling `destroy()` on cleanup.
 */
export function createEnhanceButton(onClick: () => void): EnhanceButton {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = PE_CLASS.BUTTON;
  btn.setAttribute('aria-label', 'Enhance prompt');
  btn.setAttribute('title', 'Enhance prompt');
  btn.innerHTML = `${ICON_SVG}<span class="pe-btn-label">Enhance</span>`;

  let state: ButtonState = 'idle';
  // Guard the click handler itself against fast double-click — flip the gate
  // BEFORE invoking onClick so a synchronous second event can't slip through
  // before onClick has had a chance to call setState('loading').
  let gate = false;

  const handler = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (gate || state !== 'idle') return;
    gate = true;
    try {
      onClick();
    } finally {
      // Release the gate on the next tick — setState should have transitioned
      // the button to a non-idle state by then. If onClick decided NOT to start
      // (e.g., empty input), the gate releases without harm.
      setTimeout(() => {
        gate = false;
      }, 0);
    }
  };
  // Use capture phase + pointerdown so host page handlers can't swallow it.
  btn.addEventListener('pointerdown', handler, true);
  btn.addEventListener('click', handler, true);

  const setState = (next: ButtonState): void => {
    state = next;
    btn.classList.remove(PE_CLASS.BUTTON_LOADING, PE_CLASS.BUTTON_DISABLED);
    btn.disabled = next !== 'idle';
    if (next === 'loading') {
      btn.classList.add(PE_CLASS.BUTTON_LOADING);
      btn.innerHTML = `${SPINNER_SVG}<span class="pe-btn-label">Enhancing…</span>`;
    } else if (next === 'disabled') {
      btn.classList.add(PE_CLASS.BUTTON_DISABLED);
      btn.innerHTML = `${ICON_SVG}<span class="pe-btn-label">Enhance</span>`;
    } else {
      btn.innerHTML = `${ICON_SVG}<span class="pe-btn-label">Enhance</span>`;
    }
  };

  const destroy = (): void => {
    btn.removeEventListener('pointerdown', handler, true);
    btn.removeEventListener('click', handler, true);
    btn.remove();
  };

  return { element: btn, setState, destroy };
}
