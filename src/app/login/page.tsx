"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("host");
  const [password, setPassword] = useState("host123");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error || "Sign in failed");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unexpected sign in error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          username,
          password,
          confirmPassword,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error || "Sign up failed");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unexpected sign up error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#e8f0fe_0%,#fce8e6_50%,#e6f4ea_100%)] px-4 py-12">
      <section className="mx-auto w-full max-w-lg rounded-3xl border border-[#d6e1f4] bg-white/95 p-7 shadow-[0_20px_40px_rgba(26,115,232,0.15)]">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Brand logo"
            width={56}
            height={56}
            className="rounded-xl border border-[#d3e3fd] bg-white object-contain p-1"
            priority
          />
        </div>
        <h1 className="mt-2 text-3xl font-bold text-[#202124]">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-[#5f6368]">
          {mode === "signin"
            ? "Sign in with your credentials or continue with Google."
            : "Sign up with all details and start meetings instantly."}
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#eef4ff] p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError("");
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === "signin" ? "bg-[#1a73e8] text-white" : "text-[#1a73e8]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === "signup" ? "bg-[#1a73e8] text-white" : "text-[#1a73e8]"
            }`}
          >
            Sign up
          </button>
        </div>

        {mode === "signin" ? (
          <form className="mt-5 space-y-3" onSubmit={handleSignIn}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                Email or Username
              </label>
              <input
                className="w-full rounded-xl border border-[#d3e3fd] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="host or host@example.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                Password
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-[#d3e3fd] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error && <p className="text-sm font-medium text-[#ea4335]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border border-[#1a73e8] bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={handleSignUp}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                Full Name
              </label>
              <input
                className="w-full rounded-xl border border-[#d3e3fd] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-xl border border-[#d3e3fd] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                Username
              </label>
              <input
                className="w-full rounded-xl border border-[#d3e3fd] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="johndoe"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                  Password
                </label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-[#d3e3fd] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                  Confirm Password
                </label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-[#d3e3fd] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8]"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm font-medium text-[#ea4335]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border border-[#1a73e8] bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[#dbe5f5]" />
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a8592]">Or</span>
          <span className="h-px flex-1 bg-[#dbe5f5]" />
        </div>

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#c9dafb] bg-[#eef4ff] px-4 py-2.5 text-sm font-semibold text-[#1a73e8] transition hover:bg-[#e2edff]"
        >
          <span aria-hidden="true">G</span>
          Continue with Google
        </a>

        <p className="mt-4 text-xs text-[#5f6368]">
          New signups are now stored in PostgreSQL and can log in again after server restarts. Google
          flow works with real credentials when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.
        </p>
      </section>
    </main>
  );
}
