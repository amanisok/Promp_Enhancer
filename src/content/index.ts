/**
 * Content script entry. Detects the host platform, watches for the prompt
 * textarea via MutationObserver, injects the enhance button, and orchestrates
 * the enhance → modal → write-back flow.
 */

import { EnhancerError, enhancePrompt } from './enhancer';
import {
  findTextarea,
  getPlatformConfig,
  PlatformConfig,
  readContent,
  writeContent,
} from './platforms';
import { createEnhanceButton, EnhanceButton } from './ui/button';
import { showModal } from './ui/modal';
import { validateLength } from '../utils/sanitize';

const DEBOUNCE_MS = 500;
const BUTTON_MARKER = 'data-pe-injected';

let currentButton: EnhanceButton | null = null;
let currentTarget: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
let started = false;
let lastUrl = location.href;
let urlCleanup: (() => void) | null = null;
let inFlight = false;

function notify(message: string): void {
  const host = document.createElement('div');
  host.className = 'pe-root pe-toast-root';
  host.innerHTML = `<div class="pe-toast">${message.replace(/</g, '&lt;')}</div>`;
  document.body.appendChild(host);
  requestAnimationFrame(() => host.firstElementChild?.classList.add('pe-toast--open'));
  setTimeout(() => host.remove(), 3500);
}

function teardownButton(): void {
  currentButton?.destroy();
  currentButton = null;
  currentTarget = null;
  document.querySelectorAll(`[${BUTTON_MARKER}]`).forEach((n) => n.remove());
}

function teardownAll(): void {
  teardownButton();
  observer?.disconnect();
  observer = null;
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  urlCleanup?.();
  urlCleanup = null;
  started = false;
}

const LONG_INPUT_WARN_CHARS = 5000;

async function handleEnhance(cfg: PlatformConfig): Promise<void> {
  if (inFlight) return;
  if (!currentTarget || !currentButton) return;

  // Snapshot the target NOW so SPA re-renders during the request can't redirect
  // our write-back to a stale element.
  const targetSnapshot = currentTarget;
  const buttonSnapshot = currentButton;
  const raw = readContent(targetSnapshot, cfg.contentType);

  // Pre-validate before loading state so empty/oversized input fails fast.
  const v = validateLength(raw);
  if (!v.ok || !v.value) {
    notify(v.reason ?? 'Invalid input.');
    return;
  }
  if (v.value.length > LONG_INPUT_WARN_CHARS) {
    notify(`Long prompt (${v.value.length} chars) — enhancement may take longer.`);
  }

  inFlight = true;
  buttonSnapshot.setState('loading');
  try {
    const enhanced = await enhancePrompt(v.value);
    buttonSnapshot.setState('idle');
    showModal(v.value, enhanced, {
      onUse: (text) => {
        // Prefer the live target if it's still connected; fall back to snapshot.
        const writeTarget =
          currentTarget && currentTarget.isConnected
            ? currentTarget
            : targetSnapshot.isConnected
              ? targetSnapshot
              : null;
        if (writeTarget) writeContent(writeTarget, cfg.contentType, text);
      },
    });
  } catch (err) {
    buttonSnapshot.setState('idle');
    const msg =
      err instanceof EnhancerError ? err.message : 'Something went wrong. Please try again.';
    notify(msg);
  } finally {
    inFlight = false;
  }
}

function tryInject(cfg: PlatformConfig): void {
  // Don't churn the button while an enhance call is in flight — would orphan
  // the loading spinner and the click handler.
  if (inFlight) return;

  const target = findTextarea(cfg);
  if (!target) {
    if (currentTarget && !currentTarget.isConnected) teardownButton();
    return;
  }
  if (currentTarget === target && currentButton?.element.isConnected) return;

  teardownButton();
  currentTarget = target;
  currentButton = createEnhanceButton(() => {
    void handleEnhance(cfg);
  });
  currentButton.element.setAttribute(BUTTON_MARKER, '1');

  // Apply the fixed-position anchor styles directly to the button — no wrapper —
  // so nothing in between can swallow pointer events.
  currentButton.element.classList.add('pe-root', 'pe-anchor');
  document.body.appendChild(currentButton.element);
}

function scheduleInject(cfg: PlatformConfig): void {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => tryInject(cfg), DEBOUNCE_MS);
}

function watchUrlChanges(cfg: PlatformConfig): void {
  const onMaybeNav = (): void => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    teardownButton();
    scheduleInject(cfg);
  };

  // SPA frameworks call pushState / replaceState directly — patch them to emit an event.
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (
    this: History,
    ...args: Parameters<History['pushState']>
  ): void {
    origPush.apply(this, args);
    window.dispatchEvent(new Event('pe:locationchange'));
  };
  history.replaceState = function (
    this: History,
    ...args: Parameters<History['replaceState']>
  ): void {
    origReplace.apply(this, args);
    window.dispatchEvent(new Event('pe:locationchange'));
  };

  window.addEventListener('popstate', onMaybeNav);
  window.addEventListener('hashchange', onMaybeNav);
  window.addEventListener('pe:locationchange', onMaybeNav);

  urlCleanup = (): void => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', onMaybeNav);
    window.removeEventListener('hashchange', onMaybeNav);
    window.removeEventListener('pe:locationchange', onMaybeNav);
  };
}

function start(): void {
  if (started) return;
  const cfg = getPlatformConfig();
  if (!cfg) return;
  started = true;

  tryInject(cfg);

  observer = new MutationObserver(() => scheduleInject(cfg));
  observer.observe(document.body, { childList: true, subtree: true });

  watchUrlChanges(cfg);
}

window.addEventListener('pagehide', teardownAll, { once: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
