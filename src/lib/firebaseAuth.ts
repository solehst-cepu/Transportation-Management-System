import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
] as const;

let authInstance: Auth | null = null;
// Strict in-memory token cache (never localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export function getCachedGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearCachedGoogleAccessToken() {
  cachedAccessToken = null;
}

const resolvedFirebaseConfig = {
  ...firebaseConfig,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
};

export function getActiveFirebaseProjectId(): string {
  return resolvedFirebaseConfig.projectId || '';
}

function getFirebaseAuthInstance(): Auth {
  if (!authInstance) {
    const app = getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);
    authInstance = getAuth(app);
    onAuthStateChanged(authInstance, (user) => {
      if (!user && !isSigningIn) {
        cachedAccessToken = null;
      }
    });
  }
  return authInstance;
}

export async function signInWithGooglePopup(allowedDomain = 'lazuardi.sch.id'): Promise<{
  firebaseIdToken: string;
  idToken?: string;
  oauthAccessToken?: string;
}> {
  const auth = getFirebaseAuthInstance();
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_OAUTH_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    hd: allowedDomain,
    prompt: 'select_account',
  });

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const firebaseIdToken = await result.user.getIdToken();
    cachedAccessToken = credential?.accessToken || null;

    return {
      firebaseIdToken,
      idToken: credential?.idToken || undefined,
      oauthAccessToken: cachedAccessToken || undefined,
    };
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : String(err || '');
    if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      const wrapped = new Error(
        `auth/unauthorized-domain: Domain "${host}" belum terdaftar di Authorized Domains Firebase (${resolvedFirebaseConfig.projectId}).`
      ) as Error & { code?: string; hostname?: string; projectId?: string };
      wrapped.code = 'auth/unauthorized-domain';
      wrapped.hostname = host;
      wrapped.projectId = resolvedFirebaseConfig.projectId;
      throw wrapped;
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export async function signOutFirebaseGoogle(): Promise<void> {
  cachedAccessToken = null;
  if (authInstance) {
    try {
      await signOut(authInstance);
    } catch {
      // Ignore signOut errors if not active
    }
  }
}
