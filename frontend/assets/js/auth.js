/**
 * BookLoop Session & Auth Manager
 * Manages JWT tokens, session persistence in localStorage, and user profile state.
 */

export class AuthManager {
  static TOKEN_KEY = 'bookloop_access_token';
  static USER_KEY  = 'bookloop_user_session';

  constructor() {
    this._token = localStorage.getItem(AuthManager.TOKEN_KEY) || sessionStorage.getItem(AuthManager.TOKEN_KEY) || null;
    this._user  = this._loadUser();
    this._listeners = [];
  }

  get isAuthenticated() {
    return Boolean(this._token && this._user);
  }

  get token() {
    return this._token;
  }

  get user() {
    return this._user;
  }

  get profile() {
    return this._user?.profile || null;
  }

  clearSession() {
    this.logout();
  }

  /** Store session details upon successful login or registration */
  setSession(token, user, persist = true) {
    this._token = token;
    this._user  = user;
    this._clearStoredSession();
    const storage = persist ? localStorage : sessionStorage;
    storage.setItem(AuthManager.TOKEN_KEY, token);
    storage.setItem(AuthManager.USER_KEY, JSON.stringify(user));
    this._notify();
  }

  /** Update user profile object in current session */
  updateProfile(updatedProfile) {
    if (this._user) {
      this._user.profile = { ...(this._user.profile || {}), ...updatedProfile };
      localStorage.setItem(AuthManager.USER_KEY, JSON.stringify(this._user));
      this._notify();
    }
  }

  /** Clear session data on logout */
  logout() {
    this._token = null;
    this._user  = null;
    localStorage.removeItem(AuthManager.TOKEN_KEY);
    localStorage.removeItem(AuthManager.USER_KEY);
    sessionStorage.removeItem(AuthManager.TOKEN_KEY);
    sessionStorage.removeItem(AuthManager.USER_KEY);
    this._notify();
  }

  /** Subscribe to authentication state changes */
  onChange(listener) {
    this._listeners.push(listener);
  }

  _notify() {
    this._listeners.forEach(fn => fn(this._user, this.isAuthenticated));
  }

  _loadUser() {
    try {
      const raw = localStorage.getItem(AuthManager.USER_KEY) || sessionStorage.getItem(AuthManager.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _clearStoredSession() {
    localStorage.removeItem(AuthManager.TOKEN_KEY);
    localStorage.removeItem(AuthManager.USER_KEY);
    sessionStorage.removeItem(AuthManager.TOKEN_KEY);
    sessionStorage.removeItem(AuthManager.USER_KEY);
  }
}

export const auth = new AuthManager();
