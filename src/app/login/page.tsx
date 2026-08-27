"use client";

// Méthodes de connexion validées (section 3) : e-mail/mot de passe + Google/Microsoft SSO.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = "/";
  }

  async function handleOAuth(provider: "google" | "azure") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main style={{ maxWidth: 380, margin: "80px auto", padding: "0 20px" }}>
      <h1 style={{ color: "var(--navy)" }}>Revictus</h1>
      <p style={{ color: "var(--ink-2)" }}>Connexion à votre espace.</p>

      <form onSubmit={handlePasswordLogin} className="card" style={{ display: "grid", gap: 12 }}>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: "var(--urgent)", fontSize: 13 }}>{error}</p>}
        <button type="submit">Se connecter</button>
      </form>

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        <button onClick={() => handleOAuth("google")}>Continuer avec Google</button>
        <button onClick={() => handleOAuth("azure")}>Continuer avec Microsoft</button>
      </div>
    </main>
  );
}
