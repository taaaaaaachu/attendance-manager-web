import { useState } from "react";
import { ApiError } from "../api/client";

interface Props {
  onLogin: (userId: string, password: string) => Promise<void>;
  onNavigateToRegister: () => void;
}

export function LoginPage({ onLogin, onNavigateToRegister }: Props) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(userId, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ログインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>ログイン</h1>
        {error && <p className="auth-error">{error}</p>}
        <label>
          ID
          <input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "ログイン中..." : "ログイン"}
        </button>
        <button type="button" className="link-button" onClick={onNavigateToRegister}>
          アカウントをお持ちでない方はこちら
        </button>
      </form>
    </div>
  );
}
