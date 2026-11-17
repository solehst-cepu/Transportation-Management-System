import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CookieOptions, Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { SessionUser, UserRole } from '../shared/types.ts';
import { dbStore } from './sheetsStore.ts';

const SESSION_COOKIE = 'lvbms_session';
const CSRF_COOKIE = 'lvbms_csrf';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface SessionTokenPayload {
  sid: string;
  user: SessionUser;
  exp: number;
}

// Strict in-memory storage for per-session Google OAuth access tokens (never written to disk/cookies)
const sessionOAuthTokens = new Map<string, { token: string; storedAt: number }>();
const OAUTH_TOKEN_TTL_MS = 55 * 60 * 1000;

function pruneExpiredOAuthTokens() {
  const now = Date.now();
  for (const [sid, entry] of sessionOAuthTokens.entries()) {
    if (now - entry.storedAt > OAUTH_TOKEN_TTL_MS) {
      sessionOAuthTokens.delete(sid);
    }
  }
}

let fallbackSecret: string | null = null;
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (fallbackSecret) {
    return fallbackSecret;
  }
  const candidates = [
    path.resolve(process.cwd(), '.data', '.session_secret'),
    '/tmp/.lvbms_session_secret',
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const stored = fs.readFileSync(filePath, 'utf8').trim();
        if (stored.length >= 32) {
          fallbackSecret = stored;
          return fallbackSecret;
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  fallbackSecret = crypto.randomBytes(32).toString('hex');
  for (const filePath of candidates) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fallbackSecret, { encoding: 'utf8', mode: 0o600 });
      break;
    } catch {
      // Try next candidate
    }
  }
  return fallbackSecret;
}

function signToken(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken<T>(token: string): T | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T & { exp?: number };
    if (parsed.exp && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function createCsrfToken(sid: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`${sid}:${nonce}`)
    .digest('base64url');
  return `${nonce}.${sig}`;
}

function verifyCsrfTokenForSession(sid: string, token: string): boolean {
  try {
    const [nonce, sig] = token.split('.');
    if (!nonce || !sig) return false;
    const expected = crypto
      .createHmac('sha256', getSessionSecret())
      .update(`${sid}:${nonce}`)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

function appendPartitionedCookieAttribute(res: Response, isSecure: boolean) {
  if (!isSecure) return;
  const existing = res.getHeader('Set-Cookie');
  if (!existing) return;
  const list = Array.isArray(existing) ? existing.map(String) : [String(existing)];
  const updated = list.map((cookieStr) =>
    cookieStr.includes('Partitioned') ? cookieStr : `${cookieStr}; Partitioned`
  );
  res.setHeader('Set-Cookie', updated);
}

export function setSessionCookies(
  req: Request,
  res: Response,
  user: SessionUser,
  oauthAccessToken?: string
): { csrfToken: string; sessionToken: string } {
  const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  const sid = crypto.randomUUID();
  if (oauthAccessToken && oauthAccessToken.trim()) {
    pruneExpiredOAuthTokens();
    sessionOAuthTokens.set(sid, { token: oauthAccessToken.trim(), storedAt: Date.now() });
  }
  const sessionPayload: SessionTokenPayload = {
    sid,
    user,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const sessionToken = signToken(sessionPayload);
  const csrfToken = createCsrfToken(sid);

  const sessionOpts: CookieOptions = {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
  const csrfOpts: CookieOptions = {
    httpOnly: false,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };

  res.cookie(SESSION_COOKIE, sessionToken, sessionOpts);
  res.cookie(CSRF_COOKIE, csrfToken, csrfOpts);
  appendPartitionedCookieAttribute(res, isSecure);

  return { csrfToken, sessionToken };
}

export function clearSessionCookies(req: Request, res: Response) {
  const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
  });
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
  });
  appendPartitionedCookieAttribute(res, isSecure);
}

function getSessionPayloadFromRequest(req: Request): SessionTokenPayload | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (cookieToken) {
    const parsedCookie = verifyToken<SessionTokenPayload>(cookieToken);
    if (parsedCookie?.user) return parsedCookie;
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) {
      const parsedBearer = verifyToken<SessionTokenPayload>(bearerToken);
      if (parsedBearer?.user) return parsedBearer;
    }
  }
  return null;
}

export function getSessionFromRequest(req: Request): SessionUser | null {
  return getSessionPayloadFromRequest(req)?.user || null;
}

export function clearGoogleOAuthTokenForRequest(req: Request) {
  const payload = getSessionPayloadFromRequest(req);
  if (payload?.sid) {
    sessionOAuthTokens.delete(payload.sid);
  }
}

export function getGoogleOAuthTokenFromRequest(req: Request): string | null {
  const headerToken = req.headers['x-google-access-token'];
  const payload = getSessionPayloadFromRequest(req);
  if (typeof headerToken === 'string' && headerToken.trim()) {
    const clean = headerToken.trim();
    if (payload?.sid) {
      sessionOAuthTokens.set(payload.sid, { token: clean, storedAt: Date.now() });
    }
    return clean;
  }
  if (payload?.sid) {
    const entry = sessionOAuthTokens.get(payload.sid);
    if (entry) {
      if (Date.now() - entry.storedAt <= OAUTH_TOKEN_TTL_MS) {
        return entry.token;
      }
      sessionOAuthTokens.delete(payload.sid);
    }
  }
  return null;
}

export interface AuthedRequest extends Request {
  sessionUser?: SessionUser;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Sesi berakhir atau belum login. Silakan masuk dengan Google SSO.' });
    return;
  }

  const allowedDomain = (process.env.ALLOWED_WORKSPACE_DOMAIN || 'lazuardi.sch.id').toLowerCase();

  // Re-validate active status and workspace domain from database on every request
  const db = await dbStore.getSnapshot();
  if (session.role === 'ADMIN') {
    if (!session.email.toLowerCase().endsWith(`@${allowedDomain}`)) {
      res.status(403).json({ error: `Akses Administrator hanya untuk akun Google @${allowedDomain}.` });
      return;
    }
    const admin = db.ADMIN_USERS.find(
      (a) => a.email.toLowerCase() === session.email.toLowerCase() && a.status === 'aktif'
    );
    if (!admin) {
      res.status(403).json({ error: 'Akun Administrator tidak aktif atau telah dicabut.' });
      return;
    }
    session.adminRole = admin.role;
  } else {
    const schoolUser = db.USERS.find((u) => u.email.toLowerCase() === session.email.toLowerCase());
    if (schoolUser && schoolUser.status !== 'aktif') {
      res.status(403).json({ error: 'Akun pengguna dinonaktifkan oleh Administrator.' });
      return;
    }
    if (schoolUser) {
      session.department_id = schoolUser.department_id;
      session.position = schoolUser.position;
      session.phone = schoolUser.phone;
    }
  }

  req.sessionUser = session;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.sessionUser || !roles.includes(req.sessionUser.role)) {
      res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki izin untuk modul ini.' });
      return;
    }
    next();
  };
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  if (
    req.path === '/auth/google' ||
    req.path === '/auth/preview-session' ||
    req.path === '/auth/logout'
  ) {
    next();
    return;
  }
  const headerToken = typeof req.headers['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'] : '';
  if (!headerToken) {
    res.status(403).json({ error: 'Validasi keamanan CSRF gagal. Silakan muat ulang halaman.' });
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  if (cookieToken && cookieToken === headerToken) {
    next();
    return;
  }

  // Fallback for cross-origin iframe previews where third-party cookies are blocked by browser:
  // Verify the HMAC CSRF token bound cryptographically to the active Bearer session ID.
  const payload = getSessionPayloadFromRequest(req);
  if (payload?.sid && verifyCsrfTokenForSession(payload.sid, headerToken)) {
    next();
    return;
  }

  res.status(403).json({ error: 'Validasi keamanan CSRF gagal. Silakan muat ulang halaman.' });
}

interface FirebaseAppletConfig {
  projectId?: string;
  apiKey?: string;
  oAuthClientId?: string;
}

let cachedFirebaseConfig: FirebaseAppletConfig | null | undefined;
export function getFirebaseAppletConfig(): FirebaseAppletConfig | null {
  if (cachedFirebaseConfig !== undefined) return cachedFirebaseConfig;
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
      cachedFirebaseConfig = parsed;
      return cachedFirebaseConfig;
    }
  } catch {
    // Ignore invalid file
  }
  cachedFirebaseConfig = null;
  return null;
}

let cachedSecureTokenCerts: { certs: Record<string, string>; expiresAt: number } | null = null;
async function getFirebaseSecureTokenCerts(): Promise<Record<string, string>> {
  if (cachedSecureTokenCerts && Date.now() < cachedSecureTokenCerts.expiresAt) {
    return cachedSecureTokenCerts.certs;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error('Gagal mengambil sertifikat publik Google untuk verifikasi sesi SSO.');
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;
  cachedSecureTokenCerts = {
    certs,
    expiresAt: Date.now() + ttlMs,
  };
  return certs;
}

export async function verifyGoogleSsoAndResolveUser(params: {
  credential?: string;
  firebaseIdToken?: string;
  oauthAccessToken?: string;
  loginScope?: UserRole;
}): Promise<SessionUser> {
  const allowedDomain = (process.env.ALLOWED_WORKSPACE_DOMAIN || 'lazuardi.sch.id').toLowerCase();
  const firebaseCfg = getFirebaseAppletConfig();
  const gisClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';

  let email = '';
  let name = '';
  let picture = '';
  let hostedDomain = '';

  if (params.credential) {
    const validAudiences = [gisClientId, firebaseCfg?.oAuthClientId].filter(
      (v): v is string => Boolean(v && v.trim())
    );
    if (validAudiences.length === 0) {
      throw new Error('GOOGLE_CLIENT_ID belum dikonfigurasi pada server.');
    }
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: params.credential,
      audience: validAudiences,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Payload Google ID Token tidak valid.');
    }
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw new Error('Issuer token Google tidak valid.');
    }
    if (!payload.email || !payload.email_verified) {
      throw new Error('Email Google belum terverifikasi.');
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new Error('Token Google telah kedaluwarsa.');
    }
    email = payload.email.toLowerCase();
    name = payload.name || email.split('@')[0];
    picture = payload.picture || '';
    hostedDomain = (payload.hd || '').toLowerCase();
  } else if (params.firebaseIdToken) {
    const projectId = firebaseCfg?.projectId;
    if (!projectId) {
      throw new Error('Konfigurasi Google Sign-In belum tersedia pada server.');
    }
    const certs = await getFirebaseSecureTokenCerts();
    const client = new OAuth2Client();
    const ticket = await client.verifySignedJwtWithCertsAsync(
      params.firebaseIdToken,
      certs,
      projectId,
      [`https://securetoken.google.com/${projectId}`]
    );
    const payload = ticket.getPayload() as
      | (ReturnType<typeof ticket.getPayload> & {
          firebase?: { sign_in_provider?: string };
        })
      | undefined;
    if (!payload || !payload.email || !payload.email_verified) {
      throw new Error('Akun Google belum terverifikasi.');
    }
    if (payload.firebase?.sign_in_provider && payload.firebase.sign_in_provider !== 'google.com') {
      throw new Error('Provider login harus menggunakan Google Sign-In.');
    }
    email = payload.email.toLowerCase();
    name = payload.name || email.split('@')[0];
    picture = payload.picture || '';

    // Verify authoritative hosted domain (hd) via Google OAuth userinfo when access token is supplied
    if (params.oauthAccessToken) {
      const uiRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${params.oauthAccessToken}` },
      });
      if (!uiRes.ok) {
        throw new Error('Gagal memverifikasi profil Google Workspace.');
      }
      const userInfo = (await uiRes.json()) as {
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
        hd?: string;
      };
      if (!userInfo.email || userInfo.email.toLowerCase() !== email || !userInfo.email_verified) {
        throw new Error('Ketidaksesuaian identitas email Google terdeteksi.');
      }
      hostedDomain = (userInfo.hd || '').toLowerCase();
      if (userInfo.name) name = userInfo.name;
      if (userInfo.picture) picture = userInfo.picture;
    } else if (email.endsWith(`@${allowedDomain}`)) {
      hostedDomain = allowedDomain;
    }
  } else {
    throw new Error('Token Google SSO wajib dikirim.');
  }

  return resolveAndRegisterGoogleUser({
    email,
    name,
    picture,
    hostedDomain,
    allowedDomain,
    strictDomainCheck: true,
    loginScope: params.loginScope,
  });
}

export async function verifyGoogleIdTokenAndResolveUser(idToken: string): Promise<SessionUser> {
  return verifyGoogleSsoAndResolveUser({ credential: idToken });
}

export async function resolveAndRegisterGoogleUser(params: {
  email: string;
  name: string;
  picture?: string;
  hostedDomain: string;
  allowedDomain: string;
  strictDomainCheck: boolean;
  requestedRole?: UserRole;
  loginScope?: UserRole;
}): Promise<SessionUser> {
  const email = params.email.toLowerCase();
  const allowedDomain = params.allowedDomain.toLowerCase();
  const now = new Date().toISOString();

  // Strictly enforce @lazuardi.sch.id Google Workspace domain for ALL users & admins
  const domainMatches = email.endsWith(`@${allowedDomain}`);
  const hdMatches = !params.strictDomainCheck || params.hostedDomain === allowedDomain;
  if (!domainMatches || !hdMatches) {
    throw new Error(
      `Akses ditolak. Hanya akun Google Workspace resmi sekolah (@${allowedDomain}) yang diizinkan masuk.`
    );
  }

  return dbStore.mutate(['ADMIN_USERS', 'USERS', 'AUDIT_LOGS'], (db) => {
    const activeAdmin = db.ADMIN_USERS.find(
      (a) => a.email.toLowerCase() === email && a.status === 'aktif'
    );
    const inactiveAdmin = db.ADMIN_USERS.find(
      (a) => a.email.toLowerCase() === email && a.status !== 'aktif'
    );

    if (params.loginScope === 'ADMIN') {
      if (inactiveAdmin) {
        throw new Error(
          `Akses Administrator ditolak. Akun ${email} sedang berstatus nonaktif di daftar Administrator.`
        );
      }
      if (!activeAdmin) {
        throw new Error(
          `Akses khusus Administrator ditolak. Akun Google ${email} belum terdaftar sebagai Administrator aktif (@${allowedDomain}).`
        );
      }
    }

    // If preview requested explicit USER role even if email is in ADMIN_USERS
    const wantUserPreview = params.requestedRole === 'USER' || params.loginScope === 'USER';

    if (activeAdmin && !wantUserPreview) {
      activeAdmin.last_login = now;
      if (params.name && activeAdmin.name.includes('@')) {
        activeAdmin.name = params.name;
      }
      db.AUDIT_LOGS.unshift({
        log_id: crypto.randomUUID(),
        timestamp: now,
        actor_email: email,
        actor_name: activeAdmin.name,
        actor_role: 'ADMIN',
        action: 'LOGIN_SSO',
        entity_type: 'ADMIN_USERS',
        entity_id: activeAdmin.id,
        summary: `Login SSO Google Administrator GA (${activeAdmin.email})`,
      });

      return {
        id: activeAdmin.id,
        name: activeAdmin.name,
        email: activeAdmin.email,
        role: 'ADMIN',
        adminRole: activeAdmin.role,
        picture: params.picture,
      };
    }

    let userRecord = db.USERS.find((u) => u.email.toLowerCase() === email);
    if (!userRecord) {
      const defaultDept = db.DEPARTMENTS.find((d) => d.active_status === 'aktif')?.department_id || '';
      userRecord = {
        id: crypto.randomUUID(),
        name: params.name,
        email,
        department_id: defaultDept,
        position: 'Staf / Guru Sekolah',
        phone: '',
        status: 'aktif',
        created_at: now,
        last_login: now,
      };
      db.USERS.push(userRecord);
    } else {
      if (userRecord.status !== 'aktif') {
        throw new Error('Akun pengguna sedang dinonaktifkan oleh General Affairs.');
      }
      userRecord.last_login = now;
      if (params.name) userRecord.name = params.name;
    }

    db.AUDIT_LOGS.unshift({
      log_id: crypto.randomUUID(),
      timestamp: now,
      actor_email: email,
      actor_name: userRecord.name,
      actor_role: 'USER',
      action: 'LOGIN_SSO',
      entity_type: 'USERS',
      entity_id: userRecord.id,
      summary: `Login SSO Google User Sekolah (${userRecord.email})`,
    });

    return {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      role: 'USER',
      department_id: userRecord.department_id,
      position: userRecord.position,
      phone: userRecord.phone,
      picture: params.picture,
    };
  });
}
