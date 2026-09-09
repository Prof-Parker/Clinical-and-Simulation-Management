// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import {
  LIGHT_THEME_VARS,
  applyLightThemeVars,
  forceLightThemeOnDocument
} from '../src/export/student-calendar-pdf.js';

function clearThemeInline(el) {
  if (!el || !el.style) return;
  el.style.colorScheme = '';
  el.style.backgroundColor = '';
  el.style.color = '';
  Object.keys(LIGHT_THEME_VARS).forEach(function (key) {
    el.style.removeProperty(key);
  });
}

describe('student-calendar-pdf light theme', () => {
  afterEach(function () {
    document.documentElement.classList.remove('dark');
    clearThemeInline(document.documentElement);
    clearThemeInline(document.body);
  });

  it('forceLightThemeOnDocument strips html.dark without requiring a live theme toggle', () => {
    document.documentElement.classList.add('dark');
    forceLightThemeOnDocument(document);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--bg-card')).toBe('#ffffff');
    expect(document.documentElement.style.getPropertyValue('--text')).toBe('#1e293b');
    expect(document.documentElement.style.getPropertyValue('--surface-alt')).toBe('#f1f5f9');
  });

  it('applyLightThemeVars writes light tokens onto the PDF host', () => {
    var el = document.createElement('div');
    applyLightThemeVars(el);
    expect(el.style.colorScheme).toBe('light');
    expect(el.style.getPropertyValue('--bg')).toBe(LIGHT_THEME_VARS['--bg']);
    expect(el.style.getPropertyValue('--bg-card')).toBe('#ffffff');
    expect(String(el.style.backgroundColor).replace(/\s/g, ''))
      .toMatch(/#ffffff|rgb\(255,255,255\)/i);
  });
});
