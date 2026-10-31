import { useCallback, useEffect, useState } from "react";
import { getAdminAgentConnections, revokeAdminAgentConnection } from "../../api/admin";
import type { AgentConnection } from "../../api/agentConnections";
import { ApiError } from "../../api/client";
import { ConfirmDialog } from "../modals/ConfirmDialog";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

interface Props {
  /** 値が変わるたびに一覧を読み直す(ユーザー削除で接続も消えるため) */
  refreshKey: number;
}

/**
 * 全ユーザーのエージェント接続の一覧。/mcp はAccessを通らないため、Accessのポリシーから外した人の
 * 接続はここで取り消す。ユーザー一覧は勤怠記録から作られるので、記録の無い人の接続もここに出す。
 */
export function AdminAgentConnectionTable({ refreshKey }: Props) {
  const [connections, setConnections] = useState<AgentConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<AgentConnection | null>(null);

  const reload = useCallback(
    () =>
      getAdminAgentConnections()
        .then((list) => setConnections(list))
        .catch((e) => {
          setError(e instanceof ApiError ? e.message : "エージェント接続の読み込みに失敗しました");
        }),
    [],
  );

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const revoke = async (target: AgentConnection) => {
    setError(null);
    try {
      await revokeAdminAgentConnection(target.id);
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "取り消しに失敗しました");
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2>エージェント接続</h2>
      {error && <p className="auth-error">{error}</p>}
      {connections === null ? (
        <p>読み込み中...</p>
      ) : connections.length === 0 ? (
        <p>接続はありません。</p>
      ) : (
        <table className="admin-user-table">
          <thead>
            <tr>
              <th>発行者</th>
              <th>名前</th>
              <th>接続元</th>
              <th>作成日</th>
              <th>最終利用日</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id}>
                <td>{c.userEmail}</td>
                <td>{c.name}</td>
                <td>{c.origin}</td>
                <td>{formatDate(c.createdAt)}</td>
                <td>{formatDate(c.lastUsedAt)}</td>
                <td>
                  <button type="button" className="danger-button" onClick={() => setPendingRevoke(c)}>
                    取り消し
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pendingRevoke && (
        <ConfirmDialog
          message={`${pendingRevoke.userEmail} の「${pendingRevoke.name}」の接続を取り消します。よろしいですか?`}
          confirmLabel="取り消す"
          onCancel={() => setPendingRevoke(null)}
          onConfirm={async () => {
            const target = pendingRevoke;
            setPendingRevoke(null);
            await revoke(target);
          }}
        />
      )}
    </section>
  );
}
