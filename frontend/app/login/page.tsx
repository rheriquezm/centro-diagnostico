"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api, getUser, setSession } from "@/lib/api";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const DOMINIO = "@serviciocivil.cl";

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
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
    </svg>
  );
}

function ServicioCivilBanner() {
  const dashes = Array.from({ length: 12 });
  return (
    <svg
      viewBox="0 0 800 300"
      className="block h-auto w-full"
      role="img"
      aria-label="Servicio Civil · Trabajando para usted · Gobierno de Chile"
    >
      <rect width="800" height="300" fill="#1b2a5b" />
      <rect y="100" width="800" height="70" fill="#22346b" opacity="0.6" />
      <rect x="332" y="16" width="66" height="28" fill="#0072ce" />
      <rect x="398" y="16" width="66" height="28" fill="#e30613" />
      <path
        d="M398 20l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z"
        fill="#ffffff"
      />
      <text
        x="398"
        y="66"
        fill="#ffffff"
        fontSize="15"
        fontWeight="700"
        letterSpacing="2"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        TRABAJANDO PARA USTED
      </text>
      <g fill="#ffffff">
        {dashes.map((_, index) => (
          <path
            key={`top-${index}`}
            d={`M${100 + index * 50} 98l24 0-7 12-24 0z`}
            opacity={0.35 + (index % 4) * 0.15}
          />
        ))}
        {dashes.map((_, index) => (
          <path
            key={`bottom-${index}`}
            d={`M${100 + index * 50} 190l24 0-7 12-24 0z`}
            opacity={0.35 + (index % 4) * 0.15}
          />
        ))}
      </g>
      <text
        x="400"
        y="172"
        fill="#ffffff"
        fontSize="72"
        fontWeight="900"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        letterSpacing="1"
      >
        Servicio Civil
      </text>
      <rect x="110" y="252" width="250" height="3" fill="#0072ce" />
      <rect x="440" y="252" width="250" height="3" fill="#e30613" />
      <rect x="300" y="242" width="200" height="22" fill="#1b2a5b" />
      <text
        x="400"
        y="258"
        fill="#ffffff"
        fontSize="14"
        fontWeight="700"
        letterSpacing="2"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        GOBIERNO DE CHILE
      </text>
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="#6b7280"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        stroke="#6b7280"
        strokeWidth="1.7"
      />
      <path
        d="M8 10V7a4 4 0 118 0v3"
        stroke="#6b7280"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { google?: { accounts?: { id?: unknown } } };
    if (w.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google"));
    document.head.appendChild(script);
  });
}

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState<{
    email?: string;
    name?: string;
  } | null>(null);
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user?.email) {
      setAccount(user);
      setEmail(user.email);
    }
  }, []);

  function finish(token: string, user: unknown) {
    setSession(token, user);
    router.replace("/");
  }

  async function loginGoogle(credential: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ access_token: string; user: unknown }>(
        "/api/auth/google",
        { id_token: credential }
      );
      finish(data.access_token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de acceso");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    if (!CLIENT_ID) {
      setShowEmail(true);
      return;
    }
    try {
      await loadGis();
      const google = (
        window as unknown as {
          google: {
            accounts: {
              id: {
                initialize: (o: unknown) => void;
                prompt: () => void;
              };
            };
          };
        }
      ).google;
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp: { credential: string }) =>
          loginGoogle(resp.credential),
      });
      google.accounts.id.prompt();
    } catch {
      setError("No se pudo iniciar con Google. Usa tu correo institucional.");
      setShowEmail(true);
    }
  }

  async function loginEmail(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized.endsWith(DOMINIO)) {
      setError(`Debes usar una cuenta ${DOMINIO}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ access_token: string; user: unknown }>(
        "/api/auth/dev-login",
        { email: normalized }
      );
      finish(data.access_token, data.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de acceso";
      setError(
        message === "No disponible"
          ? "El acceso por correo está deshabilitado. Configura Google OAuth (GOOGLE_CLIENT_ID)."
          : message
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAccount() {
    setError(null);
    if (CLIENT_ID) {
      await handleGoogle();
      return;
    }
    if (account?.email) {
      await loginEmail(account.email);
      return;
    }
    setShowEmail(true);
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    await loginEmail(email);
  }

  const initial = (account?.name || account?.email || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef1f5] p-5 sm:p-8">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[26px] border border-black/[0.04] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
        <ServicioCivilBanner />

        <div className="px-7 pb-10 pt-9 sm:px-12 sm:pb-12">
          <h1 className="text-center font-heading text-[28px] font-bold leading-tight text-[#1f2937]">
          Centro de Diagnóstico
        </h1>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-[#6b7280]">
          Plataforma Institucional de Gestión
          <br />
          Dirección Nacional del Servicio Civil
        </p>

        <div className="mt-10 space-y-3">
          <button
            type="button"
            onClick={handleAccount}
            disabled={loading}
            className="mx-auto flex w-full max-w-[340px] items-center gap-3 rounded-full border border-[#d9dee7] bg-white px-3.5 py-2.5 text-left transition hover:border-[#b9c3d4] hover:bg-[#fafbfd] disabled:opacity-60"
          >
            {account?.email ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f9b8e] text-xs font-bold text-white">
                {initial}
              </span>
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e3e7ee] bg-white">
                {CLIENT_ID ? <GoogleG size={16} /> : <LockIcon />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[#1f2937]">
                {account?.email
                  ? `Acceder como ${account.name || account.email.split("@")[0]}`
                  : CLIENT_ID
                  ? "Continuar con Google"
                  : "Acceder con correo institucional"}
              </span>
              <span className="block truncate text-[11px] text-[#6b7280]">
                {account?.email || `Cuenta institucional ${DOMINIO}`}
              </span>
            </span>
            <ChevronDown />
          </button>

          <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-[#f3f5f8] px-4 py-1.5 text-[12px] text-[#6b7280]">
            <LockIcon />
            Solo correos {DOMINIO}
          </div>
        </div>

        {!showEmail ? (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="mt-4 block w-full text-center text-[11px] text-[#6b7280] underline underline-offset-2 hover:text-[#374151]"
          >
            Usar otro correo institucional
          </button>
        ) : (
          <form onSubmit={submitEmail} className="mx-auto mt-4 w-full max-w-[340px] space-y-2">
            <input
              type="email"
              className="input"
              placeholder={`usuario${DOMINIO}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading || !email.trim()}
            >
              {loading ? "Ingresando…" : "Ingresar con correo institucional"}
            </button>
          </form>
        )}

        {error ? (
          <p className="mt-3 text-center text-sm text-gob-error">{error}</p>
        ) : null}

        <div className="mt-14 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9aa4b8]">
            SERVICIOCIVIL
          </p>
          <p className="mt-1 text-[11px] text-[#9aa4b8]">
            © 2026 Gobierno de Chile
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
