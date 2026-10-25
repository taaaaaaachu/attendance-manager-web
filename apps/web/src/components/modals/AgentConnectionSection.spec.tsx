import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api/agentConnections";
import { AgentConnectionSection } from "./AgentConnectionSection";

vi.mock("../../api/agentConnections");

const mocked = vi.mocked(api);

const CONNECTION: api.AgentConnection = {
  id: "c1",
  userEmail: "me@example.com",
  name: "muse",
  kind: "oauth",
  origin: "muse.example",
  createdAt: "2026-10-01T00:00:00.000Z",
  lastUsedAt: "2026-10-20T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listAgentConnections.mockResolvedValue([CONNECTION]);
});

describe("AgentConnectionSection", () => {
  it("接続の一覧を表示する", async () => {
    render(<AgentConnectionSection />);
    expect(await screen.findByText("muse")).toBeInTheDocument();
    expect(screen.getByText(/muse\.example/)).toBeInTheDocument();
  });

  it("トークンを発行すると、一度だけ表示する", async () => {
    mocked.issueAgentToken.mockResolvedValue({ id: "c2", token: "amw_secret" });
    render(<AgentConnectionSection />);
    fireEvent.change(await screen.findByPlaceholderText("接続の名前(例: dots)"), { target: { value: " dots " } });
    fireEvent.click(screen.getByText("トークンを発行"));

    await waitFor(() => expect(mocked.issueAgentToken).toHaveBeenCalledWith("dots"));
    expect(await screen.findByLabelText("発行したトークン")).toHaveValue("amw_secret");
  });

  it("コピーに失敗したら画面に出す", async () => {
    mocked.issueAgentToken.mockResolvedValue({ id: "c2", token: "amw_secret" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
    });
    render(<AgentConnectionSection />);
    fireEvent.change(await screen.findByPlaceholderText("接続の名前(例: dots)"), { target: { value: "dots" } });
    fireEvent.click(screen.getByText("トークンを発行"));
    fireEvent.click(await screen.findByText("コピー"));

    expect(await screen.findByText(/コピーできませんでした/)).toBeInTheDocument();
  });

  it("取り消しは確認ダイアログを挟んでから呼ぶ", async () => {
    mocked.revokeAgentConnection.mockResolvedValue({ ok: true });
    render(<AgentConnectionSection />);
    fireEvent.click(await screen.findByText("取り消し"));
    expect(mocked.revokeAgentConnection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("取り消す"));

    await waitFor(() => expect(mocked.revokeAgentConnection).toHaveBeenCalledWith("c1"));
  });
});
