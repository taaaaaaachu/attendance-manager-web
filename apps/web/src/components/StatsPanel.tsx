import type { AttendanceStats } from "@attendance/shared";

interface Props {
  stats: AttendanceStats | null;
  targetOfficeRate: number;
}

export function StatsPanel({ stats, targetOfficeRate }: Props) {
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
        <dt>目標出社率</dt>
        <dd>{targetOfficeRate}%</dd>
        <dt>出社日数</dt>
        <dd>{stats.officeDays}日</dd>
        <dt>在宅日数</dt>
        <dd>{stats.remoteDays}日</dd>
        <dt>営業日数(有給除く)</dt>
        <dd>{stats.totalDays}日</dd>
        <dt>残り営業日</dt>
        <dd>{stats.remainingDays}日</dd>
        <dt>目標までに必要な出社日数</dt>
        <dd>{stats.requiredOfficeDays}日</dd>
      </dl>
    </div>
  );
}
