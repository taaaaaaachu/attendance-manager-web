import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as linksApi from "../../api/links";
import { AccountLinkSection } from "./AccountLinkSection";

vi.mock("../../api/links");

const mocked = vi.mocked(linksApi);

function stubState(state: Partial<linksApi.LinkState> = {}) {
  mocked.getLinkState.mockResolvedValue({
    members: [],
    owner: null,
    incoming: [],
    outgoing: [],
    ...state,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AccountLinkSection", () => {
  it("未連携なら申請フォームを表示し、申請するとsendLinkRequestが呼ばれる", async () => {
    stubState();
    mocked.sendLinkRequest.mockResolvedValue({ ok: true });
    render(<AccountLinkSection onChanged={vi.fn()} />);

    const input = await screen.findByPlaceholderText("招くメールアドレス");
    fireEvent.change(input, { target: { value: "Other@Example.com" } });
    fireEvent.click(screen.getByText("申請する"));

    await waitFor(() => expect(mocked.sendLinkRequest).toHaveBeenCalledWith("other@example.com"));
  });

  it("メンバーとしてログイン中なら所有者名と解除ボタンを表示し、解除でleaveLinkとonChangedが呼ばれる", async () => {
    stubState({ owner: "owner@example.com" });
    mocked.leaveLink.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();
    render(<AccountLinkSection onChanged={onChanged} />);

    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByText("連携を解除する"));

    await waitFor(() => expect(mocked.leaveLink).toHaveBeenCalled());
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("受信申請の承認は確認ダイアログを挟んでからacceptLinkRequestを呼ぶ", async () => {
    stubState({ incoming: [{ email: "req@example.com", createdAt: "2026-07-01" }] });
    mocked.acceptLinkRequest.mockResolvedValue({ ok: true });
    render(<AccountLinkSection onChanged={vi.fn()} />);

    fireEvent.click(await screen.findByText("承認"));
    // 確認ダイアログの承認ボタンを押すまではAPIは呼ばれない
    expect(mocked.acceptLinkRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("承認する"));
    await waitFor(() => expect(mocked.acceptLinkRequest).toHaveBeenCalledWith("req@example.com"));
  });
});
