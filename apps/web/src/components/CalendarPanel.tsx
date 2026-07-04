import type { AttendanceRecord, Period } from "@attendance/shared";
import { formatDate, parseDate } from "@attendance/shared";
import { useEffect, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { getTileClassName, STATUS_EMOJI } from "../utils/calendarUtils";

const TODAY_PULSE_INTERVAL_MS = 575;

interface Props {
  period: Period;
  records: Map<string, AttendanceRecord>;
  holidays: ReadonlySet<string>;
  companyHolidays: ReadonlySet<string>;
  companyWorkingDays: ReadonlySet<string>;
  onDayClick: (date: string) => void;
  onDayContextMenu: (date: string, x: number, y: number) => void;
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
              return (
                <>
                  {status && <span className="tile-status-emoji">{STATUS_EMOJI[status]}</span>}
                  <div
                    className="tile-interaction-layer"
                    style={{
                      position: "absolute",
                      inset: 0,
                      cursor: isWithinPeriod ? "pointer" : "default",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isWithinPeriod) onDayClick(dateStr);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isWithinPeriod) onDayContextMenu(dateStr, e.clientX, e.clientY);
                    }}
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
