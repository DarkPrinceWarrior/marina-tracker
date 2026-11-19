import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import api from "./api.js";
import BottomNav from "./components/BottomNav.jsx";
import { PwaInstallGuide } from "./components/UiPrimitives.jsx";
import YearReviewSheet from "./components/YearReviewSheet.jsx";
import TodaySection from "./sections/TodaySection.jsx";
import HabitsSection from "./sections/HabitsSection.jsx";
import NutritionSection from "./sections/NutritionSection.jsx";
import HomeSection from "./sections/HomeSection.jsx";
import GoalsSection from "./sections/GoalsSection.jsx";
import { todayISO } from "./utils/date.js";

const VALID_TABS = new Set(["today", "habits", "nutrition", "home", "goals"]);

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  const content = (
    <div className="mt-toast-stack" aria-live="polite" role="status">
      {toasts.map((toast) => {
        const Icon =
          toast.tone === "error"
            ? AlertCircle
            : toast.tone === "info"
              ? Info
              : CheckCircle2;
        return (
          <div
            key={toast.id}
            className={`mt-toast mt-toast--${toast.tone || "success"}`}
          >
            <Icon size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{toast.message}</span>
            <button
              type="button"
              className="mt-icon-btn"
              aria-label="Скрыть уведомление"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : content;
}

export default function App() {
  const [todayDate, setTodayDate] = useState(() => todayISO());
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [activeTab, setActiveTab] = useState("today");
  const [subTabs, setSubTabs] = useState({});
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [yearReviewOpen, setYearReviewOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [badges, setBadges] = useState({});

  const toastSeqRef = useRef(0);
  const toastTimersRef = useRef(new Map());

  // Keep todayDate fresh if app remains open across midnight
  useEffect(() => {
    const syncToday = () => {
      const current = todayISO();
      setTodayDate((prev) => {
        if (prev !== current) {
          setSelectedDate((sel) => (sel === prev ? current : sel));
          return current;
        }
        return prev;
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncToday();
    };
    const interval = window.setInterval(syncToday, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const dismissToast = useCallback((id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((message, tone = "success") => {
    if (!message) return;
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current.clear();
    const id = ++toastSeqRef.current;
    setToasts([{ id, message: String(message), tone }]);
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, tone === "error" ? 4200 : 2600);
    toastTimersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
    };
  }, []);

  const refreshBadges = useCallback(async () => {
    try {
      const data = await api.getToday(selectedDate);
      const householdRemaining =
        data?.summary?.shopping?.household_remaining ??
        data?.summary?.chores?.shopping_remaining ??
        0;
      const goalsAttention = data?.summary?.goals?.needs_attention_count ?? 0;
      setBadges({
        home: householdRemaining > 0 ? householdRemaining : 0,
        goals: goalsAttention > 0 ? goalsAttention : 0,
      });
    } catch {
      // Badge refresh is best-effort; active section surfaces real errors
    }
  }, [selectedDate]);

  useEffect(() => {
    refreshBadges();
  }, [refreshBadges]);

  const handleSelectTab = useCallback((tab) => {
    if (!VALID_TABS.has(tab)) return;
    setActiveTab(tab);
    window.scrollTo(0, 0);
  }, []);

  const handleNavigate = useCallback((tab, subTabOrOpts) => {
    if (!VALID_TABS.has(tab)) return;
    const subTab =
      typeof subTabOrOpts === "string"
        ? subTabOrOpts
        : subTabOrOpts?.subTab || null;
    if (subTab) {
      setSubTabs((prev) => ({ ...prev, [tab]: subTab }));
    }
    if (subTabOrOpts && typeof subTabOrOpts === "object" && subTabOrOpts.date) {
      setSelectedDate(subTabOrOpts.date);
    }
    setActiveTab(tab);
    window.scrollTo(0, 0);
  }, []);

  const commonProps = {
    selectedDate,
    todayDate,
    onSelectDate: setSelectedDate,
    onNavigate: handleNavigate,
    notify,
    onOpenInstallGuide: () => setInstallGuideOpen(true),
    onOpenYearReview: () => setYearReviewOpen(true),
    onDataChanged: refreshBadges,
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        {activeTab === "today" && (
          <TodaySection {...commonProps} initialSubTab={subTabs.today || null} />
        )}
        {activeTab === "habits" && (
          <HabitsSection
            {...commonProps}
            initialSubTab={subTabs.habits || null}
          />
        )}
        {activeTab === "nutrition" && (
          <NutritionSection
            {...commonProps}
            initialSubTab={subTabs.nutrition || null}
          />
        )}
        {activeTab === "home" && (
          <HomeSection {...commonProps} initialSubTab={subTabs.home || null} />
        )}
        {activeTab === "goals" && (
          <GoalsSection {...commonProps} initialSubTab={subTabs.goals || null} />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        badges={badges}
      />

      <PwaInstallGuide
        open={installGuideOpen}
        onClose={() => setInstallGuideOpen(false)}
      />

      <YearReviewSheet
        open={yearReviewOpen}
        onClose={() => setYearReviewOpen(false)}
        selectedDate={selectedDate}
        onNavigate={handleNavigate}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
