import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import {
  acceptLinkRequest,
  cancelLinkRequest,
  getLinkState,
  leaveLink,
  type LinkState,
  rejectLinkRequest,
  removeMember,
  sendLinkRequest,
} from "../../api/links";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  /** 連携状態が変わったとき(承認・解除など)に親へ通知し、カレンダー全体を再読み込みさせる */
  onChanged: () => void | Promise<void>;
}

/**
 * 設定モーダル内の「アカウント連携」セクション。
 * 複数のメールアドレスを1つのカレンダーに束ねる申請・承認・解除をここで行う。
 */
export function AccountLinkSection({ onChanged }: Props) {
  const [state, setState] = useState<LinkState | null>(null);
  const [targetEmail, setTargetEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAccept, setPendingAccept] = useState<string | null>(null);

  const reload = useCallback(() => getLinkState().then((s) => setState(s)), []);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof ApiError ? e.message : "連携状態の取得に失敗しました"));
  }, [reload]);

  /** 連携操作を実行し、失敗時はエラー表示、成功時はローカルと親を再読み込みする */
  const run = async (action: () => Promise<unknown>, notifyParent: boolean) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      await reload();
      if (notifyParent) await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="field">
        <label>アカウント連携</label>
        <div>読み込み中...</div>
      </div>
    );
  }

  // 連携メンバーとしてログイン中(誰かのカレンダーを共有している)
  if (state.owner) {
    return (
      <div className="field">
        <label>アカウント連携</label>
        <div>
          現在 <strong>{state.owner}</strong> のカレンダーを共有中です。
          <br />
          連携中はこのアカウント自身のデータは表示されません(解除すると元に戻ります)。
        </div>
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => run(() => leaveLink(), true)}
          >
            連携を解除する
          </button>
        </div>
        {error && <div className="auth-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="field">
      <label>アカウント連携</label>
      <div style={{ fontSize: "0.85em", marginBottom: 6 }}>
        別のメールアドレスをこのカレンダーに招くと、そのアドレスでログインしても同じカレンダーを見られます。
      </div>

      <div style={{ display: "flex", gap: "6px" }}>
        <input
          type="email"
          placeholder="招くメールアドレス"
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !targetEmail}
          onClick={() =>
            run(async () => {
              await sendLinkRequest(targetEmail.trim().toLowerCase());
              setTargetEmail("");
            }, false)
          }
        >
          申請する
        </button>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {state.incoming.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div>受信した連携申請</div>
          <ul className="date-list">
            {state.incoming.map((req) => (
              <li key={req.email}>
                {req.email}
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <button type="button" disabled={busy} onClick={() => setPendingAccept(req.email)}>
                    承認
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => rejectLinkRequest(req.email), false)}
                  >
                    却下
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.outgoing.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div>送信した連携申請(承認待ち)</div>
          <ul className="date-list">
            {state.outgoing.map((req) => (
              <li key={req.email}>
                {req.email}
                <button type="button" disabled={busy} onClick={() => run(() => cancelLinkRequest(req.email), false)}>
                  取消
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.members.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div>このカレンダーを共有中のメンバー</div>
          <ul className="date-list">
            {state.members.map((member) => (
              <li key={member}>
                {member}
                <button type="button" disabled={busy} onClick={() => run(() => removeMember(member), false)}>
                  解除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingAccept && (
        <ConfirmDialog
          message={`${pendingAccept} のカレンダーを共有します。承認すると、このアカウント自身のデータは連携中は表示されなくなります(解除すると元に戻ります)。よろしいですか?`}
          confirmLabel="承認する"
          onCancel={() => setPendingAccept(null)}
          onConfirm={async () => {
            const requester = pendingAccept;
            setPendingAccept(null);
            await run(() => acceptLinkRequest(requester), true);
          }}
        />
      )}
    </div>
  );
}
