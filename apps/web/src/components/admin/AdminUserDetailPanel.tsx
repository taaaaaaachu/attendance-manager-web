import type { AdminUserDetail } from "@attendance/shared";
import { useState } from "react";
import { CalendarPanel } from "../CalendarPanel";
import { StatsPanel } from "../StatsPanel";

interface Props {
  detail: AdminUserDetail | null;
  holidays: ReadonlySet<string>;
  onClose: () => void;
  onDelete: (userId: string) => Promise<void>;
}

const noop = () => {};

/** 管理者によるユーザー別ドリルダウン。読み取り専用でカレンダーと統計を表示する */
export function AdminUserDetailPanel({ detail, holidays, onClose, onDelete }: Props) {
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canDelete = detail !== null && deleteConfirmation === detail.userId && !deleting;

  const handleDelete = async () => {
    if (!detail || !canDelete) return;
    setDeleting(true);
    try {
      await onDelete(detail.userId);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteConfirmation("");
    }
  };

  return (
    <div className="admin-detail-panel">
      <div className="admin-detail-header">
        <h2>{detail ? detail.userId : "読み込み中..."}</h2>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      {detail && (
        <>
          <StatsPanel stats={detail.stats} />
          <CalendarPanel
            period={detail.period}
            records={new Map(detail.records.map((r) => [r.date, r]))}
            holidays={holidays}
            companyHolidays={new Set(detail.companyHolidays)}
            companyWorkingDays={new Set(detail.companyWorkingDays)}
            onDayClick={noop}
            onDayContextMenu={noop}
            readOnly
          />
          <section className="admin-danger-zone">
            <h3>危険な操作</h3>
            <p>
              このユーザーの勤怠・設定・連携データを完全に削除します。続行するには
              <strong>{detail.userId}</strong> を入力してください。
            </p>
            <button type="button" className="danger-button" onClick={() => setDeleteDialogOpen(true)}>
              このユーザーを削除
            </button>
          </section>
        </>
      )}
      {detail && deleteDialogOpen && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteDialogOpen(false)}>
          <div className="modal admin-delete-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>ユーザーを完全に削除しますか？</h3>
            <p>
              <strong>{detail.userId}</strong> の勤怠・設定・連携データを削除します。この操作は元に戻せません。
            </p>
            <label htmlFor="admin-delete-user-confirmation">確認のためユーザーIDを入力</label>
            <input
              id="admin-delete-user-confirmation"
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              autoComplete="off"
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
                キャンセル
              </button>
              <button type="button" className="danger-button" disabled={!canDelete} onClick={handleDelete}>
                {deleting ? "削除中..." : "完全に削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
