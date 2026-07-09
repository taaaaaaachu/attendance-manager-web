import type { AdminUserDetail } from "@attendance/shared";
import { CalendarPanel } from "../CalendarPanel";
import { StatsPanel } from "../StatsPanel";

interface Props {
  detail: AdminUserDetail | null;
  holidays: ReadonlySet<string>;
  onClose: () => void;
}

const noop = () => {};

/** 管理者によるユーザー別ドリルダウン。読み取り専用でカレンダーと統計を表示する */
export function AdminUserDetailPanel({ detail, holidays, onClose }: Props) {
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
        </>
      )}
    </div>
  );
}
