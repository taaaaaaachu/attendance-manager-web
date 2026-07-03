import { describe, expect, it } from "vitest";
import { parseCabinetOfficeCsv, parseSlashDate } from "../src/routes/holidays";

describe("parseSlashDate", () => {
  it("YYYY/M/D形式をYYYY-MM-DDに変換する", () => {
    expect(parseSlashDate("2026/1/1")).toBe("2026-01-01");
    expect(parseSlashDate("2026/12/29")).toBe("2026-12-29");
  });

  it("不正な形式はnullを返す", () => {
    expect(parseSlashDate("not a date")).toBeNull();
    expect(parseSlashDate(undefined)).toBeNull();
  });
});

describe("parseCabinetOfficeCsv", () => {
  it("ヘッダー行を除いて日付を抽出する", () => {
    const csv = "国民の祝日・休日月日,国民の祝日・休日名称\n2026/1/1,元日\n2026/1/12,成人の日\n";
    expect(parseCabinetOfficeCsv(csv)).toEqual(["2026-01-01", "2026-01-12"]);
  });

  it("空行は無視する", () => {
    const csv = "header\n2026/1/1,元日\n\n2026/1/12,成人の日\n";
    expect(parseCabinetOfficeCsv(csv)).toEqual(["2026-01-01", "2026-01-12"]);
  });
});
