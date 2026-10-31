import { useCallback, useEffect, useState } from "react";
import {
  type AgentConnection,
  issueAgentToken,
  listAgentConnections,
  revokeAgentConnection,
} from "../../api/agentConnections";
import { ApiError } from "../../api/client";
import { ConfirmDialog } from "./ConfirmDialog";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

/**
 * 設定モーダル内の「エージェント接続」セクション。
 * AIエージェントがMCPでこのカレンダーを操作するための接続の一覧・手動発行・取り消しをここで行う。
 */
export function AgentConnectionSection() {
  const [connections, setConnections] = useState<AgentConnection[] | null>(null);
  const [name, setName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<AgentConnection | null>(null);

  const reload = useCallback(() => listAgentConnections().then((list) => setConnections(list)), []);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof ApiError ? e.message : "接続の一覧の取得に失敗しました"));
  }, [reload]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken);
      setCopied(true);
    } catch {
      // 失敗を黙って捨てると「押しても何も起きない」ように見えるため、必ず画面に出す
      setError("コピーできませんでした。トークンを選択して手動でコピーしてください");
    }
  };

  return (
    <div className="field">
      <label>エージェント接続</label>
      <div style={{ fontSize: "0.85em", marginBottom: 6 }}>
        AIエージェントが MCP(<code>{`${window.location.origin}/mcp`}</code>)でこのカレンダーを操作できます。
        OAuth に対応したエージェントはこの URL を登録するだけで、許可画面から接続できます。対応していなければ、ここでトークンを発行してください。
      </div>

      <div style={{ display: "flex", gap: "6px" }}>
        <input
          type="text"
          placeholder="接続の名前(例: dots)"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            run(async () => {
              const { token } = await issueAgentToken(name.trim());
              setIssuedToken(token);
              setCopied(false);
              setName("");
            })
          }
        >
          トークンを発行
        </button>
      </div>

      {issuedToken && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: "0.85em" }}>
            このトークンは今しか表示されません。エージェントの設定に <code>Authorization: Bearer …</code> として登録してください。
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: 4 }}>
            <input type="text" readOnly value={issuedToken} aria-label="発行したトークン" onFocus={(e) => e.target.select()} />
            <button type="button" onClick={copyToken}>
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      {connections === null ? (
        <div>読み込み中...</div>
      ) : connections.length === 0 ? (
        <div style={{ fontSize: "0.85em", marginTop: 6 }}>接続はありません</div>
      ) : (
        <ul className="date-list">
          {connections.map((c) => (
            <li key={c.id}>
              <span>
                {c.name}
                <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
                  {" "}
                  ({c.origin}・作成 {formatDate(c.createdAt)}・最終利用 {formatDate(c.lastUsedAt)})
                </span>
              </span>
              <button type="button" disabled={busy} onClick={() => setPendingRevoke(c)}>
                取り消し
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingRevoke && (
        <ConfirmDialog
          message={`「${pendingRevoke.name}」の接続を取り消します。このエージェントはカレンダーを操作できなくなります。よろしいですか?`}
          confirmLabel="取り消す"
          onCancel={() => setPendingRevoke(null)}
          onConfirm={async () => {
            const target = pendingRevoke;
            setPendingRevoke(null);
            await run(() => revokeAgentConnection(target.id));
          }}
        />
      )}
    </div>
  );
}
