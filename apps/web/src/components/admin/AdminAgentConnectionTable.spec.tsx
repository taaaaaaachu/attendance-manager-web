import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "../../api/admin";
import { AdminAgentConnectionTable } from "./AdminAgentConnectionTable";

vi.mock("../../api/admin");

const mocked = vi.mocked(adminApi);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAdminAgentConnections.mockResolvedValue([
    {
      id: "c1",
      userEmail: "left@example.com",
      name: "dots",
      kind: "manual",
      origin: "手動発行",
      createdAt: "2026-10-01T00:00:00.000Z",
      lastUsedAt: "2026-10-20T00:00:00.000Z",
    },
  ]);
});

describe("AdminAgentConnectionTable", () => {
  it("全員の接続を発行者つきで表示する", async () => {
    render(<AdminAgentConnectionTable refreshKey={0} />);
    expect(await screen.findByText("left@example.com")).toBeInTheDocument();
    expect(screen.getByText("dots")).toBeInTheDocument();
  });

  it("確認してから取り消し、一覧を読み直す", async () => {
    mocked.revokeAdminAgentConnection.mockResolvedValue({ ok: true });
    render(<AdminAgentConnectionTable refreshKey={0} />);
    fireEvent.click(await screen.findByText("取り消し"));
    fireEvent.click(screen.getByText("取り消す"));

    await waitFor(() => expect(mocked.revokeAdminAgentConnection).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(mocked.getAdminAgentConnections).toHaveBeenCalledTimes(2));
  });

  it("取り消しに失敗したら画面に出す", async () => {
    mocked.revokeAdminAgentConnection.mockRejectedValue(new Error("boom"));
    render(<AdminAgentConnectionTable refreshKey={0} />);
    fireEvent.click(await screen.findByText("取り消し"));
    fireEvent.click(screen.getByText("取り消す"));

    expect(await screen.findByText("取り消しに失敗しました")).toBeInTheDocument();
  });
});
