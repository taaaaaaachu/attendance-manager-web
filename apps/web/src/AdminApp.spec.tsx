import type { AdminUserDetail } from "@attendance/shared";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUserDetail } from "./api/admin";
import AdminApp from "./AdminApp";

vi.mock("./api/admin", () => ({
  deleteAdminUser: vi.fn(),
  getAdminUserDetail: vi.fn(),
  getAdminUsers: vi.fn().mockResolvedValue([]),
}));
vi.mock("./api/auth", () => ({
  fetchCurrentUser: vi.fn().mockResolvedValue({ isAdmin: true }),
  reauthenticate: vi.fn(),
}));
vi.mock("./api/holidays", () => ({ getHolidays: vi.fn().mockResolvedValue([]) }));
vi.mock("./components/admin/AdminAgentConnectionTable", () => ({ AdminAgentConnectionTable: () => null }));
vi.mock("./components/admin/AdminUserTable", () => ({
  AdminUserTable: ({ onSelectUser }: { onSelectUser: (id: string) => void }) => (
    <button type="button" onClick={() => onSelectUser("u1")}>
      選択
    </button>
  ),
}));
vi.mock("./components/admin/AdminUserDetailPanel", () => ({
  AdminUserDetailPanel: ({ detail, onClose }: { detail: AdminUserDetail | null; onClose: () => void }) => (
    <div>
      <span data-testid="detail">{detail ? detail.userId : "未取得"}</span>
      <button type="button" onClick={onClose}>
        閉じる
      </button>
    </div>
  ),
}));

/** 応答のタイミングをテストから制御できる詳細取得を1回分仕込む */
function deferDetail() {
  let resolve!: (d: AdminUserDetail) => void;
  vi.mocked(getAdminUserDetail).mockReturnValueOnce(new Promise((r) => (resolve = r)));
  return (userId: string) => act(async () => resolve({ userId } as AdminUserDetail));
}

describe("AdminApp のユーザー詳細", () => {
  beforeEach(() => vi.mocked(getAdminUserDetail).mockReset());

  it("期間を変えると、次の詳細が届くまで前の内容を出さない", async () => {
    const first = deferDetail();
    const second = deferDetail();
    render(<AdminApp />);
    await userEvent.click(await screen.findByRole("button", { name: "選択" }));
    await first("期間1");
    expect(screen.getByTestId("detail").textContent).toBe("期間1");

    await userEvent.click(screen.getByRole("button", { name: "翌期間 →" }));
    expect(screen.getByTestId("detail").textContent).toBe("未取得");

    await second("期間2");
    expect(screen.getByTestId("detail").textContent).toBe("期間2");
  });

  it("閉じて開き直すと、前の内容を出さない", async () => {
    const first = deferDetail();
    deferDetail();
    render(<AdminApp />);
    await userEvent.click(await screen.findByRole("button", { name: "選択" }));
    await first("前回");

    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await userEvent.click(screen.getByRole("button", { name: "選択" }));
    expect(screen.getByTestId("detail").textContent).toBe("未取得");
  });
});
