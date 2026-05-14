/**
 * Result modal. Shows original + enhanced prompt with Copy / Use / Close actions.
 * Implements focus trap and Escape-to-close. No inline styles — see content.css.
 */

import { PE_CLASS } from '../../utils/constants';
import { analyzeChange } from '../../utils/similarity';

export interface ModalCallbacks {
  onUse: (enhanced: string) => void;
  onCopy?: (enhanced: string) => void;
  onClose?: () => void;
}

const TEMPLATE = `
<div class="pe-modal-overlay" data-pe-overlay>
  <div class="pe-modal-card" role="dialog" aria-modal="true" aria-labelledby="pe-modal-title" tabindex="-1">
    <div class="pe-modal-header">
      <h2 id="pe-modal-title" class="pe-modal-title">Enhanced Prompt</h2>
      <button type="button" class="pe-icon-btn" data-pe-action="close" aria-label="Close">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="pe-modal-body">
      <div class="pe-banner" data-pe-banner hidden></div>
      <label class="pe-field-label" for="pe-original">Original</label>
      <textarea id="pe-original" class="pe-textarea pe-textarea--muted" readonly data-pe-original></textarea>
      <label class="pe-field-label" for="pe-enhanced">Enhanced</label>
      <textarea id="pe-enhanced" class="pe-textarea" readonly data-pe-enhanced></textarea>
    </div>
    <div class="pe-modal-footer">
      <button type="button" class="pe-btn pe-btn--ghost" data-pe-action="close">Close</button>
      <button type="button" class="pe-btn pe-btn--ghost" data-pe-action="copy">Copy</button>
      <button type="button" class="pe-btn pe-btn--primary" data-pe-action="use">Use This</button>
    </div>
  </div>
</div>`;

/**
 * Copy text to the clipboard with a fallback to a hidden textarea + execCommand
 * for contexts where navigator.clipboard is blocked (cross-origin iframes,
 * non-secure contexts, some MV3 edge cases).
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

/**
 * Render the modal. Returns a close function the caller can also invoke.
 */
export function showModal(original: string, enhanced: string, cb: ModalCallbacks): () => void {
  const host = document.createElement('div');
  host.className = PE_CLASS.ROOT;
  host.innerHTML = TEMPLATE;
  document.body.appendChild(host);

  const overlay = host.querySelector<HTMLElement>('[data-pe-overlay]');
  const card = host.querySelector<HTMLElement>('.pe-modal-card');
  const originalEl = host.querySelector<HTMLTextAreaElement>('[data-pe-original]');
  const enhancedEl = host.querySelector<HTMLTextAreaElement>('[data-pe-enhanced]');
  if (!overlay || !card || !originalEl || !enhancedEl) {
    host.remove();
    return () => undefined;
  }
  originalEl.value = original;
  enhancedEl.value = enhanced;

  const banner = host.querySelector<HTMLElement>('[data-pe-banner]');
  if (banner) {
    const change = analyzeChange(original, enhanced);
    if (change.level === 'identical') {
      banner.textContent = 'Your prompt is already well-written — no changes were needed.';
      banner.dataset.peLevel = 'info';
      banner.hidden = false;
    } else if (change.level === 'minimal') {
      banner.textContent = 'Looks good already — only minor polish suggested.';
      banner.dataset.peLevel = 'info';
      banner.hidden = false;
    }
  }

  // Fade-in
  requestAnimationFrame(() => overlay.classList.add('pe-modal-overlay--open'));

  const previousActive = document.activeElement as HTMLElement | null;

  const close = (): void => {
    overlay.classList.remove('pe-modal-overlay--open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => host.remove(), 200);
    // Only restore focus if the previously-focused element is still in the DOM
    // and is actually focusable. SPA re-renders may have detached it.
    if (
      previousActive &&
      previousActive.isConnected &&
      typeof previousActive.focus === 'function'
    ) {
      try {
        previousActive.focus();
      } catch {
        /* element became unfocusable between the check and the call */
      }
    }
    cb.onClose?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const items = getFocusable(card);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  host.querySelectorAll<HTMLElement>('[data-pe-action]').forEach((el) => {
    const action = el.dataset.peAction;
    el.addEventListener('click', async () => {
      if (action === 'close') {
        close();
      } else if (action === 'copy') {
        const ok = await copyToClipboard(enhancedEl.value);
        const label = el.textContent;
        el.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => {
          if (el.isConnected) el.textContent = label ?? 'Copy';
        }, 1200);
        if (ok) cb.onCopy?.(enhancedEl.value);
      } else if (action === 'use') {
        cb.onUse(enhancedEl.value);
        close();
      }
    });
  });

  // Move focus into the dialog
  setTimeout(() => {
    const focusables = getFocusable(card);
    focusables[focusables.length - 1]?.focus();
  }, 50);

  return close;
}
