import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label } from '../components/ui/input.tsx';
import { useToast } from '../components/ui/toast.tsx';
import { UserRole } from '../../shared/types.ts';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            hosted_domain?: string;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function LoginPage() {
  const {
    config,
    user,
    loginWithGoogleCredential,
    loginWithGooglePopup,
    loginWithPreviewSession,
  } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const gsiContainerRef = useRef<HTMLDivElement | null>(null);

  const [loginScope, setLoginScope] = useState<UserRole>('ADMIN');
  const [showSandboxForm, setShowSandboxForm] = useState(false);
  const [previewEmail, setPreviewEmail] = useState('soleh.st@lazuardi.sch.id');
  const [previewName, setPreviewName] = useState('Soleh S.T.');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const allowedDomain = config?.allowedDomain || 'lazuardi.sch.id';

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!config?.googleClientId || !gsiContainerRef.current) return;

    const initGsi = () => {
      if (!window.google?.accounts?.id || !gsiContainerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: config.googleClientId!,
        hosted_domain: allowedDomain,
        callback: async (response) => {
          try {
            setSubmitting(true);
            setErrorMsg('');
            await loginWithGoogleCredential(response.credential, loginScope);
            notify('Berhasil masuk melalui Google Workspace SSO.', 'success');
            navigate('/dashboard', { replace: true });
          } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Verifikasi Google SSO gagal.');
          } finally {
            setSubmitting(false);
          }
        },
      });
      gsiContainerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(gsiContainerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 340,
        text: 'signin_with',
        shape: 'rectangular',
      });
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      const timer = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(timer);
          initGsi();
        }
      }, 250);
      return () => clearInterval(timer);
    }
  }, [config, allowedDomain, loginScope, loginWithGoogleCredential, navigate, notify]);

  const handleGooglePopupLogin = async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      await loginWithGooglePopup(loginScope);
      notify(
        loginScope === 'ADMIN'
          ? 'Berhasil masuk sebagai Administrator General Affairs (@lazuardi.sch.id).'
          : 'Berhasil masuk sebagai User Sekolah (@lazuardi.sch.id).',
        'success'
      );
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Verifikasi Google SSO gagal.';
      if (rawMsg.includes('popup-closed-by-user')) {
        setErrorMsg('Jendela login Google ditutup sebelum selesai.');
      } else if (rawMsg.includes('popup-blocked')) {
        setErrorMsg('Browser memblokir popup Google SSO. Izinkan popup untuk situs ini lalu coba lagi.');
      } else {
        setErrorMsg(rawMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviewLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      await loginWithPreviewSession({
        email: previewEmail,
        name: previewName,
        role: loginScope,
      });
      notify('Sesi terverifikasi berhasil dibuat.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 grid lg:grid-cols-12">
      {/* Left Brand & Visual Panel */}
      <div className="lg:col-span-7 relative bg-[#0F2F75] text-white flex flex-col justify-between overflow-hidden min-h-[300px] lg:min-h-screen">
        <img
          src="/src/assets/images/lazuardi_campus_fleet_1794808755926.jpg"
          alt="Armada Kendaraan Operasional Sekolah Lazuardi"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B2358] via-[#1755CE]/75 to-[#0B2358]/80" />

        <div className="relative z-10 p-6 sm:p-10">
          <div className="inline-flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white text-[#1755CE] font-display font-bold flex items-center justify-center text-base">
              LZ
            </div>
            <div>
              <div className="font-display font-bold text-base tracking-tight">SEKOLAH LAZUARDI</div>
              <div className="text-xs text-blue-100">General Affairs & Fleet Operations</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 p-6 sm:p-10 max-w-2xl space-y-4">
          <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight text-balance">
            Lazuardi Vehicle Booking & Transportation Management System
          </h1>
          <p className="text-sm sm:text-base text-blue-100 leading-relaxed">
            Platform terpusat untuk pengajuan kendaraan dinas sekolah, penyewaan bus eksternal,
            inspeksi keselamatan armada, perawatan berkala, dan pengendalian biaya operasional.
          </p>
          <div className="pt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs text-blue-100">
            <span>Google Workspace SSO (@{allowedDomain})</span>
            <span aria-hidden="true">·</span>
            <span>Khusus Admin Terdaftar & Staf Sekolah</span>
            <span aria-hidden="true">·</span>
            <span>Zona Waktu Asia/Jakarta (WIB)</span>
          </div>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">Masuk ke LVBMS</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Autentikasi Google Workspace SSO khusus akun resmi{' '}
              <span className="font-semibold text-slate-800">@{allowedDomain}</span>.
            </p>
          </div>

          {/* Role / SSO Mode Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setLoginScope('ADMIN');
                setPreviewEmail('soleh.st@lazuardi.sch.id');
                setPreviewName('Soleh S.T.');
                setErrorMsg('');
              }}
              className={`h-9 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                loginScope === 'ADMIN'
                  ? 'bg-[#1755CE] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin GA (@{allowedDomain})
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginScope('USER');
                setPreviewEmail('nadia.putri@lazuardi.sch.id');
                setPreviewName('Nadia Putri, S.Pd');
                setErrorMsg('');
              }}
              className={`h-9 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                loginScope === 'USER'
                  ? 'bg-[#1755CE] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              User Sekolah (@{allowedDomain})
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Primary Google SSO Box */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-[#1755CE] shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 leading-relaxed">
                {loginScope === 'ADMIN' ? (
                  <>
                    <span className="font-semibold text-slate-900 block">
                      SSO Khusus Administrator General Affairs
                    </span>
                    Hanya akun Google <span className="font-mono font-medium">@{allowedDomain}</span>{' '}
                    yang terdaftar dan berstatus aktif di daftar Administrator yang diizinkan masuk.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900 block">
                      SSO Guru &amp; Staf Sekolah Lazuardi
                    </span>
                    Masuk menggunakan akun Google Workspace{' '}
                    <span className="font-mono font-medium">@{allowedDomain}</span> untuk mengajukan
                    pemesanan kendaraan sekolah atau sewa bus.
                  </>
                )}
              </div>
            </div>

            {config?.googleClientId && (
              <div ref={gsiContainerRef} className="min-h-[44px] flex items-center justify-center" />
            )}

            {config?.firebaseGoogleAuthEnabled && (
              <button
                type="button"
                onClick={handleGooglePopupLogin}
                disabled={submitting}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {submitting
                      ? 'Memverifikasi Akun Google...'
                      : loginScope === 'ADMIN'
                      ? `Masuk Admin dengan Google (@${allowedDomain})`
                      : `Masuk dengan Google (@${allowedDomain})`}
                  </span>
                </div>
              </button>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Backend memverifikasi tanda tangan kriptografis token Google, issuer, audience,{' '}
              <code className="font-mono">email_verified</code>, domain resmi{' '}
              <code className="font-mono">@{allowedDomain}</code>, serta status aktif pada tabel{' '}
              <code className="font-mono">ADMIN_USERS</code>.
            </p>
          </div>

          {/* Optional Local Preview Session Fallback (Non-Vercel Sandbox only) */}
          {config?.previewAuthEnabled && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSandboxForm((v) => !v)}
                className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-600 flex items-center justify-between cursor-pointer"
              >
                <span>Verifikasi Sesi Preview (Non-Produksi)</span>
                {showSandboxForm ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showSandboxForm && (
                <form onSubmit={handlePreviewLogin} className="space-y-3 p-4 bg-white border-t border-slate-200">
                  <div>
                    <Label htmlFor="preview-email">Email Google Workspace (@{allowedDomain})</Label>
                    <Input
                      id="preview-email"
                      type="email"
                      value={previewEmail}
                      onChange={(e) => setPreviewEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="preview-name">Nama Lengkap</Label>
                    <Input
                      id="preview-name"
                      type="text"
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="outline" className="w-full" disabled={submitting}>
                    {submitting
                      ? 'Memverifikasi...'
                      : `Masuk Preview (${loginScope === 'ADMIN' ? 'Admin GA' : 'User Sekolah'})`}
                  </Button>
                </form>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Penyimpanan: {config?.storage.engine || 'Memeriksa...'}</span>
            <span>WIB (UTC+7)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
