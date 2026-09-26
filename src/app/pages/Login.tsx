import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";

const roleHomePath = (role: string) => role === "municipal_officer" ? "/officer" : role === "establishment_staff" ? "/staff" : null;

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<"email" | "otp">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,status")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (profile?.status !== "active") {
        await supabase.auth.signOut();
        throw new Error("This account is not active. Please contact the municipal tourism office.");
      }

      const destination = roleHomePath(profile.role);
      if (!destination) {
        await supabase.auth.signOut();
        throw new Error("This account does not have an authorized portal role.");
      }
      window.location.href = destination;
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your details and try again.");
      setLoading(false);
    }
  };

  const handleSendResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMessage("");
    setForgotLoading(true);

    try {
      const response = await fetch('/api/send-password-reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to send reset OTP.');

      setForgotStep('otp');
      setForgotMessage('If the email exists, a 6-digit OTP was sent. Enter it below to set a new password.');
    } catch (err: any) {
      setForgotMessage(err.message || 'Failed to send reset OTP.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMessage("");

    if (!/^\d{6}$/.test(forgotOtp.trim())) {
      setForgotMessage('Enter the 6-digit OTP.');
      return;
    }
    if (forgotPassword.length < 8) {
      setForgotMessage('New password must be at least 8 characters.');
      return;
    }
    if (forgotPassword !== forgotConfirmPassword) {
      setForgotMessage('Passwords do not match.');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await fetch('/api/verify-password-reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          otp: forgotOtp.trim(),
          password: forgotPassword,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to reset password.');

      setShowForgotPassword(false);
      setForgotStep('email');
      setForgotOtp('');
      setForgotPassword('');
      setForgotConfirmPassword('');
      setError('Password reset successfully. You can sign in with your new password.');
    } catch (err: any) {
      setForgotMessage(err.message || 'Failed to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#E5E8E1] text-[#193364]">
      <div className="grid min-h-[100dvh] grid-cols-1 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#193364] via-[#193364] to-[#0F3B2D] lg:block">
          <img
            src="/balayan-church-login.jpg"
            alt="Historic church and statues in Balayan"
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(25,51,100,0.92),rgba(15,59,45,0.56)_45%,rgba(108,151,114,0.62))]" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent" />

          <div className="relative z-10 flex min-h-[100dvh] flex-col justify-between p-10 xl:p-14">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/18 bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">VistaBalayan</p>
                <p className="text-sm text-white/75">Tourism management portal</p>
              </div>
            </div>

            <div className="max-w-xl pb-4">
              <p className="mb-4 w-fit rounded-full border border-white/20 bg-white/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-xl">
                Balayan tourism workspace
              </p>
              <h1 className="text-5xl font-semibold leading-[0.96] tracking-[-0.045em] text-white xl:text-6xl">
                Manage Balayan tourism with clarity.
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-white/85">
                Access the municipal and establishment workspace for reports, accommodations, listings, and tourism insights.
              </p>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#E5E8E1] px-5 py-8 sm:px-8 lg:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(245,248,255,0.72),transparent_32%),radial-gradient(circle_at_82%_80%,rgba(251,231,186,0.42),transparent_30%)]" />

          <div className="relative z-10 w-full max-w-[440px]">
            <div className="mb-8 lg:hidden">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E5E8E1] text-[#193364] shadow-[6px_6px_12px_rgba(163,177,198,0.58),-6px_-6px_12px_rgba(255,255,255,0.7)]">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-3xl font-semibold tracking-[-0.035em] text-[#0B2530]">VistaBalayan</p>
              <p className="mt-2 text-sm leading-6 text-[#5D6F73]">Tourism analytics and establishment management.</p>
            </div>

            <div className="rounded-[2rem] border-0 bg-[#E0E5EC] p-6 shadow-[12px_12px_24px_rgba(163,177,198,0.58),-12px_-12px_24px_rgba(255,255,255,0.72)] sm:p-8">
              <div className="mb-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E0E5EC] text-[#193364] shadow-[inset_4px_4px_8px_rgba(163,177,198,0.45),inset_-4px_-4px_8px_rgba(255,255,255,0.7)]">
                  <LockKeyhole className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h2 className="text-3xl font-semibold tracking-[-0.035em] text-[#0B2530]">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-[#5D6F73]">
                  Use your authorized officer or establishment staff account.
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-slate-800">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl border-0 bg-[#E0E5EC] px-11 py-3.5 text-base text-[#193364] shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.7)] outline-none transition duration-200 placeholder:text-slate-400 focus:ring-4 focus:ring-[#6C9772]/25"
                      placeholder="officer@balayan.gov.ph"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-800">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl border-0 bg-[#E0E5EC] px-11 py-3.5 pr-12 text-base text-[#193364] shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.7)] outline-none transition duration-200 placeholder:text-slate-400 focus:ring-4 focus:ring-[#6C9772]/25"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[#193364] transition duration-200 hover:bg-[#F5F8FF] focus:outline-none focus:ring-4 focus:ring-[#6C9772]/25"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={1.8} /> : <Eye className="h-5 w-5" strokeWidth={1.8} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#5D6F73]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[#AFB3B5] text-[#193364] focus:ring-[#6C9772]"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email.trim().toLowerCase());
                      setForgotStep('email');
                      setForgotMessage('');
                      setShowForgotPassword(true);
                    }}
                    className="text-sm font-medium text-[#193364] transition duration-200 hover:text-[#6C9772]"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-3 w-full rounded-2xl bg-[#193364] px-5 py-4 text-base font-semibold text-white shadow-[8px_8px_16px_rgba(163,177,198,0.55),-6px_-6px_14px_rgba(255,255,255,0.48)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#0F3B2D] focus:outline-none focus:ring-4 focus:ring-[#6C9772]/25 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-slate-500">
              Access is limited to authorized VistaBalayan municipal and establishment accounts.
            </p>
          </div>
        </section>
      </div>

      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[#0B2530]">Reset password</h3>
                <p className="mt-2 text-sm leading-6 text-[#5D6F73]">
                  Receive a 6-digit OTP by email, then set your new password.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {forgotMessage && (
              <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm leading-6 text-[#0E5A72]">
                {forgotMessage}
              </div>
            )}

            {forgotStep === 'email' ? (
              <form onSubmit={handleSendResetOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Email address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-[#34A0A4] focus:ring-4 focus:ring-[#e5f1f2]"
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full rounded-2xl bg-[#0E5A72] px-5 py-3.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {forgotLoading ? 'Sending...' : 'Reset password'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyResetOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">6-digit OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-[#34A0A4] focus:ring-4 focus:ring-[#e5f1f2]"
                    placeholder="000000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">New password</label>
                  <input
                    type="password"
                    value={forgotPassword}
                    onChange={(e) => setForgotPassword(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-[#34A0A4] focus:ring-4 focus:ring-[#e5f1f2]"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Confirm new password</label>
                  <input
                    type="password"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-[#34A0A4] focus:ring-4 focus:ring-[#e5f1f2]"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep('email')}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 rounded-2xl bg-[#0E5A72] px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {forgotLoading ? 'Resetting...' : 'Reset password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
