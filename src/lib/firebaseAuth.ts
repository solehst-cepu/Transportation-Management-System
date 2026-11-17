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

function getFirebaseAuthInstance(): Auth {
  if (!authInstance) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
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
