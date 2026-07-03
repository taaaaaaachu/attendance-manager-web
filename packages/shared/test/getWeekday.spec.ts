import { describe, expect, it } from "vitest";
import { getWeekday } from "../src/dateUtils";

describe("getWeekday", () => {
  it("日曜は0", () => {
    expect(getWeekday("2026-02-01")).toBe(0);
  });
  it("土曜は6", () => {
    expect(getWeekday("2026-02-14")).toBe(6);
  });
  it("月曜は1", () => {
    expect(getWeekday("2026-02-16")).toBe(1);
  });
});
