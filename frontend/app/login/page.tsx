"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api, setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("rhenriquez@serviciocivil.cl");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ access_token: string; user: unknown }>(
        "/api/auth/dev-login",
        { email }
      );
      setSession(data.access_token, data.user);
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de acceso";
      setError(
        message === "No disponible"
          ? "El login de desarrollo está deshabilitado. Configura Google OAuth o habilita DEV_LOGIN_ENABLED=true solo en desarrollo."
          : message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-content-muted">
            Servicio Civil
          </p>
          <h1 className="text-2xl font-semibold text-content">
            Centro de Diagnóstico y Mejora Continua
          </h1>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-content-muted">
              Correo institucional
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-gob-error">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar (desarrollo)"}
          </button>
          <p className="text-xs text-content-muted">
            El acceso productivo usa Google OAuth restringido al dominio
            institucional. El botón superior funciona solo si
            <code className="mx-1">DEV_LOGIN_ENABLED=true</code>.
          </p>
        </form>
      </div>
    </div>
  );
}
