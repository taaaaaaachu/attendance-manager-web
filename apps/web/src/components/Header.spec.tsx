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
});
