import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPanel } from "./CalendarPanel";

const PERIOD = { startDate: "2026-06-16", endDate: "2026-07-15" };
const EMPTY = new Set<string>();

function renderCalendar(onDayClick = vi.fn(), onDayContextMenu = vi.fn()) {
  const utils = render(
    <CalendarPanel
      period={PERIOD}
      records={new Map()}
      holidays={EMPTY}
      companyHolidays={EMPTY}
      companyWorkingDays={EMPTY}
      onDayClick={onDayClick}
      onDayContextMenu={onDayContextMenu}
    />,
  );
  return { ...utils, onDayClick, onDayContextMenu };
}

/** 指定日付のタイル内インタラクションレイヤーを取得する。 */
function getLayerByDate(container: HTMLElement, label: string): HTMLElement {
  const abbr = container.querySelector(`abbr[aria-label="${label}"]`);
  const layer = abbr?.closest(".react-calendar__tile")?.querySelector(".tile-interaction-layer");
  expect(layer).not.toBeNull();
  return layer as HTMLElement;
}

describe("CalendarPanel", () => {
  it("期間外(グレー表示)のセルをクリックしてもonDayClickは呼ばれない", () => {
    const { container, onDayClick } = renderCalendar();

    const disabledLayer = container.querySelector(
      ".react-calendar__tile.tile-disabled .tile-interaction-layer",
    ) as HTMLElement;
    expect(disabledLayer).not.toBeNull();

    fireEvent.click(disabledLayer);
    expect(onDayClick).not.toHaveBeenCalled();
  });

  it("期間外(グレー表示)のセルを右クリックしてもonDayContextMenuは呼ばれない", () => {
    const { container, onDayContextMenu } = renderCalendar();

    const disabledLayer = container.querySelector(
      ".react-calendar__tile.tile-disabled .tile-interaction-layer",
    ) as HTMLElement;

    fireEvent.contextMenu(disabledLayer);
    expect(onDayContextMenu).not.toHaveBeenCalled();
  });

  it("期間内のセルをクリックするとonDayClickがその日付で呼ばれる(期間開始日=2026-06-16)", () => {
    const { container, onDayClick } = renderCalendar();

    const enabledLayer = container.querySelector(
      ".react-calendar__tile:not(.tile-disabled) .tile-interaction-layer",
    ) as HTMLElement;
    expect(enabledLayer).not.toBeNull();

    fireEvent.click(enabledLayer);
    expect(onDayClick).toHaveBeenCalledTimes(1);
    expect(onDayClick).toHaveBeenCalledWith("2026-06-16");
  });

  it("期間内のセルを右クリックするとonDayContextMenuが呼ばれる", () => {
    const { container, onDayContextMenu } = renderCalendar();

    const enabledLayer = container.querySelector(
      ".react-calendar__tile:not(.tile-disabled) .tile-interaction-layer",
    ) as HTMLElement;

    fireEvent.contextMenu(enabledLayer);
    expect(onDayContextMenu).toHaveBeenCalledTimes(1);
    expect(onDayContextMenu.mock.calls[0][0]).toBe("2026-06-16");
  });

  it("休日(土曜)のセルをクリックしてもonDayClickは呼ばれない", () => {
    const { container, onDayClick } = renderCalendar();

    // 2026-06-20は土曜日(期間内)
    const layer = getLayerByDate(container, "2026年6月20日");
    fireEvent.click(layer);
    expect(onDayClick).not.toHaveBeenCalled();
  });

  it("休日(土曜)のセルでも右クリックのonDayContextMenuは呼ばれる(会社営業日設定のため)", () => {
    const { container, onDayContextMenu } = renderCalendar();

    const layer = getLayerByDate(container, "2026年6月20日");
    fireEvent.contextMenu(layer);
    expect(onDayContextMenu).toHaveBeenCalledTimes(1);
    expect(onDayContextMenu.mock.calls[0][0]).toBe("2026-06-20");
  });

  it("会社休日にした平日のセルをクリックしてもonDayClickは呼ばれない", () => {
    const onDayClick = vi.fn();
    const { container } = render(
      <CalendarPanel
        period={PERIOD}
        records={new Map()}
        holidays={EMPTY}
        companyHolidays={new Set(["2026-06-17"])}
        companyWorkingDays={EMPTY}
        onDayClick={onDayClick}
        onDayContextMenu={vi.fn()}
      />,
    );

    // 2026-06-17は水曜日だが会社休日に設定済み
    const layer = getLayerByDate(container, "2026年6月17日");
    fireEvent.click(layer);
    expect(onDayClick).not.toHaveBeenCalled();
  });

  it("会社営業日にした土曜のセルはクリックでonDayClickが呼ばれる", () => {
    const onDayClick = vi.fn();
    const { container } = render(
      <CalendarPanel
        period={PERIOD}
        records={new Map()}
        holidays={EMPTY}
        companyHolidays={EMPTY}
        companyWorkingDays={new Set(["2026-06-20"])}
        onDayClick={onDayClick}
        onDayContextMenu={vi.fn()}
      />,
    );

    const layer = getLayerByDate(container, "2026年6月20日");
    fireEvent.click(layer);
    expect(onDayClick).toHaveBeenCalledWith("2026-06-20");
  });

  it("期間が2ヶ月にまたがる場合は2つの月カレンダーを表示する", () => {
    const { container } = renderCalendar();
    expect(container.querySelectorAll(".calendar-month")).toHaveLength(2);
  });

  it("期間が1ヶ月に収まる場合は1つの月カレンダーのみ表示する", () => {
    const { container } = render(
      <CalendarPanel
        period={{ startDate: "2026-06-01", endDate: "2026-06-30" }}
        records={new Map()}
        holidays={EMPTY}
        companyHolidays={EMPTY}
        companyWorkingDays={EMPTY}
        onDayClick={vi.fn()}
        onDayContextMenu={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".calendar-month")).toHaveLength(1);
  });

  describe("今日の日付のタイル", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 16)); // 期間内(2026-06-16)を「今日」に固定
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("今日のタイルにtile-todayクラスが付与される", () => {
      const { container } = renderCalendar();
      expect(container.querySelector(".react-calendar__tile.tile-today")).not.toBeNull();
    });
  });
});
