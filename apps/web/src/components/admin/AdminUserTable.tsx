import type { AdminUserSummary, ClosingDayShift } from "@attendance/shared";

const CLOSING_DAY_SHIFT_LABEL: Record<ClosingDayShift, string> = {
  none: "そのまま",
  previous: "前倒し",
  next: "後ろ倒し",
};

function closingDayLabel(closingDay: number): string {
  return closingDay === 0 ? "月末" : `${closingDay}日`;
}

interface Props {
  users: AdminUserSummary[];
  onSelectUser: (userId: string) => void;
}

export function AdminUserTable({ users, onSelectUser }: Props) {
  if (users.length === 0) {
    return <p>該当するユーザーがいません。</p>;
  }

  return (
    <table className="admin-user-table">
      <thead>
        <tr>
          <th>ユーザー</th>
          <th>締め日</th>
          <th>出社率</th>
          <th>出社日数</th>
          <th>在宅日数</th>
          <th>目標出社率</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.userId} onClick={() => onSelectUser(u.userId)} className="admin-user-row">
            <td>{u.userId}</td>
            <td>
              {closingDayLabel(u.closingDay)}({CLOSING_DAY_SHIFT_LABEL[u.closingDayShift]})
            </td>
            <td>{(u.stats.officeRate * 100).toFixed(1)}%</td>
            <td>{u.stats.officeDays}日</td>
            <td>{u.stats.remoteDays}日</td>
            <td>{u.targetOfficeRate}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
