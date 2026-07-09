import type { AttendanceRecord, Period } from "@attendance/shared";
import { formatDate, isHoliday, parseDate } from "@attendance/shared";
import { useEffect, useRef, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { getTileClassName, STATUS_EMOJI } from "../utils/calendarUtils";

const TODAY_PULSE_INTERVAL_MS = 575;

// iOS Safariは長押しでcontextmenuイベントを発火しないため、タッチの長押しを自前検出する
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

interface TileInteractionLayerProps {
  clickable: boolean;
  contextMenuEnabled: boolean;
  onDayClick: () => void;
  onDayContextMenu: (x: number, y: number) => void;
}

function TileInteractionLayer({
  clickable,
  contextMenuEnabled,
  onDayClick,
  onDayContextMenu,
}: TileInteractionLayerProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    return () => {
      if (longPressTimer.current !== null) clearTimeout(longPressTimer.current);
    };
  }, []);

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      className="tile-interaction-layer"
      style={{
        position: "absolute",
        inset: 0,
        cursor: clickable ? "pointer" : "default",
      }}
      onPointerDown={(e) => {
        longPressFired.current = false;
        if (e.pointerType !== "touch" || !contextMenuEnabled) return;
        cancelLongPress();
        pressStart.current = { x: e.clientX, y: e.clientY };
        const { clientX, clientY } = e;
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          longPressFired.current = true;
          onDayContextMenu(clientX, clientY);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        if (longPressTimer.current === null || !pressStart.current) return;
        const dx = e.clientX - pressStart.current.x;
        const dy = e.clientY - pressStart.current.y;
        if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cancelLongPress();
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onTouchEnd={(e) => {
        // 長押しでメニューを開いた後、指を離した際のclick発火(メニュー誤操作・即時クローズ)を抑止
        if (longPressFired.current) e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (longPressFired.current) return;
        if (clickable) onDayClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Android等はネイティブのcontextmenuも発火するため、自前の長押し検出と二重にならないようにする
        cancelLongPress();
        if (longPressFired.current) return;
        if (contextMenuEnabled) onDayContextMenu(e.clientX, e.clientY);
      }}
    />
  );
}

interface Props {
  period: Period;
  records: Map<string, AttendanceRecord>;
  holidays: ReadonlySet<string>;
  companyHolidays: ReadonlySet<string>;
  companyWorkingDays: ReadonlySet<string>;
  onDayClick: (date: string) => void;
  onDayContextMenu: (date: string, x: number, y: number) => void;
  /** trueの場合、クリック・右クリックによる編集操作を一切受け付けない(管理者のドリルダウン閲覧用) */
  readOnly?: boolean;
}

function monthStartDates(period: Period): Date[] {
  const start = parseDate(period.startDate);
  const end = parseDate(period.endDate);
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const second = new Date(end.getFullYear(), end.getMonth(), 1);
  if (first.getTime() === second.getTime()) {
    return [first];
  }
  return [first, second];
}

export function CalendarPanel({
  period,
  records,
  holidays,
  companyHolidays,
  companyWorkingDays,
  onDayClick,
  onDayContextMenu,
  readOnly = false,
}: Props) {
  const months = monthStartDates(period);
  const [pulseBright, setPulseBright] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setPulseBright((v) => !v), TODAY_PULSE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`calendar-panel${pulseBright ? " pulse-bright" : ""}`}>
      {months.map((month) => (
        <div key={month.toISOString()} className="calendar-month">
          <div className="calendar-month-label">
            {month.getFullYear()}年{month.getMonth() + 1}月
          </div>
          <Calendar
            activeStartDate={month}
            value={null}
            showNavigation={false}
            locale="ja-JP"
            calendarType="gregory"
            tileClassName={({ date }) =>
              getTileClassName({ date, period, records, holidays, companyHolidays, companyWorkingDays })
            }
            tileContent={({ date }) => {
              const dateStr = formatDate(date);
              const status = records.get(dateStr)?.status;
              const isWithinPeriod = dateStr >= period.startDate && dateStr <= period.endDate;
              // 休日はクリックでの勤怠トグル対象外(右クリックの会社営業日設定は可能)
              const holiday = isHoliday(dateStr, holidays, companyHolidays, companyWorkingDays);
              return (
                <>
                  {status && <span className="tile-status-emoji">{STATUS_EMOJI[status]}</span>}
                  <TileInteractionLayer
                    clickable={!readOnly && isWithinPeriod && !holiday}
                    contextMenuEnabled={!readOnly && isWithinPeriod}
                    onDayClick={() => onDayClick(dateStr)}
                    onDayContextMenu={(x, y) => onDayContextMenu(dateStr, x, y)}
                  />
                </>
              );
            }}
          />
        </div>
      ))}
    </div>
  );
}
