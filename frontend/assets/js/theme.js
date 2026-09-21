/**
 * BookLoop Theme Management (Light / Dark Mode)
 */

const THEME_STORAGE_KEY = 'bookloop_theme';

export class ThemeManager {
  constructor() {
    this.currentTheme = this.getInitialTheme();
    this.applyTheme(this.currentTheme);
  }

  getInitialTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    // Fall back to system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    this.notifyThemeChange();
  }

  toggle() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    return nextTheme;
  }

  notifyThemeChange() {
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: this.currentTheme } }));
  }
}

export const themeManager = new ThemeManager();
