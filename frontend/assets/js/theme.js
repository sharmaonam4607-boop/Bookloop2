/**
 * BookLoop Theme Manager
 * Dark / Light mode toggle with system preference detection and localStorage persistence.
 */
export class ThemeManager {
  static STORAGE_KEY = 'bookloop_theme';

  constructor() {
    this._theme = this._loadPreference();
    this._apply(this._theme);
  }

  /** Returns current theme ('dark' | 'light') */
  get current() { return this._theme; }

  toggle() {
    this._theme = this._theme === 'dark' ? 'light' : 'dark';
    this._apply(this._theme);
    localStorage.setItem(ThemeManager.STORAGE_KEY, this._theme);
    return this._theme;
  }

  _apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = theme === 'dark' ? '#070b18' : '#f4f6fb';
  }

  _loadPreference() {
    const stored = localStorage.getItem(ThemeManager.STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    // Respect system preference as default
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}
