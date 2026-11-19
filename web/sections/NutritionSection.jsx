import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Apple,
  Check,
  Clock,
  Pencil,
  Plus,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
} from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  DateStrip,
  Pill,
  ProgressRing,
  SectionHeader,
  SegmentedControl,
} from "../components/UiPrimitives.jsx";
import MealPickerSheet, {
  formatMealAmount,
  parseDefaultPortion,
} from "../components/nutrition/MealPickerSheet.jsx";
import MenuCatalogView, {
  inferShoppingCategory,
} from "../components/nutrition/MenuCatalogSheet.jsx";
import { MEAL_SLOTS, MEAL_SLOT_MAP } from "../data/presets.js";
import {
  formatDateFullRu,
  formatDateShortRu,
  formatRelativeDayRu,
  nowTimeHHMM,
  todayISO,
} from "../utils/date.js";

const SLOT_ICONS = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Sunset,
  snack: Apple,
};

const MAIN_SLOTS = ["breakfast", "lunch", "dinner"];

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function sortMealsByTime(list) {
  return [...list].sort((a, b) => {
    const ta = String(a?.eaten_at || "99:99");
    const tb = String(b?.eaten_at || "99:99");
    if (ta !== tb) return ta.localeCompare(tb);
    return (a?.id || 0) - (b?.id || 0);
  });
}

function normalizeDayResponse(res, fallbackDate) {
  const items = Array.isArray(res?.items) ? res.items : [];
  const slots = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  items.forEach((item) => {
    const key = MEAL_SLOT_MAP[item.meal_slot] ? item.meal_slot : "snack";
    slots[key].push(item);
  });
  Object.keys(slots).forEach((k) => {
    slots[k] = sortMealsByTime(slots[k]);
  });

  return {
    date: res?.date || fallbackDate,
    items,
    slots,
    totals: res?.totals || {
      meals_count: items.length,
      total_kcal: 0,
      total_grams: 0,
      slots_completed: [],
    },
    recent_7d: Array.isArray(res?.recent_7d) ? res.recent_7d : [],
  };
}

export default function NutritionSection({
  selectedDate,
  todayDate = todayISO(),
  onSelectDate,
  initialSubTab,
  notify,
  onDataChanged,
}) {
  const activeDate = selectedDate || todayDate;

  const [activeSubTab, setActiveSubTab] = useState(
    initialSubTab === "menu" || initialSubTab === "catalog" ? "menu" : "ration",
  );
  const [dayData, setDayData] = useState(() =>
    normalizeDayResponse(null, activeDate),
  );
  const [menuItems, setMenuItems] = useState([]);
  const [loadingDay, setLoadingDay] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // MealPickerSheet state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState("breakfast");
  const [editingMeal, setEditingMeal] = useState(null);
  const [pickerMenuItem, setPickerMenuItem] = useState(null);

  useEffect(() => {
    if (!initialSubTab) return;
    if (initialSubTab === "menu" || initialSubTab === "catalog") {
      setActiveSubTab("menu");
    } else if (
      initialSubTab === "ration" ||
      initialSubTab === "diary" ||
      initialSubTab === "day"
    ) {
      setActiveSubTab("ration");
    } else if (MEAL_SLOT_MAP[initialSubTab]) {
      setActiveSubTab("ration");
      setPickerSlot(initialSubTab);
      setEditingMeal(null);
      setPickerMenuItem(null);
      setPickerOpen(true);
    }
  }, [initialSubTab]);

  const loadDay = useCallback(
    async (dateISO = activeDate, { silent = false } = {}) => {
      if (!silent) setLoadingDay(true);
      try {
        const res = await api.getNutritionDay(dateISO);
        setDayData(normalizeDayResponse(res, dateISO));
        setErrorMsg("");
      } catch (err) {
        setErrorMsg(err?.message || "Не удалось загрузить рацион дня.");
      } finally {
        if (!silent) setLoadingDay(false);
      }
    },
    [activeDate],
  );

  const loadMenu = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingMenu(true);
    try {
      const res = await api.getMenu();
      setMenuItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить меню блюд.", "error");
    } finally {
      if (!silent) setLoadingMenu(false);
    }
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDay(true);
    api
      .getNutritionDay(activeDate)
      .then((res) => {
        if (!cancelled) {
          setDayData(normalizeDayResponse(res, activeDate));
          setErrorMsg("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err?.message || "Не удалось загрузить рацион дня.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDay(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDate]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const menuById = useMemo(() => {
    const map = {};
    menuItems.forEach((m) => {
      map[m.id] = m;
    });
    return map;
  }, [menuItems]);

  // Derived daily overview stats (live-updating on optimistic actions)
  const overview = useMemo(() => {
    const items = dayData.items || [];
    const eatenItems = items.filter((m) => m.completed !== false);
    const plannedCount = items.length - eatenItems.length;

    const mainDoneSet = new Set();
    let hasSnack = false;
    let totalKcal = 0;
    let totalGrams = 0;
    let protein = 0;
    let fat = 0;
    let carbs = 0;
    let hasAnyMacros = false;

    const times = [];

    eatenItems.forEach((meal) => {
      if (MAIN_SLOTS.includes(meal.meal_slot)) mainDoneSet.add(meal.meal_slot);
      if (meal.meal_slot === "snack") hasSnack = true;
      totalKcal += Number(meal.kcal) || 0;
      totalGrams += Number(meal.grams) || 0;
      if (meal.eaten_at && /^\d{2}:\d{2}/.test(meal.eaten_at)) {
        times.push(meal.eaten_at.slice(0, 5));
      }

      const menuRef = meal.menu_item_id ? menuById[meal.menu_item_id] : null;
      if (menuRef) {
        const baseG = Number(menuRef.default_grams) || 0;
        const baseK = Number(menuRef.kcal) || 0;
        let ratio = 1;
        if (baseG > 0 && Number(meal.grams) > 0) {
          ratio = Number(meal.grams) / baseG;
        } else if (baseK > 0 && Number(meal.kcal) > 0) {
          ratio = Number(meal.kcal) / baseK;
        } else if (Number(meal.amount_value) > 0) {
          const parsed = parseDefaultPortion(menuRef.default_portion);
          ratio =
            parsed.amountValue > 0
              ? Number(meal.amount_value) / parsed.amountValue
              : Number(meal.amount_value);
        }
        protein += (Number(menuRef.protein_g) || 0) * ratio;
        fat += (Number(menuRef.fat_g) || 0) * ratio;
        carbs += (Number(menuRef.carbs_g) || 0) * ratio;
        if (menuRef.protein_g || menuRef.fat_g || menuRef.carbs_g) {
          hasAnyMacros = true;
        }
      }
    });

    times.sort();
    let eatingWindow = "Окно откроется с первым приёмом";
    if (times.length === 1) {
      eatingWindow = `с ${times[0]}`;
    } else if (times.length >= 2) {
      const first = times[0];
      const last = times[times.length - 1];
      eatingWindow = first === last ? `в ${first}` : `${first} — ${last}`;
    }

    const mainDoneCount = mainDoneSet.size;
    const progressPct = Math.round((mainDoneCount / 3) * 100);

    // Suggest next open main slot for header quick-add CTA
    const nextOpenSlot =
      MAIN_SLOTS.find((s) => !mainDoneSet.has(s)) || "snack";

    return {
      mainDoneCount,
      hasSnack,
      plannedCount,
      eatenCount: eatenItems.length,
      totalCount: items.length,
      totalKcal: Math.round(totalKcal),
      totalGrams: Math.round(totalGrams),
      protein: round1(protein),
      fat: round1(fat),
      carbs: round1(carbs),
      hasAnyMacros,
      eatingWindow,
      progressPct,
      nextOpenSlot,
    };
  }, [dayData.items, menuById]);

  const dateMarkers = useMemo(() => {
    const map = {};
    (dayData.recent_7d || []).forEach((entry) => {
      if (!entry?.date) return;
      if (entry.has_breakfast && entry.has_lunch && entry.has_dinner) {
        map[entry.date] = "done";
      } else if (entry.meals_count > 0) {
        map[entry.date] = "partial";
      }
    });
    if (overview.mainDoneCount === 3) {
      map[activeDate] = "done";
    } else if (overview.eatenCount > 0) {
      map[activeDate] = "partial";
    }
    return map;
  }, [dayData.recent_7d, overview.mainDoneCount, overview.eatenCount, activeDate]);

  const openPickerForSlot = (slotKey) => {
    setPickerSlot(slotKey || "breakfast");
    setEditingMeal(null);
    setPickerMenuItem(null);
    setPickerOpen(true);
  };

  const openPickerForEdit = (meal) => {
    setPickerSlot(meal.meal_slot || "breakfast");
    setEditingMeal(meal);
    setPickerMenuItem(null);
    setPickerOpen(true);
  };

  const openPickerForMenuItem = (menuItem) => {
    const targetSlot =
      menuItem.meal_slot && MEAL_SLOT_MAP[menuItem.meal_slot]
        ? menuItem.meal_slot
        : overview.nextOpenSlot;
    setPickerSlot(targetSlot);
    setEditingMeal(null);
    setPickerMenuItem(menuItem);
    setPickerOpen(true);
  };

  const handleSaveMeal = async (payload, mealId) => {
    if (mealId) {
      await api.updateMeal(mealId, payload);
      notify?.("Приём пищи обновлён", "success");
    } else {
      await api.createMeal(payload);
      const slotName = MEAL_SLOT_MAP[payload.meal_slot]?.label || "рацион";
      notify?.(`Добавлено в «${slotName}»`, "success");
    }
    await loadDay(activeDate, { silent: true });
    onDataChanged?.();
  };

  const handleToggleMealCompleted = async (meal) => {
    const nextCompleted = !(meal.completed !== false);
    await withOptimistic({
      apply: () => {
        const snapshot = dayData;
        const nextItems = dayData.items.map((item) =>
          item.id === meal.id ? { ...item, completed: nextCompleted } : item,
        );
        setDayData(
          normalizeDayResponse(
            { ...dayData, items: nextItems },
            activeDate,
          ),
        );
        return snapshot;
      },
      commit: async () => {
        await api.updateMeal(meal.id, { completed: nextCompleted });
        onDataChanged?.();
      },
      rollback: (snapshot) => {
        if (snapshot) setDayData(snapshot);
      },
      onError: (err) => {
        notify?.(err?.message || "Не удалось обновить статус блюда", "error");
      },
    }).catch(() => {});
  };

  const handleDeleteMeal = async (meal) => {
    await withOptimistic({
      apply: () => {
        const snapshot = dayData;
        const nextItems = dayData.items.filter((item) => item.id !== meal.id);
        setDayData(
          normalizeDayResponse(
            { ...dayData, items: nextItems },
            activeDate,
          ),
        );
        return snapshot;
      },
      commit: async () => {
        await api.deleteMeal(meal.id);
        notify?.(`Удалено: ${meal.dish_name}`, "info");
        await loadDay(activeDate, { silent: true });
        onDataChanged?.();
      },
      rollback: (snapshot) => {
        if (snapshot) setDayData(snapshot);
      },
      onError: (err) => {
        notify?.(err?.message || "Не удалось удалить запись", "error");
      },
    }).catch(() => {});
  };

  const handleQuickAddFromMenu = async (menuItem) => {
    const targetSlot =
      menuItem.meal_slot && MEAL_SLOT_MAP[menuItem.meal_slot]
        ? menuItem.meal_slot
        : "snack";
    const parsed = parseDefaultPortion(menuItem.default_portion);
    const defaultTime =
      activeDate === todayDate
        ? nowTimeHHMM()
        : MEAL_SLOT_MAP[targetSlot]?.defaultTime || "13:00";

    try {
      await api.createMeal({
        log_date: activeDate,
        meal_slot: targetSlot,
        menu_item_id: menuItem.id,
        dish_name: menuItem.name,
        amount_value: parsed.amountValue,
        amount_unit: parsed.amountUnit,
        grams: menuItem.default_grams || null,
        eaten_at: defaultTime,
        kcal: menuItem.kcal || null,
        note: "",
        completed: true,
      });
      const slotName = MEAL_SLOT_MAP[targetSlot]?.label || "Рацион";
      const dayLabel =
        activeDate === todayDate ? "сегодня" : formatDateShortRu(activeDate);
      notify?.(`«${menuItem.name}» добавлено в ${slotName} (${dayLabel})`, "success");
      await loadDay(activeDate, { silent: true });
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить блюдо в рацион", "error");
    }
  };

  const handleAddMenuItemToShopping = async (menuItem) => {
    try {
      await api.createShoppingItem({
        name: menuItem.name,
        category: inferShoppingCategory(menuItem),
        quantity:
          menuItem.default_portion ||
          (menuItem.default_grams ? `${menuItem.default_grams} г` : "1 порция"),
      });
      notify?.(`«${menuItem.name}» добавлено в список покупок`, "success");
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить в покупки", "error");
    }
  };

  const handleToggleFavorite = async (menuItem) => {
    const nextFav = !menuItem.is_favorite;
    await withOptimistic({
      apply: () => {
        const snapshot = menuItems;
        setMenuItems((prev) =>
          prev.map((m) =>
            m.id === menuItem.id ? { ...m, is_favorite: nextFav } : m,
          ),
        );
        return snapshot;
      },
      commit: async () => {
        await api.updateMenuItem(menuItem.id, { is_favorite: nextFav });
      },
      rollback: (snapshot) => {
        if (snapshot) setMenuItems(snapshot);
      },
      onError: (err) => {
        notify?.(err?.message || "Не удалось обновить избранное", "error");
      },
    }).catch(() => {});
  };

  const handleSaveMenuItem = async (payload, menuItemId) => {
    let saved;
    if (menuItemId) {
      saved = await api.updateMenuItem(menuItemId, payload);
      notify?.("Блюдо в меню обновлено", "success");
    } else {
      saved = await api.createMenuItem(payload);
      notify?.(`«${payload.name}» добавлено в меню`, "success");
    }
    await loadMenu({ silent: true });
    return saved;
  };

  const handleDeleteMenuItem = async (menuItem) => {
    try {
      await api.deleteMenuItem(menuItem.id);
      setMenuItems((prev) => prev.filter((m) => m.id !== menuItem.id));
      notify?.(`Удалено из меню: ${menuItem.name}`, "info");
    } catch (err) {
      notify?.(err?.message || "Не удалось удалить блюдо из меню", "error");
      throw err;
    }
  };

  const selectedDateShortLabel =
    activeDate === todayDate ? "сегодня" : formatDateShortRu(activeDate);

  return (
    <div className="mt-section" data-accent="nutrition">
      <SectionHeader
        eyebrow={formatDateFullRu(activeDate)}
        title="Питание"
        subtitle="Спокойный учёт рациона по меню и времени"
        action={
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--sm"
            data-accent="nutrition"
            onClick={() => openPickerForSlot(overview.nextOpenSlot)}
          >
            <Plus size={16} />
            <span>Блюдо</span>
          </button>
        }
      />

      <DateStrip
        selectedDate={activeDate}
        todayDate={todayDate}
        onSelectDate={onSelectDate}
        markers={dateMarkers}
      />

      {/* Daily Ration Overview Card */}
      <section
        className="nutrition-summary-card"
        data-accent="nutrition"
        aria-label="Сводка рациона за день"
      >
        <div className="mt-row" style={{ gap: "14px", alignItems: "center" }}>
          <ProgressRing
            percent={overview.progressPct}
            size={68}
            strokeWidth={7}
            color={
              overview.mainDoneCount === 3
                ? "var(--nutrition-olive)"
                : "var(--nutrition)"
            }
            label={`${overview.mainDoneCount}/3`}
            sublabel="осн."
          />

          <div className="mt-stack mt-stack--xs" style={{ flex: 1 }}>
            <div className="mt-row mt-row--between" style={{ gap: "6px" }}>
              <h2 className="mt-card-title" style={{ fontSize: "16px" }}>
                {overview.mainDoneCount} из 3 основных приёмов
              </h2>
            </div>

            <div className="mt-row mt-row--wrap" style={{ gap: "6px" }}>
              <span className="nutrition-time-badge">
                <Clock size={12} />
                <span>{overview.eatingWindow}</span>
              </span>
              {overview.hasSnack ? (
                <Pill tone="neutral">+ перекус</Pill>
              ) : null}
              {overview.plannedCount > 0 ? (
                <Pill tone="nutrition">в плане: {overview.plannedCount}</Pill>
              ) : null}
            </div>

            <p className="mt-card-sub tabular" style={{ marginTop: "2px" }}>
              {overview.totalKcal > 0 || overview.totalGrams > 0 ? (
                <>
                  Всего за день:{" "}
                  <strong style={{ color: "var(--ink)" }}>
                    {overview.totalKcal} ккал
                  </strong>
                  {overview.totalGrams > 0 ? ` · ${overview.totalGrams} г` : ""}
                </>
              ) : (
                "Выберите блюда из меню, чтобы отметить приёмы пищи"
              )}
            </p>
          </div>
        </div>

        {/* Gentle Protein / Fat / Carbs summary bar */}
        <div className="nutrition-macros-row">
          <div className="nutrition-macro-pill">
            <span>Белки</span>
            <strong>{overview.hasAnyMacros ? `${overview.protein} г` : "—"}</strong>
          </div>
          <div className="nutrition-macro-pill">
            <span>Жиры</span>
            <strong>{overview.hasAnyMacros ? `${overview.fat} г` : "—"}</strong>
          </div>
          <div className="nutrition-macro-pill">
            <span>Углеводы</span>
            <strong>{overview.hasAnyMacros ? `${overview.carbs} г` : "—"}</strong>
          </div>
        </div>
      </section>

      {/* Segmented View Switch: Рацион дня | Меню блюд */}
      <SegmentedControl
        value={activeSubTab}
        onChange={setActiveSubTab}
        accent="nutrition"
        options={[
          {
            value: "ration",
            label: "Рацион дня",
            count: overview.totalCount,
          },
          {
            value: "menu",
            label: "Меню блюд",
            count: menuItems.length,
          },
        ]}
      />

      {errorMsg ? <div className="mt-form-error">{errorMsg}</div> : null}

      {/* SUB-TAB 1: РАЦИОН ДНЯ */}
      {activeSubTab === "ration" ? (
        <div className="mt-stack">
          {loadingDay && dayData.items.length === 0 ? (
            <div className="mt-stack">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="nutrition-slot-card">
                  <div
                    className="mt-skeleton"
                    style={{ height: "20px", width: "42%" }}
                  />
                  <div
                    className="mt-skeleton"
                    style={{ height: "54px", width: "100%" }}
                  />
                </div>
              ))}
            </div>
          ) : (
            MEAL_SLOTS.map((slot) => {
              const SlotIcon = SLOT_ICONS[slot.key] || Sun;
              const slotItems = dayData.slots?.[slot.key] || [];
              const eatenSlotItems = slotItems.filter(
                (item) => item.completed !== false,
              );
              const slotKcal = eatenSlotItems.reduce(
                (sum, item) => sum + (Number(item.kcal) || 0),
                0,
              );
              const slotGrams = eatenSlotItems.reduce(
                (sum, item) => sum + (Number(item.grams) || 0),
                0,
              );

              // Keep empty Перекус serene & compact until an item is logged
              if (slot.key === "snack" && slotItems.length === 0) {
                return (
                  <section
                    key={slot.key}
                    className="nutrition-slot-card nutrition-slot-card--compact"
                    data-accent="nutrition"
                    aria-label={slot.label}
                  >
                    <div className="mt-row" style={{ gap: "10px", minWidth: 0 }}>
                      <span
                        className="mt-pill mt-pill--nutrition"
                        style={{ padding: "6px 9px" }}
                        aria-hidden="true"
                      >
                        <SlotIcon size={15} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <h3 className="mt-card-title">{slot.label}</h3>
                        <span className="nutrition-slot-window">
                          по желанию
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-btn mt-btn--soft mt-btn--sm"
                      data-accent="nutrition"
                      onClick={() => openPickerForSlot(slot.key)}
                    >
                      <Plus size={15} />
                      <span>Добавить перекус</span>
                    </button>
                  </section>
                );
              }

              return (
                <section
                  key={slot.key}
                  className="nutrition-slot-card"
                  data-accent="nutrition"
                  aria-label={slot.label}
                >
                  <div className="nutrition-slot-head">
                    <div className="mt-row" style={{ gap: "10px" }}>
                      <span
                        className={`mt-pill ${
                          eatenSlotItems.length > 0
                            ? "mt-pill--habits"
                            : "mt-pill--nutrition"
                        }`}
                        style={{ padding: "6px 9px" }}
                        aria-hidden="true"
                      >
                        <SlotIcon size={15} />
                      </span>
                      <div>
                        <h3 className="mt-card-title">{slot.label}</h3>
                        <span className="nutrition-slot-window">
                          <Clock size={11} />
                          <span>{slot.window}</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-row" style={{ gap: "6px", flexShrink: 0 }}>
                      {slotKcal > 0 ? (
                        <span className="nutrition-kcal-badge">
                          {Math.round(slotKcal)} ккал
                        </span>
                      ) : slotItems.length > 0 ? (
                        <Pill tone="nutrition">В плане</Pill>
                      ) : (
                        <span
                          className="muted"
                          style={{ fontSize: "12px", whiteSpace: "nowrap" }}
                        >
                          {slot.key === "snack" ? "по желанию" : "открыт"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Logged dishes for this meal slot */}
                  {slotItems.length > 0 ? (
                    <div className="mt-stack mt-stack--xs">
                      {slotItems.map((meal) => {
                        const isEaten = meal.completed !== false;
                        const amountText = formatMealAmount(meal);
                        return (
                          <div
                            key={meal.id}
                            className={`nutrition-dish-row${
                              isEaten ? " is-checked" : ""
                            }`}
                          >
                            {/* Checkbox button (44x44 touch target) */}
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={isEaten}
                              aria-label={
                                isEaten
                                  ? `Отметить «${meal.dish_name}» как запланированное`
                                  : `Отметить «${meal.dish_name}» как съеденное`
                              }
                              onClick={() => handleToggleMealCompleted(meal)}
                              style={{
                                width: "44px",
                                height: "44px",
                                minWidth: "44px",
                                margin: "-10px -8px -10px -10px",
                                padding: 0,
                                border: 0,
                                background: "transparent",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <span
                                className="mt-check-box"
                                style={
                                  isEaten
                                    ? {
                                        background: "var(--nutrition-olive)",
                                        borderColor: "var(--nutrition-olive)",
                                      }
                                    : undefined
                                }
                              >
                                {isEaten ? (
                                  <Check size={14} strokeWidth={2.75} />
                                ) : null}
                              </span>
                            </button>

                            {/* Dish info: what + quick actions on top row, then full-width when/how-much/kcal badges */}
                            <div
                              className="mt-stack mt-stack--xs"
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              <div
                                className="mt-row mt-row--between"
                                style={{ alignItems: "flex-start", gap: "6px" }}
                              >
                                <div
                                  className="mt-row mt-row--wrap"
                                  style={{ gap: "6px", flex: 1, minWidth: 0, paddingTop: "2px" }}
                                >
                                  <strong
                                    style={{
                                      fontSize: "14.5px",
                                      lineHeight: "20px",
                                      fontWeight: 600,
                                      color: isEaten
                                        ? "var(--ink)"
                                        : "var(--ink-secondary)",
                                      overflowWrap: "anywhere",
                                    }}
                                  >
                                    {meal.dish_name}
                                  </strong>
                                  {!isEaten ? (
                                    <Pill tone="warning">В плане</Pill>
                                  ) : null}
                                </div>

                                <div
                                  className="mt-row"
                                  style={{
                                    gap: "0px",
                                    flexShrink: 0,
                                    margin: "-10px -10px -10px 0",
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="mt-icon-btn"
                                    aria-label={`Изменить «${meal.dish_name}»`}
                                    onClick={() => openPickerForEdit(meal)}
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="mt-icon-btn mt-icon-btn--danger"
                                    aria-label={`Удалить «${meal.dish_name}»`}
                                    onClick={() => handleDeleteMeal(meal)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>

                              <div
                                className="mt-row mt-row--wrap"
                                style={{ gap: "6px" }}
                              >
                                {meal.eaten_at ? (
                                  <span className="nutrition-time-badge">
                                    <Clock size={11} />
                                    <span>{meal.eaten_at}</span>
                                  </span>
                                ) : null}
                                {amountText ? (
                                  <span className="nutrition-amount-badge">
                                    {amountText}
                                  </span>
                                ) : null}
                                {meal.kcal > 0 ? (
                                  <span className="nutrition-kcal-badge">
                                    {Math.round(meal.kcal)} ккал
                                  </span>
                                ) : null}
                              </div>

                              {meal.note ? (
                                <p
                                  className="mt-card-sub"
                                  style={{ marginTop: 0, fontSize: "12.5px" }}
                                >
                                  {meal.note}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {slotGrams > 0 && slotItems.length > 1 ? (
                        <div
                          className="muted tabular"
                          style={{
                            fontSize: "12px",
                            paddingTop: "4px",
                            borderTop: "1px solid var(--border-subtle)",
                          }}
                        >
                          Итого за {slot.label.toLowerCase()}:{" "}
                          {Math.round(slotGrams)} г · {Math.round(slotKcal)} ккал
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p
                      className="mt-card-sub"
                      style={{
                        marginTop: 0,
                        padding: "4px 0",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      {slot.key === "snack"
                        ? "Перекус по желанию — можно добавить фрукт, орехи или напиток."
                        : `Пока пусто · комфортное время ${slot.window}.`}
                    </p>
                  )}

                  {/* Prominent button inside every meal slot */}
                  <button
                    type="button"
                    className="mt-btn mt-btn--soft mt-btn--wide"
                    data-accent="nutrition"
                    onClick={() => openPickerForSlot(slot.key)}
                  >
                    <Plus size={17} />
                    <span>Выбрать из меню / добавить</span>
                  </button>
                </section>
              );
            })
          )}

          {/* Calm 7-day meal rhythm strip */}
          {dayData.recent_7d && dayData.recent_7d.length > 0 ? (
            <section
              className="mt-card mt-card--compact"
              aria-label="Ритм питания за 7 дней"
            >
              <div className="mt-row mt-row--between">
                <h3 className="mt-card-title">Ритм за 7 дней</h3>
                <span className="muted" style={{ fontSize: "12px" }}>
                  Завтрак · Обед · Ужин
                </span>
              </div>
              <div className="workout-week-strip">
                {dayData.recent_7d.slice(-7).map((entry) => {
                  const isSel = entry.date === activeDate;
                  const countMain =
                    (entry.has_breakfast ? 1 : 0) +
                    (entry.has_lunch ? 1 : 0) +
                    (entry.has_dinner ? 1 : 0);
                  const shortDay =
                    entry.date === todayDate
                      ? "Сег"
                      : String(entry.date || "").slice(8, 10);

                  return (
                    <button
                      key={entry.date}
                      type="button"
                      className={`workout-week-day${
                        countMain === 3 ? " is-active" : ""
                      }`}
                      style={{
                        borderColor: isSel ? "var(--nutrition)" : undefined,
                        background: isSel
                          ? "var(--nutrition-soft)"
                          : countMain === 3
                            ? "#F1F5EA"
                            : undefined,
                        color: isSel
                          ? "var(--nutrition-ink)"
                          : countMain === 3
                            ? "var(--nutrition-olive)"
                            : undefined,
                        minHeight: "56px",
                      }}
                      aria-label={`${formatRelativeDayRu(entry.date)}: ${countMain} из 3 основных приёмов`}
                      onClick={() => onSelectDate?.(entry.date)}
                    >
                      <span className="tabular">{shortDay}</span>
                      <span
                        style={{
                          display: "inline-flex",
                          gap: "3px",
                          alignItems: "center",
                        }}
                        aria-hidden="true"
                      >
                        {[
                          entry.has_breakfast,
                          entry.has_lunch,
                          entry.has_dinner,
                        ].map((ok, idx) => (
                          <span
                            key={idx}
                            style={{
                              width: "5px",
                              height: "5px",
                              borderRadius: "50%",
                              background: ok
                                ? "var(--nutrition-olive)"
                                : "var(--border-strong)",
                            }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        /* SUB-TAB 2: МЕНЮ БЛЮД */
        <MenuCatalogView
          menuItems={menuItems}
          loading={loadingMenu}
          selectedDateLabel={selectedDateShortLabel}
          onQuickAddToDay={handleQuickAddFromMenu}
          onCustomizeAndAdd={openPickerForMenuItem}
          onAddToShopping={handleAddMenuItemToShopping}
          onToggleFavorite={handleToggleFavorite}
          onSaveMenuItem={handleSaveMenuItem}
          onDeleteMenuItem={handleDeleteMenuItem}
        />
      )}

      {/* Bottom Sheet: Выбор блюда / редактирование */}
      <MealPickerSheet
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setEditingMeal(null);
          setPickerMenuItem(null);
        }}
        selectedDate={activeDate}
        initialSlot={pickerSlot}
        editingMeal={editingMeal}
        initialMenuItem={pickerMenuItem}
        menuItems={menuItems}
        onSaveMeal={handleSaveMeal}
        onDeleteMeal={handleDeleteMeal}
        onSaveToMenu={(payload) => handleSaveMenuItem(payload, null)}
      />
    </div>
  );
}
