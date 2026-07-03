import { useState } from "react";

interface Props {
  onClose: () => void;
  onApply: (remoteWeekdays: number[], force: boolean) => Promise<{ applied: boolean; warning: boolean }>;
}

const WEEKDAYS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
];

export function ScheduleModal({ onClose, onApply }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState(false);

  const toggle = (value: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleApply = async (force: boolean) => {
    setSubmitting(true);
    try {
      const result = await onApply(Array.from(selected), force);
      if (result.warning && !force) {
        setWarning(true);
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>定期在宅日の設定</h2>
        <div className="field">
          <label>在宅にする曜日を選択してください</label>
          <div className="weekday-picker">
            {WEEKDAYS.map((w) => (
              <label key={w.value}>
                <input type="checkbox" checked={selected.has(w.value)} onChange={() => toggle(w.value)} />
                {w.label}
              </label>
            ))}
          </div>
        </div>

        {warning && (
          <p className="auth-error">
            この設定を適用すると目標出社率を下回ります。それでも適用しますか?
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          {warning ? (
            <button type="button" className="danger" disabled={submitting} onClick={() => handleApply(true)}>
              強制適用
            </button>
          ) : (
            <button type="button" className="primary" disabled={submitting} onClick={() => handleApply(false)}>
              適用
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
