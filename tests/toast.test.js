import { afterEach, describe, expect, test } from 'bun:test';
import { collectText, installDom, toastItems } from './dom-stub.js';
import { MAX_TOASTS, resetToasts, showToast } from '../src/ui/toast.js';

let dom;

afterEach(() => {
  resetToasts();
  dom?.restore();
  dom = null;
});

describe('showToast', () => {
  test('puts file names in text nodes instead of HTML', () => {
    dom = installDom();
    const payload = '<img src=x onerror=alert(1)>';
    showToast({
      title: payload,
      message: payload,
      sub: payload,
      type: 'error',
      duration: 0,
    });

    const item = toastItems(dom.body)[0];
    expect(collectText(item)).toContain(payload);
    const htmlSlots = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.innerHTML) htmlSlots.push(node.innerHTML);
      for (const child of node.children || []) walk(child);
    };
    walk(item);
    expect(htmlSlots.join('\n')).not.toContain('<img');
    expect(htmlSlots.join('\n')).not.toContain('onerror');
  });

  test('evicts a success card before an error card', () => {
    dom = installDom();
    for (let i = 0; i < MAX_TOASTS; i++) {
      showToast({ id: `s${i}`, type: 'success', title: `success-${i}`, duration: 0 });
    }
    showToast({ id: 'err', type: 'error', title: 'keep-error', duration: 0 });

    const live = toastItems(dom.body).filter((item) => !item.className.includes('hiding'));
    const text = live.map((item) => collectText(item)).join('\n');
    expect(text).toContain('keep-error');
    expect(text).not.toContain('success-0');
    expect(text).toContain('success-1');
  });
});
