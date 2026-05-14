/**
 * Platform detection for supported AI chat sites.
 * Returns the textarea/contenteditable selector and how to read/write its content.
 */

export type ContentType = 'value' | 'innerText' | 'innerHTML';

export interface PlatformConfig {
  name: 'chatgpt' | 'claude' | 'gemini';
  /** CSS selectors tried in order. First match wins. */
  textareaSelectors: string[];
  /** Optional form/container selector for anchoring the button. */
  formSelectors: string[];
  /** How to read/write the element content. */
  contentType: ContentType;
}

const CHATGPT: PlatformConfig = {
  name: 'chatgpt',
  textareaSelectors: [
    '#prompt-textarea',
    'div[contenteditable="true"][data-id]',
    'textarea[data-id]',
    'textarea[placeholder*="Message" i]',
  ],
  formSelectors: ['form', 'main form'],
  contentType: 'innerText',
};

const CLAUDE: PlatformConfig = {
  name: 'claude',
  textareaSelectors: [
    'div[contenteditable="true"].ProseMirror',
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    '[aria-label*="prompt" i][contenteditable="true"]',
    'fieldset div[contenteditable="true"]',
    'div[contenteditable="true"]',
  ],
  formSelectors: ['fieldset', 'form'],
  contentType: 'innerText',
};

const GEMINI: PlatformConfig = {
  name: 'gemini',
  textareaSelectors: [
    'rich-textarea div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ],
  formSelectors: ['rich-textarea', 'form'],
  contentType: 'innerText',
};

/**
 * Detect which platform the content script is currently running on.
 * Returns null if the hostname is not supported.
 */
export function getPlatformConfig(): PlatformConfig | null {
  const host = window.location.hostname;
  if (host.endsWith('chatgpt.com') || host.endsWith('chat.openai.com')) return CHATGPT;
  if (host.endsWith('claude.ai')) return CLAUDE;
  if (host.endsWith('gemini.google.com')) return GEMINI;
  return null;
}

/**
 * Find the first matching textarea/contenteditable for the given platform.
 */
export function findTextarea(cfg: PlatformConfig): HTMLElement | null {
  for (const sel of cfg.textareaSelectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Read the current text from the platform's input element.
 */
export function readContent(el: HTMLElement, type: ContentType): string {
  if (type === 'value' && el instanceof HTMLTextAreaElement) return el.value;
  if (type === 'innerHTML') return el.innerHTML;
  return el.innerText;
}

/**
 * Write text into the platform's input element and dispatch input events
 * so the host framework (React, etc.) registers the change.
 */
export function writeContent(el: HTMLElement, type: ContentType, text: string): void {
  if (type === 'value' && el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, text);
  } else {
    el.focus();
    // Replace content via execCommand for contenteditable so frameworks observe it.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, text);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
