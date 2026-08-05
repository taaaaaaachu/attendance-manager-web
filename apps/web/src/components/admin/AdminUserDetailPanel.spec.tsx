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
    render(<AdminUserDetailPanel detail={null} holidays={new Set()} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(screen.queryByText("出社率")).not.toBeInTheDocument();
  });

  it("detailが渡されるとユーザーIDと統計を表示する", () => {
    render(<AdminUserDetailPanel detail={DETAIL} holidays={new Set()} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "alice@example.com" })).toBeInTheDocument();
    expect(screen.getByText("出社率")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
  });

  it("閉じるボタンをクリックするとonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<AdminUserDetailPanel detail={DETAIL} holidays={new Set()} onClose={onClose} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("削除確認ダイアログはユーザーIDが完全一致するまで削除できない", () => {
    render(<AdminUserDetailPanel detail={DETAIL} holidays={new Set()} onClose={vi.fn()} onDelete={vi.fn()} />);

    const openDeleteButton = screen.getByText("このユーザーを削除");
    expect(openDeleteButton).toHaveClass("danger-button");
    fireEvent.click(openDeleteButton);
    const confirmButton = screen.getByText("完全に削除する");
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認のためユーザーIDを入力"), { target: { value: "alice" } });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("確認のためユーザーIDを入力"), {
      target: { value: "alice@example.com" },
    });
    expect(confirmButton).toBeEnabled();
  });

  it("正しいユーザーIDを入力して削除するとonDeleteが呼ばれる", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<AdminUserDetailPanel detail={DETAIL} holidays={new Set()} onClose={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByText("このユーザーを削除"));
    fireEvent.change(screen.getByLabelText("確認のためユーザーIDを入力"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByText("完全に削除する"));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith("alice@example.com");
  });
});
