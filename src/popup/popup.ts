/**
 * Popup logic. Shows usage stats. No API key UI — the proxy holds the key.
 */

import { MESSAGES } from '../utils/constants';

interface UsageStats {
  used: number;
  limit: number;
  windowMs: number;
  resetMs: number;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function formatReset(ms: number): string {
  if (ms <= 0) return '';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `Resets in ${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `Resets in ${h}h ${rem}m`;
}

async function refreshUsage(): Promise<void> {
  const stats = await new Promise<UsageStats>((resolve) => {
    chrome.runtime.sendMessage({ type: MESSAGES.GET_USAGE_STATS }, (res: UsageStats) => {
      resolve(res);
    });
  });
  $('usage-text').textContent = `${stats.used} / ${stats.limit}`;
  const pct = Math.min(100, (stats.used / stats.limit) * 100);
  ($('usage-bar') as HTMLElement).style.width = `${pct}%`;
  $('usage-reset').textContent = formatReset(stats.resetMs);
}

async function handleResetUsage(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.runtime.sendMessage({ type: MESSAGES.RESET_USAGE }, () => resolve());
  });
  await refreshUsage();
}

$('reset-usage').addEventListener('click', () => void handleResetUsage());
void refreshUsage();
