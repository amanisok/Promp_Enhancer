/**
 * Result modal. Shows original + enhanced prompt with Copy / Use / Close,
 * plus Phase-3 additions: Diff toggle, Regenerate, Try another style.
 *
 * Implements focus trap and Escape-to-close. No inline styles — see content.css.
 */

import { PE_CLASS, StyleId, STYLE_LABELS } from '../../utils/constants';
import { wordDiff } from '../../utils/diff';
import { analyzeChange } from '../../utils/similarity';
import { showStyleMenu } from './style-menu';

export interface ModalCallbacks {
  onUse: (enhanced: string) => void;
  onCopy?: (enhanced: string) => void;
  onClose?: () => void;
  /** Re-run with the same style. Returns the new enhanced text. */
  onRegenerate?: () => Promise<string>;
  /** Re-run with a different style. Returns the new enhanced text. */
  onChangeStyle?: (style: StyleId) => Promise<string>;
}

export interface ModalOptions {
  original: string;
  enhanced: string;
  style: StyleId;
  callbacks: ModalCallbacks;
}

const TEMPLATE = `
<div class="pe-modal-overlay" data-pe-overlay>
  <div class="pe-modal-card" role="dialog" aria-modal="true" aria-labelledby="pe-modal-title" tabindex="-1">
    <div class="pe-modal-header">
      <div class="pe-modal-header__left">
        <h2 id="pe-modal-title" class="pe-modal-title">Enhanced Prompt</h2>
        <button type="button" class="pe-style-chip" data-pe-action="change-style" aria-label="Change style">
          <span class="pe-style-chip__icon" aria-hidden="true">✨</span>
          <span class="pe-style-chip__label" data-pe-style-label></span>
          <span class="pe-style-chip__caret" aria-hidden="true">▾</span>
        </button>
      </div>
      <button type="button" class="pe-icon-btn" data-pe-action="close" aria-label="Close">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="pe-modal-body">
      <div class="pe-banner" data-pe-banner hidden></div>
      <label class="pe-field-label" for="pe-original">Original</label>
      <textarea id="pe-original" class="pe-textarea pe-textarea--muted" readonly data-pe-original></textarea>
      <div class="pe-enhanced-header">
        <label class="pe-field-label" for="pe-enhanced">Enhanced</label>
        <button type="button" class="pe-link-btn" data-pe-action="toggle-diff" aria-pressed="false">Show diff</button>
      </div>
      <textarea id="pe-enhanced" class="pe-textarea" readonly data-pe-enhanced></textarea>
      <div class="pe-diff" data-pe-diff hidden></div>
    </div>
    <div class="pe-modal-footer">
      <button type="button" class="pe-btn pe-btn--ghost" data-pe-action="close">Close</button>
      <button type="button" class="pe-btn pe-btn--ghost" data-pe-action="regenerate">Regenerate</button>
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
export function showModal(options: ModalOptions): () => void {
  const { original, callbacks: cb } = options;
  let currentEnhanced = options.enhanced;
  let currentStyle: StyleId = options.style;
  let diffVisible = false;

  const host = document.createElement('div');
  host.className = PE_CLASS.ROOT;
  host.innerHTML = TEMPLATE;
  document.body.appendChild(host);

  const overlay = host.querySelector<HTMLElement>('[data-pe-overlay]');
  const card = host.querySelector<HTMLElement>('.pe-modal-card');
  const originalEl = host.querySelector<HTMLTextAreaElement>('[data-pe-original]');
  const enhancedEl = host.querySelector<HTMLTextAreaElement>('[data-pe-enhanced]');
  const diffEl = host.querySelector<HTMLElement>('[data-pe-diff]');
  const banner = host.querySelector<HTMLElement>('[data-pe-banner]');
  const styleLabelEl = host.querySelector<HTMLElement>('[data-pe-style-label]');
  const toggleBtn = host.querySelector<HTMLButtonElement>('[data-pe-action="toggle-diff"]');
  const regenBtn = host.querySelector<HTMLButtonElement>('[data-pe-action="regenerate"]');
  const useBtn = host.querySelector<HTMLButtonElement>('[data-pe-action="use"]');
  const copyBtn = host.querySelector<HTMLButtonElement>('[data-pe-action="copy"]');
  const styleChipBtn = host.querySelector<HTMLButtonElement>('[data-pe-action="change-style"]');

  if (!overlay || !card || !originalEl || !enhancedEl || !diffEl || !styleLabelEl) {
    host.remove();
    return () => undefined;
  }

  originalEl.value = original;
  enhancedEl.value = currentEnhanced;
  renderStyleLabel();
  renderBanner();

  // Fade-in
  requestAnimationFrame(() => overlay.classList.add('pe-modal-overlay--open'));

  const previousActive = document.activeElement as HTMLElement | null;

  function renderStyleLabel(): void {
    styleLabelEl!.textContent = STYLE_LABELS[currentStyle].label;
  }

  function renderBanner(): void {
    const change = analyzeChange(original, currentEnhanced);
    if (change.level === 'identical') {
      banner!.textContent = 'Your prompt is already well-written — no changes were needed.';
      banner!.dataset.peLevel = 'info';
      banner!.hidden = false;
    } else if (change.level === 'minimal') {
      banner!.textContent = 'Looks good already — only minor polish suggested.';
      banner!.dataset.peLevel = 'info';
      banner!.hidden = false;
    } else {
      banner!.hidden = true;
    }
  }

  function renderDiff(): void {
    const tokens = wordDiff(original, currentEnhanced);
    diffEl!.replaceChildren();
    if (tokens === null) {
      diffEl!.textContent =
        'Diff is too large to render — switch back to plain view to compare side-by-side.';
      diffEl!.dataset.peDiffEmpty = '1';
      return;
    }
    delete diffEl!.dataset.peDiffEmpty;
    for (const t of tokens) {
      const span = document.createElement('span');
      span.className = `pe-diff-${t.op}`;
      span.textContent = t.text;
      diffEl!.appendChild(span);
    }
  }

  function setDiffVisible(next: boolean): void {
    diffVisible = next;
    enhancedEl!.hidden = next;
    diffEl!.hidden = !next;
    toggleBtn!.textContent = next ? 'Show plain' : 'Show diff';
    toggleBtn!.setAttribute('aria-pressed', next ? 'true' : 'false');
    if (next) renderDiff();
  }

  function setBusy(busy: boolean): void {
    if (regenBtn) regenBtn.disabled = busy;
    if (useBtn) useBtn.disabled = busy;
    if (copyBtn) copyBtn.disabled = busy;
    if (toggleBtn) toggleBtn.disabled = busy;
    if (styleChipBtn) styleChipBtn.disabled = busy;
    card!.dataset.peBusy = busy ? '1' : '';
  }

  function setEnhanced(text: string, newStyle: StyleId): void {
    currentEnhanced = text;
    currentStyle = newStyle;
    enhancedEl!.value = text;
    renderStyleLabel();
    renderBanner();
    if (diffVisible) renderDiff();
  }

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      banner!.textContent = msg;
      banner!.dataset.peLevel = 'err';
      banner!.hidden = false;
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const close = (): void => {
    overlay.classList.remove('pe-modal-overlay--open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => host.remove(), 200);
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
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (action === 'close') {
        close();
      } else if (action === 'copy') {
        const ok = await copyToClipboard(currentEnhanced);
        const label = el.textContent;
        el.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => {
          if (el.isConnected) el.textContent = label ?? 'Copy';
        }, 1200);
        if (ok) cb.onCopy?.(currentEnhanced);
      } else if (action === 'use') {
        cb.onUse(currentEnhanced);
        close();
      } else if (action === 'toggle-diff') {
        setDiffVisible(!diffVisible);
      } else if (action === 'regenerate') {
        if (!cb.onRegenerate) return;
        const next = await withBusy(() => cb.onRegenerate!());
        if (next) setEnhanced(next, currentStyle);
      } else if (action === 'change-style') {
        if (!cb.onChangeStyle) return;
        showStyleMenu({
          anchor: el,
          current: currentStyle,
          onPick: async (picked) => {
            const next = await withBusy(() => cb.onChangeStyle!(picked));
            if (next) setEnhanced(next, picked);
          },
        });
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
