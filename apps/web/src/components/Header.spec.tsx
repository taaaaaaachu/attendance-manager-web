import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

function renderHeader(overrides: Partial<Parameters<typeof Header>[0]> = {}) {
  const onPrevMonth = vi.fn();
  const onNextMonth = vi.fn();
  const onToday = vi.fn();
  const onOpenSchedule = vi.fn();
  const onOpenExport = vi.fn();
  const onOpenSettings = vi.fn();
  const utils = render(
    <Header
      onPrevMonth={onPrevMonth}
      onNextMonth={onNextMonth}
      onToday={onToday}
      onOpenSchedule={onOpenSchedule}
      onOpenExport={onOpenExport}
      onOpenSettings={onOpenSettings}
      {...overrides}
    />,
  );
  return { ...utils, onPrevMonth, onNextMonth, onToday, onOpenSchedule, onOpenExport, onOpenSettings };
}

describe("Header", () => {
  it("期間の範囲テキストは表示されない", () => {
    renderHeader();
    expect(screen.queryByText(/〜/)).not.toBeInTheDocument();
  });

  it("「今日」ボタンをクリックするとonTodayが呼ばれる", () => {
    const { onToday } = renderHeader();
    fireEvent.click(screen.getByText("今日"));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("前期間・翌期間ボタンはそれぞれのハンドラを呼ぶ", () => {
    const { onPrevMonth, onNextMonth } = renderHeader();
    fireEvent.click(screen.getByText("← 前期間"));
    fireEvent.click(screen.getByText("翌期間 →"));
    expect(onPrevMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });

  it("管理者でなければ「管理画面」リンクは表示されない", () => {
    renderHeader();
    expect(screen.queryByText("管理画面")).not.toBeInTheDocument();
  });

  it("管理者には/adminへの「管理画面」リンクが表示される", () => {
    renderHeader({ isAdmin: true });
    const link = screen.getByText("管理画面");
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link).toHaveAttribute("href", "/admin");
  });

  it("settingsBadgeがtrueのとき設定ボタンに連携申請バッジが表示される", () => {
    const { rerender } = renderHeader();
    expect(screen.queryByLabelText("連携申請あり")).not.toBeInTheDocument();

    rerender(
      <Header
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
        onToday={vi.fn()}
        onOpenSchedule={vi.fn()}
        onOpenExport={vi.fn()}
        onOpenSettings={vi.fn()}
        settingsBadge
      />,
    );
    expect(screen.getByLabelText("連携申請あり")).toBeInTheDocument();
  });
});
