import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Send,
  Smartphone,
} from "lucide-react";
import Sheet from "./Sheet.jsx";
import {
  GroupHeader,
  GroupList,
  ListRow,
  SelectField,
} from "./UiPrimitives.jsx";
import api from "../api.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  timezone: "Europe/Moscow",
  morning_enabled: true,
  morning_time: "08:30",
  afternoon_enabled: true,
  afternoon_time: "13:30",
  evening_enabled: true,
  evening_time: "20:30",
  water_enabled: true,
  water_interval_hours: 3,
  events_enabled: true,
  events_lead_minutes: 60,
  cycle_enabled: true,
  cycle_days_before: 2,
  goals_enabled: true,
  goals_weekday: 6,
  goals_time: "11:00",
  quiet_start: "22:30",
  quiet_end: "07:30",
};

const WATER_INTERVAL_OPTIONS = [
  { value: "2", label: "Каждые 2 часа" },
  { value: "3", label: "Каждые 3 часа" },
  { value: "4", label: "Каждые 4 часа" },
];

const EVENT_LEAD_OPTIONS = [
  { value: "30", label: "За 30 минут" },
  { value: "60", label: "За 1 час" },
  { value: "120", label: "За 2 часа" },
];

const CYCLE_DAYS_OPTIONS = [
  { value: "1", label: "За 1 день" },
  { value: "2", label: "За 2 дня" },
  { value: "3", label: "За 3 дня" },
];

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Понедельник" },
  { value: "1", label: "Вторник" },
  { value: "2", label: "Среда" },
  { value: "3", label: "Четверг" },
  { value: "4", label: "Пятница" },
  { value: "5", label: "Суббота" },
  { value: "6", label: "Воскресенье" },
];

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function detectIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isClassicIos = /iPhone|iPad|iPod/i.test(ua);
  const isIpadOs =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  return isClassicIos || isIpadOs;
}

function detectStandaloneMode() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true,
  );
}

function detectDeviceLabel() {
  if (typeof navigator === "undefined") return "Устройство";
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1)) {
    return "iPad";
  }
  if (/Android/i.test(ua)) return "Смартфон";
  return "Компьютер";
}

function supportsBrowserPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function normalizeSettings(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    enabled: Boolean(raw.enabled ?? DEFAULT_SETTINGS.enabled),
    morning_enabled: Boolean(raw.morning_enabled ?? DEFAULT_SETTINGS.morning_enabled),
    afternoon_enabled: Boolean(raw.afternoon_enabled ?? DEFAULT_SETTINGS.afternoon_enabled),
    evening_enabled: Boolean(raw.evening_enabled ?? DEFAULT_SETTINGS.evening_enabled),
    water_enabled: Boolean(raw.water_enabled ?? DEFAULT_SETTINGS.water_enabled),
    events_enabled: Boolean(raw.events_enabled ?? DEFAULT_SETTINGS.events_enabled),
    cycle_enabled: Boolean(raw.cycle_enabled ?? DEFAULT_SETTINGS.cycle_enabled),
    goals_enabled: Boolean(raw.goals_enabled ?? DEFAULT_SETTINGS.goals_enabled),
    water_interval_hours: Number(raw.water_interval_hours ?? DEFAULT_SETTINGS.water_interval_hours),
    events_lead_minutes: Number(raw.events_lead_minutes ?? DEFAULT_SETTINGS.events_lead_minutes),
    cycle_days_before: Number(raw.cycle_days_before ?? DEFAULT_SETTINGS.cycle_days_before),
    goals_weekday: Number(raw.goals_weekday ?? DEFAULT_SETTINGS.goals_weekday),
  };
}

function SwitchToggle({ checked, onChange, ariaLabel, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`mt-switch${checked ? " is-checked" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
    />
  );
}

export default function NotificationsSheet({
  open = false,
  onClose,
  notify,
  onOpenInstallGuide,
  onStatusChange,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [subscriptionsCount, setSubscriptionsCount] = useState(0);
  const [localEndpoint, setLocalEndpoint] = useState("");
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS }));
  const [errorMsg, setErrorMsg] = useState("");

  const isIos = detectIosDevice();
  const isStandalone = detectStandaloneMode();
  const pushSupported = supportsBrowserPush();
  const permissionState =
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "default";

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const emitStatus = useCallback((nextSettings, nextCount, nextLocalEndpoint) => {
    const isActive =
      Boolean(nextSettings?.enabled) &&
      (Boolean(nextLocalEndpoint) || Number(nextCount) > 0);
    onStatusChangeRef.current?.(isActive);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const data = await api.getPushConfig();
      const nextSettings = normalizeSettings(data?.settings);
      const count = Number(data?.subscriptions_count) || 0;
      setConfigured(Boolean(data?.configured));
      setVapidPublicKey(data?.vapid_public_key || "");
      setSubscriptionsCount(count);
      setSettings(nextSettings);

      let endpoint = "";
      if (supportsBrowserPush()) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager?.getSubscription();
          if (sub?.endpoint) endpoint = sub.endpoint;
        } catch {
          // Ignore browser SW lookup errors in private/dev contexts
        }
      }
      setLocalEndpoint(endpoint);
      emitStatus(nextSettings, count, endpoint);
    } catch (err) {
      setErrorMsg(err?.message || "Не удалось загрузить настройки уведомлений");
    } finally {
      setLoading(false);
    }
  }, [emitStatus]);

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open, loadConfig]);

  const updateField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubscribe = async () => {
    if (subscribing) return;
    if (!pushSupported) {
      notify?.("Этот браузер не поддерживает отправку уведомлений", "error");
      return;
    }
    if (!configured || !vapidPublicKey) {
      notify?.("Сервер уведомлений пока не настроен", "error");
      return;
    }

    setSubscribing(true);
    setErrorMsg("");
    try {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        notify?.("Разрешение на уведомления не выдано", "error");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const json = subscription.toJSON ? subscription.toJSON() : {};
      const p256dh =
        json?.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey?.("p256dh"));
      const auth =
        json?.keys?.auth || arrayBufferToBase64Url(subscription.getKey?.("auth"));

      const res = await api.subscribePush({
        endpoint: subscription.endpoint,
        keys: { p256dh, auth },
        device_label: detectDeviceLabel(),
        user_agent: navigator.userAgent || "",
      });

      const nextCount = Number(res?.subscriptions_count ?? subscriptionsCount + 1);
      setLocalEndpoint(subscription.endpoint);
      setSubscriptionsCount(nextCount);
      emitStatus(settings, nextCount, subscription.endpoint);
      notify?.("Уведомления на этом устройстве включены", "success");
    } catch (err) {
      const msg = err?.message || "Не удалось подключить уведомления";
      setErrorMsg(msg);
      notify?.(msg, "error");
    } finally {
      setSubscribing(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (subscribing) return;
    setSubscribing(true);
    setErrorMsg("");
    try {
      let endpoint = localEndpoint;
      if (supportsBrowserPush()) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        if (sub) {
          endpoint = sub.endpoint || endpoint;
          await sub.unsubscribe();
        }
      }

      if (endpoint) {
        const res = await api.unsubscribePush({ endpoint });
        const nextCount = Number(res?.subscriptions_count ?? Math.max(0, subscriptionsCount - 1));
        setSubscriptionsCount(nextCount);
        setLocalEndpoint("");
        emitStatus(settings, nextCount, "");
      } else {
        setLocalEndpoint("");
      }
      notify?.("Уведомления на этом устройстве отключены", "info");
    } catch (err) {
      const msg = err?.message || "Не удалось отключить уведомления";
      setErrorMsg(msg);
      notify?.(msg, "error");
    } finally {
      setSubscribing(false);
    }
  };

  const handleSendTest = async () => {
    if (sendingTest) return;
    setSendingTest(true);
    setErrorMsg("");
    try {
      await api.sendTestPush();
      notify?.("Тестовое уведомление отправлено", "success");
    } catch (err) {
      const msg = err?.message || "Не удалось отправить тестовое уведомление";
      setErrorMsg(msg);
      notify?.(msg, "error");
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault?.();
    if (saving) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const payload = {
        enabled: Boolean(settings.enabled),
        timezone: settings.timezone || "Europe/Moscow",
        morning_enabled: Boolean(settings.morning_enabled),
        morning_time: settings.morning_time || "08:30",
        afternoon_enabled: Boolean(settings.afternoon_enabled),
        afternoon_time: settings.afternoon_time || "13:30",
        evening_enabled: Boolean(settings.evening_enabled),
        evening_time: settings.evening_time || "20:30",
        water_enabled: Boolean(settings.water_enabled),
        water_interval_hours: Number(settings.water_interval_hours) || 3,
        events_enabled: Boolean(settings.events_enabled),
        events_lead_minutes: Number(settings.events_lead_minutes) || 60,
        cycle_enabled: Boolean(settings.cycle_enabled),
        cycle_days_before: Number(settings.cycle_days_before) || 2,
        goals_enabled: Boolean(settings.goals_enabled),
        goals_weekday: Number(settings.goals_weekday ?? 6),
        goals_time: settings.goals_time || "11:00",
        quiet_start: settings.quiet_start || "22:30",
        quiet_end: settings.quiet_end || "07:30",
      };
      const saved = await api.updatePushSettings(payload);
      const nextSettings = normalizeSettings(saved || payload);
      setSettings(nextSettings);
      emitStatus(nextSettings, subscriptionsCount, localEndpoint);
      notify?.("Расписание уведомлений сохранено", "success");
      onClose?.();
    } catch (err) {
      const msg = err?.message || "Не удалось сохранить расписание";
      setErrorMsg(msg);
      notify?.(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const isDeviceSubscribed = Boolean(localEndpoint);
  const canSendTest = configured && subscriptionsCount > 0 && !sendingTest;
  const scheduleDisabled = !settings.enabled;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Уведомления"
      subtitle="Спокойные напоминания в Центр уведомлений"
      footer={
        <button
          type="button"
          className="mt-btn mt-btn--primary mt-btn--wide"
          disabled={saving || loading}
          onClick={handleSaveSettings}
        >
          {saving ? "Сохраняем…" : "Сохранить расписание"}
        </button>
      }
    >
      <form className="mt-stack" onSubmit={handleSaveSettings}>
        {/* Smart iOS non-standalone guidance */}
        {isIos && !isStandalone ? (
          <div className="push-status-card is-warning">
            <div className="mt-row" style={{ gap: "10px", alignItems: "flex-start" }}>
              <Smartphone
                size={18}
                style={{ color: "var(--cobalt)", flexShrink: 0, marginTop: "2px" }}
                aria-hidden="true"
              />
              <div className="mt-stack mt-stack--xs" style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: "14px", color: "var(--ink)" }}>
                  Добавьте «Ритм» на экран «Домой»
                </strong>
                <p className="mt-card-sub" style={{ margin: 0 }}>
                  Чтобы уведомления приходили в Центр уведомлений iPhone, добавьте
                  «Ритм» на экран «Домой» в Safari и откройте с иконки.
                </p>
              </div>
            </div>
            {onOpenInstallGuide ? (
              <button
                type="button"
                className="mt-btn mt-btn--soft mt-btn--sm mt-btn--wide"
                onClick={() => {
                  onClose?.();
                  onOpenInstallGuide();
                }}
              >
                Как добавить
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Device connection & test push card */}
        <div
          className={`push-status-card${
            isDeviceSubscribed || subscriptionsCount > 0 ? " is-enabled" : ""
          }`}
        >
          <div className="mt-row mt-row--between" style={{ gap: "10px" }}>
            <div className="mt-row" style={{ gap: "9px", minWidth: 0 }}>
              {isDeviceSubscribed || subscriptionsCount > 0 ? (
                <CheckCircle2
                  size={18}
                  style={{ color: "var(--cobalt)", flexShrink: 0 }}
                  aria-hidden="true"
                />
              ) : (
                <Bell
                  size={18}
                  style={{ color: "var(--muted)", flexShrink: 0 }}
                  aria-hidden="true"
                />
              )}
              <div className="mt-stack mt-stack--xs" style={{ gap: "1px", minWidth: 0 }}>
                <strong style={{ fontSize: "14.5px", color: "var(--ink)" }}>
                  {isDeviceSubscribed
                    ? "Это устройство подключено"
                    : subscriptionsCount > 0
                      ? "Уведомления подключены"
                      : "Уведомления не подключены"}
                </strong>
                <span className="mt-card-sub tabular" style={{ margin: 0 }}>
                  {loading
                    ? "Проверяем состояние…"
                    : !configured
                      ? "Серверные ключи ещё не настроены — расписание уже сохраняется"
                      : permissionState === "denied"
                        ? "Доступ запрещён в настройках браузера или устройства"
                        : `Подключено устройств: ${subscriptionsCount}`}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-stack mt-stack--xs">
            {isDeviceSubscribed ? (
              <button
                type="button"
                className="mt-btn mt-btn--secondary mt-btn--sm mt-btn--wide"
                disabled={subscribing || loading}
                onClick={handleUnsubscribe}
              >
                <BellOff size={15} />
                <span>
                  {subscribing ? "Отключаем…" : "Отключить на этом устройстве"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="mt-btn mt-btn--soft mt-btn--sm mt-btn--wide"
                disabled={subscribing || loading || !configured || !pushSupported}
                onClick={handleSubscribe}
              >
                <Bell size={15} />
                <span>
                  {subscribing ? "Подключаем…" : "Включить на этом устройстве"}
                </span>
              </button>
            )}

            <button
              type="button"
              className="mt-btn mt-btn--secondary mt-btn--sm mt-btn--wide"
              disabled={!canSendTest}
              onClick={handleSendTest}
            >
              <Send size={15} />
              <span>
                {sendingTest
                  ? "Отправляем…"
                  : "Отправить тестовое уведомление"}
              </span>
            </button>
          </div>
        </div>

        {errorMsg ? <div className="mt-form-error">{errorMsg}</div> : null}

        {/* Master switch */}
        <div className="mt-group-block">
          <GroupHeader title="Общее" />
          <GroupList>
            <ListRow
              title="Напоминания активны"
              meta="Отправлять по вашему расписанию"
              trailing={
                <SwitchToggle
                  checked={settings.enabled}
                  onChange={(val) => updateField("enabled", val)}
                  ariaLabel="Напоминания активны"
                />
              }
            />
          </GroupList>
        </div>

        {/* Habits & Vitamins */}
        <div className="mt-group-block" style={{ opacity: scheduleDisabled ? 0.55 : 1 }}>
          <GroupHeader title="Привычки и витамины" />
          <GroupList>
            <ListRow
              title="Утро"
              meta="Утренние ритуалы"
              trailing={
                <div className="mt-row" style={{ gap: "8px" }}>
                  <input
                    type="time"
                    className="mt-time-compact tabular"
                    aria-label="Время утреннего напоминания"
                    disabled={scheduleDisabled || !settings.morning_enabled}
                    value={settings.morning_time}
                    onChange={(e) => updateField("morning_time", e.target.value)}
                  />
                  <SwitchToggle
                    checked={settings.morning_enabled}
                    disabled={scheduleDisabled}
                    onChange={(val) => updateField("morning_enabled", val)}
                    ariaLabel="Утренние напоминания"
                  />
                </div>
              }
            />
            <ListRow
              title="Обед"
              meta="Дневные ритуалы"
              trailing={
                <div className="mt-row" style={{ gap: "8px" }}>
                  <input
                    type="time"
                    className="mt-time-compact tabular"
                    aria-label="Время дневного напоминания"
                    disabled={scheduleDisabled || !settings.afternoon_enabled}
                    value={settings.afternoon_time}
                    onChange={(e) => updateField("afternoon_time", e.target.value)}
                  />
                  <SwitchToggle
                    checked={settings.afternoon_enabled}
                    disabled={scheduleDisabled}
                    onChange={(val) => updateField("afternoon_enabled", val)}
                    ariaLabel="Дневные напоминания"
                  />
                </div>
              }
            />
            <ListRow
              title="Вечер"
              meta="Ритуалы и итог"
              trailing={
                <div className="mt-row" style={{ gap: "8px" }}>
                  <input
                    type="time"
                    className="mt-time-compact tabular"
                    aria-label="Время вечернего напоминания"
                    disabled={scheduleDisabled || !settings.evening_enabled}
                    value={settings.evening_time}
                    onChange={(e) => updateField("evening_time", e.target.value)}
                  />
                  <SwitchToggle
                    checked={settings.evening_enabled}
                    disabled={scheduleDisabled}
                    onChange={(val) => updateField("evening_enabled", val)}
                    ariaLabel="Вечерние напоминания"
                  />
                </div>
              }
            />
          </GroupList>
        </div>

        {/* Water, Calendar Events, Cycle, Goals */}
        <div className="mt-group-block" style={{ opacity: scheduleDisabled ? 0.55 : 1 }}>
          <GroupHeader title="Вода, события, цикл и цели" />
          <GroupList>
            <ListRow
              title="Водный баланс"
              meta="Если дневная цель ещё не выполнена"
              trailing={
                <SwitchToggle
                  checked={settings.water_enabled}
                  disabled={scheduleDisabled}
                  onChange={(val) => updateField("water_enabled", val)}
                  ariaLabel="Напоминания о воде"
                />
              }
            />
            {settings.water_enabled ? (
              <ListRow
                title="Интервал воды"
                meta="С 10:00 до 19:30"
                trailing={
                  <div style={{ width: "148px" }}>
                    <SelectField
                      compact
                      ariaLabel="Интервал напоминаний о воде"
                      disabled={scheduleDisabled}
                      value={String(settings.water_interval_hours)}
                      onChange={(val) =>
                        updateField("water_interval_hours", Number(val))
                      }
                      options={WATER_INTERVAL_OPTIONS}
                    />
                  </div>
                }
              />
            ) : null}

            <ListRow
              title="События календаря"
              meta="Напоминание о встречах и записях"
              trailing={
                <SwitchToggle
                  checked={settings.events_enabled}
                  disabled={scheduleDisabled}
                  onChange={(val) => updateField("events_enabled", val)}
                  ariaLabel="Напоминания о событиях календаря"
                />
              }
            />
            {settings.events_enabled ? (
              <ListRow
                title="Предупредить заранее"
                trailing={
                  <div style={{ width: "148px" }}>
                    <SelectField
                      compact
                      ariaLabel="За сколько напоминать о событиях"
                      disabled={scheduleDisabled}
                      value={String(settings.events_lead_minutes)}
                      onChange={(val) =>
                        updateField("events_lead_minutes", Number(val))
                      }
                      options={EVENT_LEAD_OPTIONS}
                    />
                  </div>
                }
              />
            ) : null}

            <ListRow
              title="Женский цикл"
              meta="Предупреждение о начале цикла"
              trailing={
                <SwitchToggle
                  checked={settings.cycle_enabled}
                  disabled={scheduleDisabled}
                  onChange={(val) => updateField("cycle_enabled", val)}
                  ariaLabel="Напоминания о женском цикле"
                />
              }
            />
            {settings.cycle_enabled ? (
              <ListRow
                title="За сколько дней"
                trailing={
                  <div style={{ width: "148px" }}>
                    <SelectField
                      compact
                      ariaLabel="За сколько дней предупреждать о цикле"
                      disabled={scheduleDisabled}
                      value={String(settings.cycle_days_before)}
                      onChange={(val) =>
                        updateField("cycle_days_before", Number(val))
                      }
                      options={CYCLE_DAYS_OPTIONS}
                    />
                  </div>
                }
              />
            ) : null}

            <ListRow
              title="Чек-ин по целям"
              meta="Еженедельный спокойный обзор"
              trailing={
                <SwitchToggle
                  checked={settings.goals_enabled}
                  disabled={scheduleDisabled}
                  onChange={(val) => updateField("goals_enabled", val)}
                  ariaLabel="Еженедельный чек-ин по целям"
                />
              }
            />
            {settings.goals_enabled ? (
              <>
                <ListRow
                  title="День недели"
                  trailing={
                    <div style={{ width: "148px" }}>
                      <SelectField
                        compact
                        ariaLabel="День недели для чек-ина по целям"
                        disabled={scheduleDisabled}
                        value={String(settings.goals_weekday)}
                        onChange={(val) =>
                          updateField("goals_weekday", Number(val))
                        }
                        options={WEEKDAY_OPTIONS}
                      />
                    </div>
                  }
                />
                <ListRow
                  title="Время обзора"
                  trailing={
                    <input
                      type="time"
                      className="mt-time-compact tabular"
                      aria-label="Время чек-ина по целям"
                      disabled={scheduleDisabled}
                      value={settings.goals_time}
                      onChange={(e) => updateField("goals_time", e.target.value)}
                    />
                  }
                />
              </>
            ) : null}
          </GroupList>
        </div>

        {/* Quiet hours */}
        <div className="mt-group-block" style={{ opacity: scheduleDisabled ? 0.55 : 1 }}>
          <GroupHeader title="Тихие часы" meta="Без уведомлений" />
          <GroupList>
            <ListRow
              title="Начало тишины"
              meta="Вечерняя граница"
              trailing={
                <input
                  type="time"
                  className="mt-time-compact tabular"
                  aria-label="Начало тихих часов"
                  disabled={scheduleDisabled}
                  value={settings.quiet_start}
                  onChange={(e) => updateField("quiet_start", e.target.value)}
                />
              }
            />
            <ListRow
              title="Окончание тишины"
              meta="Утреннее возобновление"
              trailing={
                <input
                  type="time"
                  className="mt-time-compact tabular"
                  aria-label="Окончание тихих часов"
                  disabled={scheduleDisabled}
                  value={settings.quiet_end}
                  onChange={(e) => updateField("quiet_end", e.target.value)}
                />
              }
            />
          </GroupList>
        </div>
      </form>
    </Sheet>
  );
}
