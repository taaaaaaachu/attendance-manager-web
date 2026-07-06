import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

function mockMenuSize(width: number, height: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ContextMenu", () => {
  it("画面右端に近い位置で開いた場合、メニュー全体が画面内に収まるよう左位置を補正する", () => {
    mockMenuSize(200, 150);

    render(
      <ContextMenu
        x={390}
        y={10}
        isCompanyHoliday={false}
        isCompanyWorkingDay={false}
        isHoliday={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    const menu = screen.getByText("🏢 出社").closest(".context-menu") as HTMLElement;
    // left = min(390, innerWidth(400) - width(200) - margin(8)) = 192
    expect(menu.style.left).toBe("192px");
  });

  it("画面下端に近い位置で開いた場合、上方向に収まるよう補正する", () => {
    mockMenuSize(200, 150);

    render(
      <ContextMenu
        x={10}
        y={790}
        isCompanyHoliday={false}
        isCompanyWorkingDay={false}
        isHoliday={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    const menu = screen.getByText("🏢 出社").closest(".context-menu") as HTMLElement;
    // top = min(790, innerHeight(800) - height(150) - margin(8)) = 642
    expect(menu.style.top).toBe("642px");
  });

  it("十分な余白がある位置ではクリック座標をそのまま使う", () => {
    mockMenuSize(200, 150);

    render(
      <ContextMenu
        x={50}
        y={50}
        isCompanyHoliday={false}
        isCompanyWorkingDay={false}
        isHoliday={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    const menu = screen.getByText("🏢 出社").closest(".context-menu") as HTMLElement;
    expect(menu.style.left).toBe("50px");
    expect(menu.style.top).toBe("50px");
  });

  it("会社休日/会社営業日が既に設定済みの場合はラベルが解除表示になる", () => {
    mockMenuSize(200, 150);

    render(
      <ContextMenu
        x={10}
        y={10}
        isCompanyHoliday={true}
        isCompanyWorkingDay={true}
        isHoliday={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("会社休日を解除")).toBeInTheDocument();
    expect(screen.getByText("会社営業日を解除")).toBeInTheDocument();
  });

  it("会社営業日にするのラベルにカッコ書きの説明が付かない", () => {
    mockMenuSize(200, 150);

    render(
      <ContextMenu
        x={10}
        y={10}
        isCompanyHoliday={false}
        isCompanyWorkingDay={false}
        isHoliday={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("会社営業日にする")).toBeInTheDocument();
  });

  it("休日(isHoliday=true)では出社/在宅/有給が無効化され、未設定にするや会社休日/会社営業日の切替は有効のまま", () => {
    mockMenuSize(200, 150);

    render(
      <ContextMenu
        x={10}
        y={10}
        isCompanyHoliday={false}
        isCompanyWorkingDay={false}
        isHoliday={true}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("🏢 出社")).toBeDisabled();
    expect(screen.getByText("🏠 在宅")).toBeDisabled();
    expect(screen.getByText("🌴 有給")).toBeDisabled();
    expect(screen.getByText("⬜ 未設定にする")).toBeEnabled();
    expect(screen.getByText("会社休日にする")).toBeEnabled();
    expect(screen.getByText("会社営業日にする")).toBeEnabled();
  });

  it("平日(isHoliday=false)では出社/在宅/有給が有効", () => {
    mockMenuSize(200, 150);

    render(
      <ContextMenu
        x={10}
        y={10}
        isCompanyHoliday={false}
        isCompanyWorkingDay={false}
        isHoliday={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("🏢 出社")).toBeEnabled();
    expect(screen.getByText("🏠 在宅")).toBeEnabled();
    expect(screen.getByText("🌴 有給")).toBeEnabled();
  });
});
