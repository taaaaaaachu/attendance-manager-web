import type { AdminUserSummary } from "@attendance/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminUserTable } from "./AdminUserTable";

function makeUser(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    userId: "alice@example.com",
    closingDay: 15,
    closingDayShift: "none",
    targetOfficeRate: 50,
    period: { startDate: "2026-06-16", endDate: "2026-07-15" },
    stats: {
      totalDays: 10,
      officeDays: 4,
      remoteDays: 6,
      officeRate: 0.4,
      remainingDays: 0,
      requiredOfficeDays: 1,
    },
    ...overrides,
  };
}

describe("AdminUserTable", () => {
  it("ユーザーが0件なら案内メッセージを表示する", () => {
    render(<AdminUserTable users={[]} onSelectUser={vi.fn()} />);
    expect(screen.getByText("該当するユーザーがいません。")).toBeInTheDocument();
  });

  it("各ユーザーの締め日・集計期間・出社率・出社日数・在宅日数・目標出社率を表示する", () => {
    render(<AdminUserTable users={[makeUser()]} onSelectUser={vi.fn()} />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("15日(そのまま)")).toBeInTheDocument();
    expect(screen.getByText("2026/06/16 〜 2026/07/15")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText("4日")).toBeInTheDocument();
    expect(screen.getByText("6日")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("集計期間が年をまたぐ場合も両端に年を表示する", () => {
    render(
      <AdminUserTable
        users={[makeUser({ period: { startDate: "2025-12-16", endDate: "2026-01-15" } })]}
        onSelectUser={vi.fn()}
      />,
    );
    expect(screen.getByText("2025/12/16 〜 2026/01/15")).toBeInTheDocument();
  });

  it("closingDay=0は「月末」と表示する", () => {
    render(<AdminUserTable users={[makeUser({ closingDay: 0 })]} onSelectUser={vi.fn()} />);
    expect(screen.getByText("月末(そのまま)")).toBeInTheDocument();
  });

  it("行をクリックするとonSelectUserがuserIdで呼ばれる", () => {
    const onSelectUser = vi.fn();
    render(<AdminUserTable users={[makeUser()]} onSelectUser={onSelectUser} />);
    fireEvent.click(screen.getByText("alice@example.com"));
    expect(onSelectUser).toHaveBeenCalledExactlyOnceWith("alice@example.com");
  });
});
