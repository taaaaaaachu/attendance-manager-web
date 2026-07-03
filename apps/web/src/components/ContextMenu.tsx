import type { AttendanceStatus } from "@attendance/shared";
import { useEffect } from "react";
import { STATUS_EMOJI } from "../utils/calendarUtils";

export type ContextMenuAction =
  | AttendanceStatus
  | "clear"
  | "toggleCompanyHoliday"
  | "toggleCompanyWorkingDay";

interface Props {
  x: number;
  y: number;
  isCompanyHoliday: boolean;
  isCompanyWorkingDay: boolean;
  onSelect: (action: ContextMenuAction) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: { status: AttendanceStatus | "clear"; label: string }[] = [
  { status: "office", label: `${STATUS_EMOJI.office} 出社` },
  { status: "remote", label: `${STATUS_EMOJI.remote} 在宅` },
  { status: "paidleave", label: `${STATUS_EMOJI.paidleave} 有給` },
  { status: "clear", label: "⬜ 未設定にする" },
];

export function ContextMenu({ x, y, isCompanyHoliday, isCompanyWorkingDay, onSelect, onClose }: Props) {
  useEffect(() => {
    window.addEventListener("click", onClose);
    return () => window.removeEventListener("click", onClose);
  }, [onClose]);

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {STATUS_OPTIONS.map((option) => (
        <button key={option.status} type="button" onClick={() => onSelect(option.status)}>
          {option.label}
        </button>
      ))}
      <hr className="context-menu-separator" />
      <button type="button" onClick={() => onSelect("toggleCompanyHoliday")}>
        {isCompanyHoliday ? "会社休日を解除" : "会社休日にする"}
      </button>
      <button type="button" onClick={() => onSelect("toggleCompanyWorkingDay")}>
        {isCompanyWorkingDay ? "会社営業日を解除" : "会社営業日にする(祝日でも出社日扱い)"}
      </button>
    </div>
  );
}
