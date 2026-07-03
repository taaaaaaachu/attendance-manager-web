import type { AttendanceStatus } from "@attendance/shared";
import { useEffect } from "react";

interface Props {
  x: number;
  y: number;
  onSelect: (status: AttendanceStatus | "clear") => void;
  onClose: () => void;
}

const OPTIONS: { status: AttendanceStatus | "clear"; label: string }[] = [
  { status: "office", label: "出社" },
  { status: "remote", label: "在宅" },
  { status: "paidleave", label: "有給" },
  { status: "clear", label: "未設定にする" },
];

export function ContextMenu({ x, y, onSelect, onClose }: Props) {
  useEffect(() => {
    window.addEventListener("click", onClose);
    return () => window.removeEventListener("click", onClose);
  }, [onClose]);

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {OPTIONS.map((option) => (
        <button key={option.status} type="button" onClick={() => onSelect(option.status)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
