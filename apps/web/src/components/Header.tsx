import type { Period } from "@attendance/shared";

interface Props {
  period: Period | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onOpenSchedule: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
}

export function Header({ period, onPrevMonth, onNextMonth, onOpenSchedule, onOpenExport, onOpenSettings }: Props) {
  return (
    <header className="app-header">
      <h1>出社・在宅管理</h1>
      <div className="period-nav">
        <button type="button" onClick={onPrevMonth}>
          ← 前期間
        </button>
        <span>{period ? `${period.startDate} 〜 ${period.endDate}` : "読み込み中..."}</span>
        <button type="button" onClick={onNextMonth}>
          翌期間 →
        </button>
      </div>
      <div className="header-actions">
        <button type="button" onClick={onOpenSchedule}>
          自動スケジュール
        </button>
        <button type="button" onClick={onOpenExport}>
          エクスポート
        </button>
        <button type="button" onClick={onOpenSettings}>
          設定
        </button>
      </div>
    </header>
  );
}
