import type { AttendanceRecord, AttendanceStats, AttendanceStatus, Period, UserSettings } from "@attendance/shared";
import { isBaseHoliday, isHoliday } from "@attendance/shared";
import { useCallback, useEffect, useState } from "react";
import { resetAttendance } from "./api/attendance";
import type { CurrentUser } from "./api/auth";
import { fetchCurrentUser, logout } from "./api/auth";
import { ApiError } from "./api/client";
import {
  addCompanyHoliday,
  addCompanyWorkingDay,
  getCompanyHolidays,
  getCompanyWorkingDays,
  removeCompanyHoliday,
  removeCompanyWorkingDay,
} from "./api/companyDays";
import { fetchHolidaysFromCabinetOffice, getHolidays } from "./api/holidays";
import { deleteAttendance, getPeriod, getRecords, getStats, setAttendance } from "./api/records";
import { applySchedule } from "./api/schedule";
import { getSettings, updateSettings } from "./api/settings";
import { CalendarPanel } from "./components/CalendarPanel";
import { ContextMenu } from "./components/ContextMenu";
import { Header } from "./components/Header";
import { AlertDialog } from "./components/modals/AlertDialog";
import { ExportModal } from "./components/modals/ExportModal";
import { ScheduleModal } from "./components/modals/ScheduleModal";
import { SettingsModal } from "./components/modals/SettingsModal";
import { StatsPanel } from "./components/StatsPanel";
import { getNextClickStatus } from "./utils/calendarUtils";

type ModalName = "settings" | "schedule" | "export" | null;

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);

  const [offsetMonths, setOffsetMonths] = useState(0);
  const [period, setPeriod] = useState<Period | null>(null);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [companyHolidays, setCompanyHolidays] = useState<string[]>([]);
  const [companyWorkingDays, setCompanyWorkingDays] = useState<string[]>([]);

  const [contextMenu, setContextMenu] = useState<{ date: string; x: number; y: number } | null>(null);
  const [openModal, setOpenModal] = useState<ModalName>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const loadPeriodData = useCallback(async () => {
    try {
      const [periodData, recordList, statsData] = await Promise.all([
        getPeriod(offsetMonths),
        getRecords(),
        getStats(offsetMonths),
      ]);
      setPeriod(periodData);
      setRecords(new Map(recordList.map((r) => [r.date, r])));
      setStats(statsData);
    } catch (err) {
      setAlertMessage(err instanceof ApiError ? err.message : "データの読み込みに失敗しました");
    }
  }, [offsetMonths]);

  const loadSettingsAndDays = useCallback(async () => {
    try {
      const [settingsData, holidayList, companyHolidayList, companyWorkingDayList] = await Promise.all([
        getSettings(),
        getHolidays(),
        getCompanyHolidays(),
        getCompanyWorkingDays(),
      ]);
      setSettings(settingsData);
      setHolidays(new Set(holidayList));
      setCompanyHolidays(companyHolidayList);
      setCompanyWorkingDays(companyWorkingDayList);
    } catch (err) {
      setAlertMessage(err instanceof ApiError ? err.message : "設定の読み込みに失敗しました");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSettingsAndDays();
  }, [user, loadSettingsAndDays]);

  useEffect(() => {
    if (!user) return;
    loadPeriodData();
  }, [user, loadPeriodData]);

  // 認証はCloudflare Accessに一本化されているため、Accessのログアウトへ遷移する
  const handleLogout = () => {
    logout();
  };

  const applyStatus = async (date: string, status: AttendanceStatus | "clear") => {
    try {
      if (status === "clear") {
        await deleteAttendance(date);
      } else {
        await setAttendance(date, status);
      }
      await loadPeriodData();
    } catch (err) {
      setAlertMessage(err instanceof ApiError ? err.message : "更新に失敗しました");
    }
  };

  const toggleCompanyHoliday = async (date: string) => {
    try {
      if (companyHolidays.includes(date)) {
        await removeCompanyHoliday(date);
      } else {
        await addCompanyHoliday(date);
      }
      setCompanyHolidays(await getCompanyHolidays());
      await loadPeriodData();
    } catch (err) {
      setAlertMessage(err instanceof ApiError ? err.message : "更新に失敗しました");
    }
  };

  const toggleCompanyWorkingDay = async (date: string) => {
    try {
      if (companyWorkingDays.includes(date)) {
        await removeCompanyWorkingDay(date);
      } else {
        await addCompanyWorkingDay(date);
      }
      setCompanyWorkingDays(await getCompanyWorkingDays());
      await loadPeriodData();
    } catch (err) {
      setAlertMessage(err instanceof ApiError ? err.message : "更新に失敗しました");
    }
  };

  const companyHolidaySet = new Set(companyHolidays);
  const companyWorkingDaySet = new Set(companyWorkingDays);

  const handleDayClick = (date: string) => {
    if (!period || date < period.startDate || date > period.endDate) return;
    // 休日(土日祝・会社休日)は勤怠を設定できない。先に会社営業日にする必要がある。
    if (isHoliday(date, holidays, companyHolidaySet, companyWorkingDaySet)) return;
    applyStatus(date, getNextClickStatus(records.get(date)?.status));
  };

  if (authLoading) {
    return <p style={{ padding: 24 }}>読み込み中...</p>;
  }

  if (!user) {
    // 通常はここに来ない(認証切れはapiFetchがAccess再認証へ遷移させる)。
    // 自動復帰が抑止されている間などのフォールバック画面。
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>認証情報を取得できませんでした</h1>
          <p className="auth-error">
            Cloudflareの認証が切れている可能性があります。ページを再読み込みしてください。
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        onPrevMonth={() => setOffsetMonths((v) => v - 1)}
        onNextMonth={() => setOffsetMonths((v) => v + 1)}
        onToday={() => setOffsetMonths(0)}
        onOpenSchedule={() => setOpenModal("schedule")}
        onOpenExport={() => setOpenModal("export")}
        onOpenSettings={() => setOpenModal("settings")}
        isAdmin={user.isAdmin}
      />

      <main className="app-main">
        <StatsPanel stats={stats} />
        {period && (
          <CalendarPanel
            period={period}
            records={records}
            holidays={holidays}
            companyHolidays={companyHolidaySet}
            companyWorkingDays={companyWorkingDaySet}
            onDayClick={handleDayClick}
            onDayContextMenu={(date, x, y) => setContextMenu({ date, x, y })}
          />
        )}
      </main>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isCompanyHoliday={companyHolidays.includes(contextMenu.date)}
          isCompanyWorkingDay={companyWorkingDays.includes(contextMenu.date)}
          isHoliday={isHoliday(contextMenu.date, holidays, companyHolidaySet, companyWorkingDaySet)}
          isBaseHoliday={isBaseHoliday(contextMenu.date, holidays)}
          onSelect={(action) => {
            if (action === "toggleCompanyHoliday") {
              toggleCompanyHoliday(contextMenu.date);
            } else if (action === "toggleCompanyWorkingDay") {
              toggleCompanyWorkingDay(contextMenu.date);
            } else {
              applyStatus(contextMenu.date, action);
            }
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {openModal === "settings" && settings && (
        <SettingsModal
          user={user}
          settings={settings}
          holidays={holidays}
          companyHolidays={companyHolidays}
          companyWorkingDays={companyWorkingDays}
          onClose={() => setOpenModal(null)}
          onLogout={handleLogout}
          onSaveSettings={async (next) => {
            const saved = await updateSettings(next);
            setSettings(saved);
            await loadPeriodData();
          }}
          onAddCompanyHoliday={async (date) => {
            await addCompanyHoliday(date);
            setCompanyHolidays(await getCompanyHolidays());
            await loadPeriodData();
          }}
          onRemoveCompanyHoliday={async (date) => {
            await removeCompanyHoliday(date);
            setCompanyHolidays(await getCompanyHolidays());
            await loadPeriodData();
          }}
          onAddCompanyWorkingDay={async (date) => {
            await addCompanyWorkingDay(date);
            setCompanyWorkingDays(await getCompanyWorkingDays());
            await loadPeriodData();
          }}
          onRemoveCompanyWorkingDay={async (date) => {
            await removeCompanyWorkingDay(date);
            setCompanyWorkingDays(await getCompanyWorkingDays());
            await loadPeriodData();
          }}
          onFetchHolidays={async () => {
            const result = await fetchHolidaysFromCabinetOffice();
            setHolidays(new Set(await getHolidays()));
            setAlertMessage(`${result.count}件の祝日データを取得しました`);
          }}
          onResetPeriod={async () => {
            await resetAttendance({ scope: "period", offsetMonths });
            setCompanyHolidays(await getCompanyHolidays());
            setCompanyWorkingDays(await getCompanyWorkingDays());
            await loadPeriodData();
          }}
          onResetAll={async () => {
            await resetAttendance({ scope: "all" });
            setCompanyHolidays(await getCompanyHolidays());
            setCompanyWorkingDays(await getCompanyWorkingDays());
            await loadPeriodData();
          }}
        />
      )}

      {openModal === "schedule" && (
        <ScheduleModal
          onClose={() => setOpenModal(null)}
          onApply={async (remoteWeekdays, force) => {
            const result = await applySchedule({ remoteWeekdays, force, offsetMonths });
            if (result.applied) {
              await loadPeriodData();
            }
            return result;
          }}
        />
      )}

      {openModal === "export" && period && (
        <ExportModal defaultStart={period.startDate} defaultEnd={period.endDate} onClose={() => setOpenModal(null)} />
      )}

      {alertMessage && <AlertDialog message={alertMessage} onClose={() => setAlertMessage(null)} />}
    </div>
  );
}
