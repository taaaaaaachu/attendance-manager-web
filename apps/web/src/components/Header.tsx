interface Props {
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onOpenSchedule: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
}

export function Header({ onPrevMonth, onNextMonth, onToday, onOpenSchedule, onOpenExport, onOpenSettings }: Props) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <h1>出社・在宅管理</h1>
        <div className="period-nav">
          <button type="button" onClick={onPrevMonth}>
            ← 前期間
          </button>
          <button type="button" onClick={onToday}>
            今日
          </button>
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
      </div>
    </header>
  );
}
