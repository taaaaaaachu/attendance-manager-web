import type { AttendanceStatus } from "@attendance/shared";
import { useEffect, useRef, useState } from "react";
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
  /** 休日(土日祝・会社休日)の場合はtrue。出社/在宅/有給の変更を無効化する。 */
  isHoliday: boolean;
  /** もともと休日(土日祝)の場合はtrue。会社営業日トグルのみ表示し、平日なら会社休日トグルのみ表示する。 */
  isBaseHoliday: boolean;
  onSelect: (action: ContextMenuAction) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: { status: AttendanceStatus | "clear"; label: string }[] = [
  { status: "office", label: `${STATUS_EMOJI.office} 出社` },
  { status: "remote", label: `${STATUS_EMOJI.remote} 在宅` },
  { status: "paidleave", label: `${STATUS_EMOJI.paidleave} 有給` },
  { status: "clear", label: "⬜ 未設定にする" },
];

const VIEWPORT_MARGIN = 8;

export function ContextMenu({
  x,
  y,
  isCompanyHoliday,
  isCompanyWorkingDay,
  isHoliday,
  isBaseHoliday,
  onSelect,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // メニューの実際の描画サイズを測ってから、画面外にはみ出さない位置に補正する。
  // ResizeObserverでフォント読み込み等によるサイズ変化にも追従して再計算する。
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const adjust = () => {
      const rect = el.getBoundingClientRect();
      const left = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - rect.width - VIEWPORT_MARGIN));
      const top = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - rect.height - VIEWPORT_MARGIN));
      setPosition((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
    };

    adjust();
    const observer = new ResizeObserver(adjust);
    observer.observe(el);
    return () => observer.disconnect();
  }, [x, y]);

  useEffect(() => {
    window.addEventListener("click", onClose);
    return () => window.removeEventListener("click", onClose);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.left, top: position.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.status}
          type="button"
          disabled={isHoliday && option.status !== "clear"}
          onClick={() => onSelect(option.status)}
        >
          {option.label}
        </button>
      ))}
      <hr className="context-menu-separator" />
      {isBaseHoliday ? (
        <button type="button" onClick={() => onSelect("toggleCompanyWorkingDay")}>
          {isCompanyWorkingDay ? "会社営業日を解除" : "会社営業日にする"}
        </button>
      ) : (
        <button type="button" onClick={() => onSelect("toggleCompanyHoliday")}>
          {isCompanyHoliday ? "会社休日を解除" : "会社休日にする"}
        </button>
      )}
    </div>
  );
}
