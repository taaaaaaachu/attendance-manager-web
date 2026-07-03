import type { AttendanceStats } from "@attendance/shared";

interface Props {
  stats: AttendanceStats | null;
}

export function StatsPanel({ stats }: Props) {
  if (!stats) {
    return (
      <div className="stats-panel">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="stats-panel">
      <dl>
        <dt>出社率</dt>
        <dd>{(stats.officeRate * 100).toFixed(1)}%</dd>
        <dt>出社日数</dt>
        <dd>{stats.officeDays}日</dd>
        <dt>在宅日数</dt>
        <dd>{stats.remoteDays}日</dd>
        <dt>必要出社日数</dt>
        <dd>{stats.requiredOfficeDays}日</dd>
      </dl>
    </div>
  );
}
