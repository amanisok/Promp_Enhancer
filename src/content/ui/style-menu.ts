/**
 * Floating style picker. Shown on first enhance click (and from the modal's
 * "Try another style" button). Returns the chosen StyleId via callback.
 */

import { StyleId, STYLE_LABELS, STYLE_ORDER } from '../../utils/constants';

export interface StyleMenuOptions {
  /** Element to anchor the popover to (positions above the anchor). */
  anchor: HTMLElement;
  /** Currently-selected style; pre-highlighted in the menu. */
  current?: StyleId;
  /** Called when the user picks a style. The caller is responsible for closing. */
  onPick: (style: StyleId) => void;
  /** Called when the user dismisses (Esc, outside-click). */
  onDismiss?: () => void;
}

export interface StyleMenu {
  close(): void;
}

/**
 * Render the style picker. Returns an object with `close()` to dismiss programmatically.
 */
export function showStyleMenu(options: StyleMenuOptions): StyleMenu {
  const { anchor, current, onPick, onDismiss } = options;

  const host = document.createElement('div');
  host.className = 'pe-root pe-style-menu';
  host.setAttribute('role', 'menu');
  host.setAttribute('aria-label', 'Choose enhancement style');

  for (const id of STYLE_ORDER) {
    const meta = STYLE_LABELS[id];
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pe-style-item';
    item.setAttribute('role', 'menuitem');
    item.dataset.peStyle = id;
    if (id === current) item.classList.add('pe-style-item--current');
    item.innerHTML = `<span class="pe-style-item__label">${meta.label}</span><span class="pe-style-item__hint">${meta.hint}</span>`;
    host.appendChild(item);
  }

  document.body.appendChild(host);
  positionAbove(host, anchor);

  let closed = false;
  const close = (dismissed = false): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    host.remove();
    if (dismissed) onDismiss?.();
  };

  const reposition = (): void => positionAbove(host, anchor);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(host, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset.peStyle) {
        e.preventDefault();
        onPick(active.dataset.peStyle as StyleId);
      }
    }
  };

  const onOutside = (e: MouseEvent): void => {
    if (e.target instanceof Node && !host.contains(e.target) && !anchor.contains(e.target)) {
      close(true);
    }
  };

  host.addEventListener('click', (e) => {
    const t =
      e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-pe-style]') : null;
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    onPick(t.dataset.peStyle as StyleId);
  });

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);

  // Focus the current item (or first) for keyboard nav.
  requestAnimationFrame(() => {
    const target =
      host.querySelector<HTMLElement>('.pe-style-item--current') ??
      host.querySelector<HTMLElement>('.pe-style-item');
    target?.focus();
  });

  return { close: () => close(false) };
}

function positionAbove(menu: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  // Render the menu near the anchor; keep it within the viewport.
  const menuRect = menu.getBoundingClientRect();
  const top = Math.max(margin, rect.top - menuRect.height - margin);
  const left = Math.min(
    Math.max(margin, rect.right - menuRect.width),
    window.innerWidth - menuRect.width - margin
  );
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function moveFocus(menu: HTMLElement, delta: number): void {
  const items = Array.from(menu.querySelectorAll<HTMLElement>('.pe-style-item'));
  if (items.length === 0) return;
  const idx = items.findIndex((el) => el === document.activeElement);
  const next = ((idx === -1 ? 0 : idx + delta) + items.length) % items.length;
  items[next]?.focus();
}
