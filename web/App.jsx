import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import api from "./api.js";
import BottomNav from "./components/BottomNav.jsx";
import { PwaInstallGuide } from "./components/UiPrimitives.jsx";
import YearReviewSheet from "./components/YearReviewSheet.jsx";
import NotificationsSheet from "./components/NotificationsSheet.jsx";
import TodaySection from "./sections/TodaySection.jsx";
import HabitsSection from "./sections/HabitsSection.jsx";
import NutritionSection from "./sections/NutritionSection.jsx";
import HomeSection from "./sections/HomeSection.jsx";
import GoalsSection from "./sections/GoalsSection.jsx";
import { todayISO } from "./utils/date.js";

const VALID_TABS = new Set(["today", "habits", "nutrition", "home", "goals"]);

function readInitialRouteFromUrl() {
  if (typeof window === "undefined") {
    return { tab: "today", subTabs: {} };
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const rawTab = params.get("tab") || "";
    const rawSub = params.get("sub") || "";
    const tab = VALID_TABS.has(rawTab) ? rawTab : "today";
    const subTabs = rawSub ? { [tab]: rawSub } : {};
    return { tab, subTabs };
  } catch {
    return { tab: "today", subTabs: {} };
  }
}

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
  const initialRoute = useRef(null);
  if (!initialRoute.current) {
    initialRoute.current = readInitialRouteFromUrl();
  }

  const [todayDate, setTodayDate] = useState(() => todayISO());
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [activeTab, setActiveTab] = useState(() => initialRoute.current.tab);
  const [subTabs, setSubTabs] = useState(() => initialRoute.current.subTabs);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [yearReviewOpen, setYearReviewOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [badges, setBadges] = useState({});

  const toastSeqRef = useRef(0);
  const toastTimersRef = useRef(new Map());

  // Clean up one-shot query params after deep-link boot
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("tab") || params.has("sub")) {
      window.history.replaceState({}, "", window.location.pathname || "/");
    }
  }, []);

  // Load initial Web Push status for Bell badge indicator
  useEffect(() => {
    let active = true;
    api
      .getPushConfig()
      .then((cfg) => {
        if (!active || !cfg) return;
        const enabled = Boolean(
          cfg.configured &&
            (cfg.subscriptions_count || 0) > 0 &&
            cfg.settings?.enabled !== false
        );
        setPushEnabled(enabled);
      })
      .catch(() => {
        // Best-effort status fetch
      });
    return () => {
      active = false;
    };
  }, []);

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

  // Listen for Service Worker notification click deep-links
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return undefined;
    }
    const handleSwMessage = (event) => {
      const msg = event?.data;
      if (msg && msg.type === "NAVIGATE" && VALID_TABS.has(msg.tab)) {
        handleNavigate(msg.tab, msg.sub || null);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, [handleNavigate]);

  const handlePushStatusChange = useCallback((active) => {
    setPushEnabled(Boolean(active));
  }, []);

  const handleOpenNotifications = useCallback(() => {
    setNotificationsOpen(true);
  }, []);

  const handleCloseNotifications = useCallback(() => {
    setNotificationsOpen(false);
  }, []);

  const handleOpenInstallGuide = useCallback(() => {
    setInstallGuideOpen(true);
  }, []);

  const handleCloseInstallGuide = useCallback(() => {
    setInstallGuideOpen(false);
  }, []);

  const handleOpenYearReview = useCallback(() => {
    setYearReviewOpen(true);
  }, []);

  const handleCloseYearReview = useCallback(() => {
    setYearReviewOpen(false);
  }, []);

  const commonProps = {
    selectedDate,
    todayDate,
    onSelectDate: setSelectedDate,
    onNavigate: handleNavigate,
    notify,
    pushEnabled,
    onOpenNotifications: handleOpenNotifications,
    onOpenInstallGuide: handleOpenInstallGuide,
    onOpenYearReview: handleOpenYearReview,
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
        onClose={handleCloseInstallGuide}
      />

      <YearReviewSheet
        open={yearReviewOpen}
        onClose={handleCloseYearReview}
        selectedDate={selectedDate}
        onNavigate={handleNavigate}
      />

      <NotificationsSheet
        open={notificationsOpen}
        onClose={handleCloseNotifications}
        notify={notify}
        onOpenInstallGuide={handleOpenInstallGuide}
        onStatusChange={handlePushStatusChange}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
