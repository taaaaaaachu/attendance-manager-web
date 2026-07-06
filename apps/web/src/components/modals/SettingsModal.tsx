import type { UserSettings } from "@attendance/shared";
import { isBaseHoliday } from "@attendance/shared";
import { useState } from "react";
import type { CurrentUser } from "../../api/auth";
import { AlertDialog } from "./AlertDialog";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  user: CurrentUser;
  settings: UserSettings;
  holidays: ReadonlySet<string>;
  companyHolidays: string[];
  companyWorkingDays: string[];
  onClose: () => void;
  onLogout: () => void;
  onSaveSettings: (settings: UserSettings) => Promise<void>;
  onAddCompanyHoliday: (date: string) => Promise<void>;
  onRemoveCompanyHoliday: (date: string) => Promise<void>;
  onAddCompanyWorkingDay: (date: string) => Promise<void>;
  onRemoveCompanyWorkingDay: (date: string) => Promise<void>;
  onFetchHolidays: () => Promise<void>;
  onResetPeriod: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

export function SettingsModal(props: Props) {
  const [targetOfficeRate, setTargetOfficeRate] = useState(props.settings.targetOfficeRate);
  const [closingDay, setClosingDay] = useState(props.settings.closingDay);
  const [closingDayShift, setClosingDayShift] = useState(props.settings.closingDayShift);
  const [mandatoryDaysText, setMandatoryDaysText] = useState(
    props.settings.mandatoryOfficeDayRules.join(", "),
  );
  const [autoFetchHolidays, setAutoFetchHolidays] = useState(props.settings.autoFetchHolidays);
  const [newHoliday, setNewHoliday] = useState("");
  const [newWorkingDay, setNewWorkingDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingReset, setPendingReset] = useState<"period" | "all" | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const handleSave = async () => {
    const mandatoryOfficeDayRules = mandatoryDaysText
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);

    setSaving(true);
    try {
      await props.onSaveSettings({
        targetOfficeRate,
        closingDay,
        closingDayShift,
        mandatoryOfficeDayRules,
        autoFetchHolidays,
      });
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>設定</h2>

        <div className="field">
          <label>ログイン中のID</label>
          <div>{props.user.userId}</div>
        </div>

        <div className="field">
          <label>目標出社率(%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={targetOfficeRate}
            onChange={(e) => setTargetOfficeRate(Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label>締め日(0=月末)</label>
          <input
            type="number"
            min={0}
            max={31}
            value={closingDay}
            onChange={(e) => setClosingDay(Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label>締め日が休日の場合</label>
          <select value={closingDayShift} onChange={(e) => setClosingDayShift(e.target.value as UserSettings["closingDayShift"])}>
            <option value="none">ずらさない</option>
            <option value="previous">前営業日にする</option>
            <option value="next">翌営業日にする</option>
          </select>
        </div>

        <div className="field">
          <label>全員出社日(毎月の日、カンマ区切り 例: 1, 16)</label>
          <input value={mandatoryDaysText} onChange={(e) => setMandatoryDaysText(e.target.value)} />
        </div>

        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={autoFetchHolidays}
              onChange={(e) => setAutoFetchHolidays(e.target.checked)}
            />
            {" "}祝日を自動取得する
          </label>
        </div>

        <div className="field">
          <button type="button" onClick={props.onFetchHolidays}>
            内閣府から祝日データを取得
          </button>
        </div>

        <div className="field">
          <label>会社休日</label>
          <div style={{ display: "flex", gap: "6px" }}>
            <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} />
            <button
              type="button"
              onClick={async () => {
                if (!newHoliday) return;
                // もともと休日(土日祝)は会社休日にする意味がない
                if (isBaseHoliday(newHoliday, props.holidays)) {
                  setValidationMessage("もともと休日です");
                  return;
                }
                await props.onAddCompanyHoliday(newHoliday);
                setNewHoliday("");
              }}
            >
              追加
            </button>
          </div>
          <ul className="date-list">
            {props.companyHolidays.map((date) => (
              <li key={date}>
                {date}
                <button type="button" onClick={() => props.onRemoveCompanyHoliday(date)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="field">
          <label>会社営業日</label>
          <div style={{ display: "flex", gap: "6px" }}>
            <input type="date" value={newWorkingDay} onChange={(e) => setNewWorkingDay(e.target.value)} />
            <button
              type="button"
              onClick={async () => {
                if (!newWorkingDay) return;
                // もともと平日は会社営業日にする意味がない
                if (!isBaseHoliday(newWorkingDay, props.holidays)) {
                  setValidationMessage("もともと平日です");
                  return;
                }
                await props.onAddCompanyWorkingDay(newWorkingDay);
                setNewWorkingDay("");
              }}
            >
              追加
            </button>
          </div>
          <ul className="date-list">
            {props.companyWorkingDays.map((date) => (
              <li key={date}>
                {date}
                <button type="button" onClick={() => props.onRemoveCompanyWorkingDay(date)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="field">
          <label>データのリセット</label>
          <div style={{ display: "flex", gap: "6px" }}>
            <button type="button" className="danger" onClick={() => setPendingReset("period")}>
              この期間をリセット
            </button>
            <button type="button" className="danger" onClick={() => setPendingReset("all")}>
              全データをリセット
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="danger" onClick={props.onLogout}>
            ログアウト
          </button>
          <button type="button" onClick={props.onClose}>
            キャンセル
          </button>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {validationMessage && (
        <AlertDialog message={validationMessage} onClose={() => setValidationMessage(null)} />
      )}

      {pendingReset && (
        <ConfirmDialog
          message={
            pendingReset === "all"
              ? "全期間の勤怠・会社休日・会社営業日を削除します。この操作は取り消せません。よろしいですか?"
              : "この期間の勤怠・会社休日・会社営業日を削除します。この操作は取り消せません。よろしいですか?"
          }
          confirmLabel="削除する"
          onCancel={() => setPendingReset(null)}
          onConfirm={async () => {
            const scope = pendingReset;
            setPendingReset(null);
            if (scope === "all") {
              await props.onResetAll();
            } else {
              await props.onResetPeriod();
            }
          }}
        />
      )}
    </div>
  );
}
