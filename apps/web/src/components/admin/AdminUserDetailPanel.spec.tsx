import type { AdminUserDetail } from "@attendance/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminUserDetailPanel } from "./AdminUserDetailPanel";

const DETAIL: AdminUserDetail = {
  userId: "alice@example.com",
  period: { startDate: "2026-06-16", endDate: "2026-07-15" },
  records: [{ date: "2026-06-16", status: "office" }],
  companyHolidays: [],
  companyWorkingDays: [],
  settings: {
    mandatoryOfficeDayRules: [],
    targetOfficeRate: 50,
    closingDay: 15,
    closingDayShift: "none",
    autoFetchHolidays: true,
  },
  stats: {
    totalDays: 20,
    officeDays: 8,
    remoteDays: 12,
    officeRate: 0.4,
    remainingDays: 5,
    requiredOfficeDays: 2,
  },
};

describe("AdminUserDetailPanel", () => {
  it("detailがnullの間は読み込み中と表示し、統計・カレンダーは表示しない", () => {
    render(<AdminUserDetailPanel detail={null} holidays={new Set()} onClose={vi.fn()} />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(screen.queryByText("出社率")).not.toBeInTheDocument();
  });

  it("detailが渡されるとユーザーIDと統計を表示する", () => {
    render(<AdminUserDetailPanel detail={DETAIL} holidays={new Set()} onClose={vi.fn()} />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("出社率")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
  });

  it("閉じるボタンをクリックするとonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<AdminUserDetailPanel detail={DETAIL} holidays={new Set()} onClose={onClose} />);
    fireEvent.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
