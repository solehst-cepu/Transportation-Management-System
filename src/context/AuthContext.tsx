import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppSettings, SessionUser, UserRole } from '../../shared/types.ts';
import {
  apiRequest,
  clearInMemoryAuthTokens,
  setInMemoryAuthTokens,
  setUnauthorizedHandler,
} from '../lib/api.ts';
import { signInWithGooglePopup, signOutFirebaseGoogle } from '../lib/firebaseAuth.ts';

export interface OAuthSheetInfo {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  connectedAt: string;
  connectedBy: string;
  lastSyncAt: string;
  lastAuthExpired?: boolean;
}

export interface StorageDiagnostics {
  engine: string;
  connectionMode?: 'service_account' | 'oauth' | 'local';
  googleSheetsConnected: boolean;
  googleDriveConnected: boolean;
  googleOAuthConfigured: boolean;
  spreadsheetIdMasked: string | null;
  oauthSheet?: OAuthSheetInfo | null;
  hasActiveOAuthToken?: boolean;
  timezone: string;
}

interface AuthConfig {
  googleClientId: string | null;
  firebaseGoogleAuthEnabled: boolean;
  firebaseProjectId?: string | null;
  allowedDomain: string;
  previewAuthEnabled: boolean;
  authenticated: boolean;
  storage: StorageDiagnostics;
}

interface AuthContextValue {
  user: SessionUser | null;
  config: AuthConfig | null;
  settings: AppSettings | null;
  unreadNotifications: number;
  loading: boolean;
  refreshSession: () => Promise<void>;
  refreshNotificationsCount: () => Promise<void>;
  loginWithGoogleCredential: (credential: string, loginScope?: UserRole) => Promise<void>;
  loginWithGooglePopup: (loginScope?: UserRole) => Promise<void>;
  reauthorizeGoogleWorkspace: () => Promise<string | null>;
  loginWithPreviewSession: (params: { email: string; name: string; role?: UserRole }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshNotificationsCount = useCallback(async () => {
    try {
      const res = await apiRequest<{ notifications: { is_read: boolean }[] }>('/api/notifications');
      setUnreadNotifications(res.notifications.filter((n) => !n.is_read).length);
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const cfg = await apiRequest<AuthConfig>('/api/auth/config');
      setConfig(cfg);

      if (cfg.authenticated) {
        const me = await apiRequest<{ user: SessionUser; settings: AppSettings | null }>('/api/auth/me');
        setUser(me.user);
        setSettings(me.settings);
        await refreshNotificationsCount();
      } else {
        clearInMemoryAuthTokens();
        setUser(null);
      }
    } catch {
      clearInMemoryAuthTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [refreshNotificationsCount]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearInMemoryAuthTokens();
      setUser(null);
      setUnreadNotifications(0);
    });
    void refreshSession();
    return () => setUnauthorizedHandler(null);
  }, [refreshSession]);

  const loginWithGoogleCredential = async (credential: string, loginScope: UserRole = 'ADMIN') => {
    const res = await apiRequest<{ user: SessionUser; sessionToken?: string; csrfToken?: string }>(
      '/api/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ credential, loginScope }),
      }
    );
    setInMemoryAuthTokens(res.sessionToken, res.csrfToken);
    setUser(res.user);
    await refreshSession();
  };

  const loginWithGooglePopup = async (loginScope: UserRole = 'ADMIN') => {
    const tokens = await signInWithGooglePopup(config?.allowedDomain || 'lazuardi.sch.id');
    const res = await apiRequest<{ user: SessionUser; sessionToken?: string; csrfToken?: string }>(
      '/api/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({
          credential: tokens.idToken,
          firebaseIdToken: tokens.firebaseIdToken,
          oauthAccessToken: tokens.oauthAccessToken,
          loginScope,
        }),
      }
    );
    setInMemoryAuthTokens(res.sessionToken, res.csrfToken);
    setUser(res.user);
    await refreshSession();
  };

  const reauthorizeGoogleWorkspace = async (): Promise<string | null> => {
    const tokens = await signInWithGooglePopup(config?.allowedDomain || 'lazuardi.sch.id');
    const res = await apiRequest<{ user: SessionUser; sessionToken?: string; csrfToken?: string }>(
      '/api/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({
          credential: tokens.idToken,
          firebaseIdToken: tokens.firebaseIdToken,
          oauthAccessToken: tokens.oauthAccessToken,
          loginScope: user?.role || 'ADMIN',
        }),
      }
    );
    setInMemoryAuthTokens(res.sessionToken, res.csrfToken);
    setUser(res.user);
    await refreshSession();
    return tokens.oauthAccessToken || null;
  };

  const loginWithPreviewSession = async (params: { email: string; name: string; role?: UserRole }) => {
    const res = await apiRequest<{ user: SessionUser; sessionToken?: string; csrfToken?: string }>(
      '/api/auth/preview-session',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    setInMemoryAuthTokens(res.sessionToken, res.csrfToken);
    setUser(res.user);
    await refreshSession();
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      await signOutFirebaseGoogle();
    } finally {
      clearInMemoryAuthTokens();
      setUser(null);
      setUnreadNotifications(0);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        config,
        settings,
        unreadNotifications,
        loading,
        refreshSession,
        refreshNotificationsCount,
        loginWithGoogleCredential,
        loginWithGooglePopup,
        reauthorizeGoogleWorkspace,
        loginWithPreviewSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
