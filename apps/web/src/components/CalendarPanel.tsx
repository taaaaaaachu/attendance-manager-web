import type { AttendanceRecord, Period } from "@attendance/shared";
import { formatDate, parseDate } from "@attendance/shared";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { getTileClassName } from "../utils/calendarUtils";

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

  return (
    <div className="calendar-panel">
      {months.map((month) => (
        <Calendar
          key={month.toISOString()}
          activeStartDate={month}
          value={null}
          showNavigation={false}
          locale="ja-JP"
          tileClassName={({ date }) =>
            getTileClassName({ date, period, records, holidays, companyHolidays, companyWorkingDays })
          }
          tileContent={({ date }) => {
            const dateStr = formatDate(date);
            return (
              <div
                className="tile-interaction-layer"
                style={{ position: "absolute", inset: 0, cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDayClick(dateStr);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDayContextMenu(dateStr, e.clientX, e.clientY);
                }}
              />
            );
          }}
        />
      ))}
    </div>
  );
}
