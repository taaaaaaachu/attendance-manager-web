import { useState } from "react";
import { exportRecords } from "../../api/exportData";

interface Props {
  defaultStart: string;
  defaultEnd: string;
  onClose: () => void;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportModal({ defaultStart, defaultEnd, onClose }: Props) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportRecords({ start, end });
      downloadJson(`attendance_${start}_${end}.json`, data);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>JSONエクスポート</h2>
        <div className="field">
          <label>開始日</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>終了日</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="primary" disabled={exporting} onClick={handleExport}>
            {exporting ? "エクスポート中..." : "エクスポート"}
          </button>
        </div>
      </div>
    </div>
  );
}
