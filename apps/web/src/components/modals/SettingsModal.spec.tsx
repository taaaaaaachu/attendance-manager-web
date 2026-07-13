import type { UserSettings } from "@attendance/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

// SettingsModal内のAccountLinkSectionがマウント時に叩く連携APIは、このテストの対象外なのでモックする
vi.mock("../../api/links", () => ({
  getLinkState: vi.fn().mockResolvedValue({ members: [], owner: null, incoming: [], outgoing: [] }),
  sendLinkRequest: vi.fn(),
  cancelLinkRequest: vi.fn(),
  acceptLinkRequest: vi.fn(),
  rejectLinkRequest: vi.fn(),
  removeMember: vi.fn(),
  leaveLink: vi.fn(),
}));

const SETTINGS: UserSettings = {
  targetOfficeRate: 50,
  closingDay: 15,
  closingDayShift: "none",
  mandatoryOfficeDayRules: [],
  autoFetchHolidays: false,
};

function renderModal(overrides: Partial<Parameters<typeof SettingsModal>[0]> = {}) {
  const onAddCompanyHoliday = vi.fn().mockResolvedValue(undefined);
  const onAddCompanyWorkingDay = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <SettingsModal
      user={{ userId: "testuser", email: null, isAdmin: false, linkedTo: null, incomingRequestCount: 0 }}
      settings={SETTINGS}
      holidays={new Set(["2026-02-11"])} // 建国記念の日(水曜)
      companyHolidays={[]}
      companyWorkingDays={[]}
      onClose={() => {}}
      onLogout={() => {}}
      onSaveSettings={vi.fn().mockResolvedValue(undefined)}
      onAddCompanyHoliday={onAddCompanyHoliday}
      onRemoveCompanyHoliday={vi.fn().mockResolvedValue(undefined)}
      onAddCompanyWorkingDay={onAddCompanyWorkingDay}
      onRemoveCompanyWorkingDay={vi.fn().mockResolvedValue(undefined)}
      onFetchHolidays={vi.fn().mockResolvedValue(undefined)}
      onResetPeriod={vi.fn().mockResolvedValue(undefined)}
      onResetAll={vi.fn().mockResolvedValue(undefined)}
      onLinkChanged={vi.fn()}
      {...overrides}
    />,
  );
  return { ...utils, onAddCompanyHoliday, onAddCompanyWorkingDay };
}

/** 指定ラベルのフィールド内にある日付入力と追加ボタンを取得する。 */
function getFieldControls(container: HTMLElement, label: string) {
  const field = Array.from(container.querySelectorAll(".field")).find(
    (el) => el.querySelector("label")?.textContent === label,
  ) as HTMLElement;
  expect(field).toBeDefined();
  const input = field.querySelector('input[type="date"]') as HTMLInputElement;
  const addButton = Array.from(field.querySelectorAll("button")).find(
    (b) => b.textContent === "追加",
  ) as HTMLButtonElement;
  return { input, addButton };
}

describe("SettingsModal 会社休日・会社営業日のバリデーション", () => {
  it("もともと休日(土曜)を会社休日に追加しようとすると「もともと休日です」を表示して追加しない", () => {
    const { container, onAddCompanyHoliday } = renderModal();
    const { input, addButton } = getFieldControls(container, "会社休日");

    fireEvent.change(input, { target: { value: "2026-02-14" } }); // 土曜
    fireEvent.click(addButton);

    expect(screen.getByText("もともと休日です")).toBeInTheDocument();
    expect(onAddCompanyHoliday).not.toHaveBeenCalled();
  });

  it("もともと休日(祝日)を会社休日に追加しようとすると「もともと休日です」を表示して追加しない", () => {
    const { container, onAddCompanyHoliday } = renderModal();
    const { input, addButton } = getFieldControls(container, "会社休日");

    fireEvent.change(input, { target: { value: "2026-02-11" } }); // 祝日(水曜)
    fireEvent.click(addButton);

    expect(screen.getByText("もともと休日です")).toBeInTheDocument();
    expect(onAddCompanyHoliday).not.toHaveBeenCalled();
  });

  it("平日は会社休日に追加できる", () => {
    const { container, onAddCompanyHoliday } = renderModal();
    const { input, addButton } = getFieldControls(container, "会社休日");

    fireEvent.change(input, { target: { value: "2026-02-16" } }); // 月曜
    fireEvent.click(addButton);

    expect(screen.queryByText("もともと休日です")).not.toBeInTheDocument();
    expect(onAddCompanyHoliday).toHaveBeenCalledWith("2026-02-16");
  });

  it("もともと平日を会社営業日に追加しようとすると「もともと平日です」を表示して追加しない", () => {
    const { container, onAddCompanyWorkingDay } = renderModal();
    const { input, addButton } = getFieldControls(container, "会社営業日");

    fireEvent.change(input, { target: { value: "2026-02-16" } }); // 月曜
    fireEvent.click(addButton);

    expect(screen.getByText("もともと平日です")).toBeInTheDocument();
    expect(onAddCompanyWorkingDay).not.toHaveBeenCalled();
  });

  it("土日祝は会社営業日に追加できる", () => {
    const { container, onAddCompanyWorkingDay } = renderModal();
    const { input, addButton } = getFieldControls(container, "会社営業日");

    fireEvent.change(input, { target: { value: "2026-02-11" } }); // 祝日(水曜)
    fireEvent.click(addButton);

    expect(screen.queryByText("もともと平日です")).not.toBeInTheDocument();
    expect(onAddCompanyWorkingDay).toHaveBeenCalledWith("2026-02-11");
  });
});
