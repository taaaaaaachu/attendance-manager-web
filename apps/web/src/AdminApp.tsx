import type { AdminUserDetail, AdminUserSummary } from "@attendance/shared";
import { useCallback, useEffect, useState } from "react";
import { deleteAdminUser, getAdminUserDetail, getAdminUsers } from "./api/admin";
import type { CurrentUser } from "./api/auth";
import { fetchCurrentUser, reauthenticate } from "./api/auth";
import { ApiError } from "./api/client";
import { getHolidays } from "./api/holidays";
import { AdminUserDetailPanel } from "./components/admin/AdminUserDetailPanel";
import { AdminUserTable } from "./components/admin/AdminUserTable";
import { AlertDialog } from "./components/modals/AlertDialog";
import { filterUsersBelowRate } from "./utils/adminUtils";

export default function AdminApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);

  const [offsetMonths, setOffsetMonths] = useState(0);
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  const [thresholdInput, setThresholdInput] = useState("");
  const [appliedThreshold, setAppliedThreshold] = useState<number | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await getAdminUsers(offsetMonths));
    } catch (err) {
      setAlertMessage(err instanceof ApiError ? err.message : "一覧の読み込みに失敗しました");
    }
  }, [offsetMonths]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    getHolidays()
      .then((list) => setHolidays(new Set(list)))
      .catch(() => {
        // 祝日はカレンダー表示の補助情報のため、取得失敗してもドリルダウン自体は継続する
      });
  }, [user]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    loadUsers();
  }, [user, loadUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    getAdminUserDetail(selectedUserId, offsetMonths)
      .then((d) => setDetail(d))
      .catch((err) => {
        setAlertMessage(err instanceof ApiError ? err.message : "ユーザー詳細の読み込みに失敗しました");
        setSelectedUserId(null);
      });
  }, [selectedUserId, offsetMonths]);

  const applyThreshold = () => {
    const value = Number.parseFloat(thresholdInput);
    setAppliedThreshold(Number.isFinite(value) ? value : null);
  };

  const clearThreshold = () => {
    setThresholdInput("");
    setAppliedThreshold(null);
  };

  const deleteUser = async (userId: string) => {
    try {
      await deleteAdminUser(userId);
      setSelectedUserId(null);
      await loadUsers();
    } catch (err) {
      setAlertMessage(err instanceof ApiError ? err.message : "ユーザーの削除に失敗しました");
    }
  };

  if (authLoading) {
    return <p style={{ padding: 24 }}>読み込み中...</p>;
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>認証情報を取得できませんでした</h1>
          <p className="auth-error">
            Cloudflareの認証が切れている可能性があります。ページを再読み込みしてください。
          </p>
          <button type="button" onClick={reauthenticate}>
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>権限がありません</h1>
          <p className="auth-error">この画面は管理者のみ利用できます。</p>
          <a href="/">通常画面へ戻る</a>
        </div>
      </div>
    );
  }

  const filteredUsers = users ? filterUsersBelowRate(users, appliedThreshold) : [];

  return (
    <div>
      <header className="app-header">
        <div className="app-header-inner">
          <h1>管理画面</h1>
          <div className="period-nav">
            <button type="button" onClick={() => setOffsetMonths((v) => v - 1)}>
              ← 前期間
            </button>
            <button type="button" onClick={() => setOffsetMonths(0)}>
              今日
            </button>
            <button type="button" onClick={() => setOffsetMonths((v) => v + 1)}>
              翌期間 →
            </button>
          </div>
          <div className="header-actions">
            <a href="/">通常画面へ</a>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="admin-threshold-form">
          <label htmlFor="admin-threshold">出社率の閾値(%)</label>
          <input
            id="admin-threshold"
            type="number"
            min={0}
            max={100}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
          <button type="button" onClick={applyThreshold}>
            下回るユーザーを抽出
          </button>
          {appliedThreshold !== null && (
            <button type="button" onClick={clearThreshold}>
              すべて表示
            </button>
          )}
        </div>

        {users === null ? <p>読み込み中...</p> : <AdminUserTable users={filteredUsers} onSelectUser={setSelectedUserId} />}
      </main>

      {selectedUserId && (
        <div className="modal-overlay">
          <div className="modal admin-detail-modal">
            <AdminUserDetailPanel
              detail={detail}
              holidays={holidays}
              onClose={() => setSelectedUserId(null)}
              onDelete={deleteUser}
            />
          </div>
        </div>
      )}

      {alertMessage && <AlertDialog message={alertMessage} onClose={() => setAlertMessage(null)} />}
    </div>
  );
}
