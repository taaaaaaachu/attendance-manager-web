import { useState } from "react";
import { ApiError } from "../api/client";

interface Props {
  onRegister: (userId: string, password: string) => Promise<void>;
  onNavigateToLogin: () => void;
}

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

export function RegisterPage({ onRegister, onNavigateToLogin }: Props) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!USER_ID_PATTERN.test(userId)) {
      setError("IDは英数字・ハイフン・アンダースコアで3〜32文字にしてください");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`);
      return;
    }
    if (password !== passwordConfirm) {
      setError("パスワードが一致しません");
      return;
    }

    setSubmitting(true);
    try {
      await onRegister(userId, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>アカウント登録</h1>
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
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          パスワード(確認)
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "登録中..." : "登録"}
        </button>
        <button type="button" className="link-button" onClick={onNavigateToLogin}>
          既にアカウントをお持ちの方はこちら
        </button>
      </form>
    </div>
  );
}
