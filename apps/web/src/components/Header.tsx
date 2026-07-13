interface Props {
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onOpenSchedule: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  isAdmin?: boolean;
  /** 未承認の連携申請があるとき、設定ボタンにバッジを表示する */
  settingsBadge?: boolean;
}

export function Header({
  onPrevMonth,
  onNextMonth,
  onToday,
  onOpenSchedule,
  onOpenExport,
  onOpenSettings,
  isAdmin = false,
  settingsBadge = false,
}: Props) {
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
            設定{settingsBadge && <span className="badge" aria-label="連携申請あり">●</span>}
          </button>
          {isAdmin && <a href="/admin">管理画面</a>}
        </div>
      </div>
    </header>
  );
}
