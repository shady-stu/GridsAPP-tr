import { loginAction } from "@/app/actions/auth";

export function LoginForm({ error }: { error?: string }) {
  const message = error === "configuration"
    ? "Demo sign-in is not configured. Set the demo access codes and a session secret."
    : error === "unavailable"
      ? "Sign-in could not be completed. Please try again."
      : error === "invalid"
        ? "The email or demo access code is incorrect."
        : undefined;

  return <form action={loginAction} className="form-card login-form">
    {message && <p className="form-message" role="alert">{message}</p>}
    <label>Email address<input name="email" type="email" autoComplete="username" required maxLength={254} placeholder="admin@northstar.example" /></label>
    <label>Demo access code<input name="accessCode" type="password" autoComplete="current-password" required maxLength={256} /></label>
    <button className="button button-primary" type="submit">Sign in</button>
  </form>;
}
