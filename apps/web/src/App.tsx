import type { AttendanceRecord, AttendanceStats, AttendanceStatus, Period, UserSettings } from "@attendance/shared";
import { useCallback, useEffect, useState } from "react";
import { resetAttendance } from "./api/attendance";
import type { CurrentUser } from "./api/auth";
import { fetchCurrentUser, login, logout, register } from "./api/auth";
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
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";

type AuthView = "login" | "register";
type ModalName = "settings" | "schedule" | "export" | null;

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authView, setAuthView] = useState<AuthView>("login");

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

  const handleLogin = async (userId: string, password: string) => {
    await login(userId, password);
    setUser(await fetchCurrentUser());
  };

  const handleRegister = async (userId: string, password: string) => {
    await register(userId, password);
    setUser(await fetchCurrentUser());
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setOpenModal(null);
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

  const handleDayClick = (date: string) => {
    if (!period || date < period.startDate || date > period.endDate) return;
    const current = records.get(date)?.status;
    // 出社 → 在宅 → 未設定 のサイクル(有給は右クリックメニューから設定する)
    if (current === "office") {
      applyStatus(date, "remote");
    } else if (current === "remote") {
      applyStatus(date, "clear");
    } else {
      applyStatus(date, "office");
    }
  };

  const companyHolidaySet = new Set(companyHolidays);
  const companyWorkingDaySet = new Set(companyWorkingDays);

  if (authLoading) {
    return <p style={{ padding: 24 }}>読み込み中...</p>;
  }

  if (!user) {
    return authView === "login" ? (
      <LoginPage onLogin={handleLogin} onNavigateToRegister={() => setAuthView("register")} />
    ) : (
      <RegisterPage onRegister={handleRegister} onNavigateToLogin={() => setAuthView("login")} />
    );
  }

  return (
    <div>
      <Header
        period={period}
        onPrevMonth={() => setOffsetMonths((v) => v - 1)}
        onNextMonth={() => setOffsetMonths((v) => v + 1)}
        onOpenSchedule={() => setOpenModal("schedule")}
        onOpenExport={() => setOpenModal("export")}
        onOpenSettings={() => setOpenModal("settings")}
      />

      <main className="app-main">
        <StatsPanel stats={stats} targetOfficeRate={settings?.targetOfficeRate ?? 50} />
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
          onSelect={(status) => {
            applyStatus(contextMenu.date, status);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {openModal === "settings" && settings && (
        <SettingsModal
          user={user}
          settings={settings}
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
