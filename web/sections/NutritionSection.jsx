import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, LayoutGrid, List, Plus } from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  DateStrip,
  GroupHeader,
  GroupList,
  ListRow,
  MetricStrip,
  PageHeader,
  SegmentedControl,
} from "../components/UiPrimitives.jsx";
import ShoppingPanel from "../components/ShoppingPanel.jsx";
import DishPhotoCard from "../components/nutrition/DishPhotoCard.jsx";
import MealPickerSheet, {
  formatAmountNumber,
  parseDefaultPortion,
} from "../components/nutrition/MealPickerSheet.jsx";
import MenuCatalogView, {
  inferShoppingCategory,
} from "../components/nutrition/MenuCatalogSheet.jsx";
import {
  GROCERY_CATEGORIES,
  MEAL_SLOTS,
  MEAL_SLOT_MAP,
} from "../data/presets.js";
import {
  formatDateShortRu,
  nowTimeHHMM,
  todayISO,
} from "../utils/date.js";

const MAIN_SLOTS = ["breakfast", "lunch", "dinner"];
const VIEW_MODE_KEY = "ritm_nutrition_view_mode";

function readInitialViewMode() {
  try {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    return saved === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}

function formatMealWeightShort(meal) {
  const grams = Number(meal?.grams) || 0;
  const val = Number(meal?.amount_value) || 0;
  const unit = String(meal?.amount_unit || "").trim();
  if (grams > 0) return `${Math.round(grams)} г`;
  if (val > 0) return `${formatAmountNumber(val)} ${unit || "порция"}`;
  return "";
}

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

function buildMealMetaLine(meal, isEaten) {
  const parts = [];
  if (meal.eaten_at) parts.push(meal.eaten_at);

  const grams = Number(meal?.grams) || 0;
  const val = Number(meal?.amount_value) || 0;
  const unit = String(meal?.amount_unit || "").trim();
  if (grams > 0) {
    parts.push(`${Math.round(grams)} г`);
  } else if (val > 0) {
    parts.push(`${formatAmountNumber(val)} ${unit || "порция"}`);
  }

  if (meal.kcal > 0) {
    parts.push(`${Math.round(meal.kcal)} ккал`);
  }
  if (!isEaten) {
    parts.push("В плане");
  }
  return parts.join(" · ");
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
    initialSubTab === "menu" || initialSubTab === "catalog"
      ? "menu"
      : initialSubTab === "shopping" || initialSubTab === "groceries"
        ? "shopping"
        : "ration",
  );
  const [viewMode, setViewMode] = useState(readInitialViewMode);
  const handleChangeViewMode = useCallback((nextMode) => {
    setViewMode(nextMode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, nextMode);
    } catch {
      // Ignore storage restrictions
    }
  }, []);
  const [dayData, setDayData] = useState(() =>
    normalizeDayResponse(null, activeDate),
  );
  const [menuItems, setMenuItems] = useState([]);
  const [groceryCount, setGroceryCount] = useState(null);
  const [loadingDay, setLoadingDay] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [createMenuSignal, setCreateMenuSignal] = useState(0);

  // MealPickerSheet state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState("breakfast");
  const [editingMeal, setEditingMeal] = useState(null);
  const [pickerMenuItem, setPickerMenuItem] = useState(null);

  useEffect(() => {
    if (!initialSubTab) return;
    if (initialSubTab === "menu" || initialSubTab === "catalog") {
      setActiveSubTab("menu");
    } else if (initialSubTab === "shopping" || initialSubTab === "groceries") {
      setActiveSubTab("shopping");
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

  const loadMenu = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoadingMenu(true);
      try {
        const res = await api.getMenu();
        setMenuItems(Array.isArray(res?.items) ? res.items : []);
      } catch (err) {
        notify?.(err?.message || "Не удалось загрузить меню блюд.", "error");
      } finally {
        if (!silent) setLoadingMenu(false);
      }
    },
    [notify],
  );

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

  useEffect(() => {
    let cancelled = false;
    api
      .getShopping("groceries")
      .then((res) => {
        if (cancelled) return;
        const remaining =
          typeof res?.summary?.remaining === "number"
            ? res.summary.remaining
            : Array.isArray(res?.items)
              ? res.items.filter((it) => !it.bought).length
              : 0;
        setGroceryCount(remaining);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const menuById = useMemo(() => {
    const map = {};
    menuItems.forEach((m) => {
      map[m.id] = m;
    });
    return map;
  }, [menuItems]);

  const overview = useMemo(() => {
    const items = dayData.items || [];
    const eatenItems = items.filter((m) => m.completed !== false);

    const mainDoneSet = new Set();
    let totalKcal = 0;
    let totalGrams = 0;
    let protein = 0;
    let fat = 0;
    let carbs = 0;
    let hasAnyMacros = false;
    const times = [];

    eatenItems.forEach((meal) => {
      if (MAIN_SLOTS.includes(meal.meal_slot)) mainDoneSet.add(meal.meal_slot);
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
    let eatingWindow = "—";
    if (times.length === 1) {
      eatingWindow = times[0];
    } else if (times.length >= 2) {
      const first = times[0];
      const last = times[times.length - 1];
      eatingWindow = first === last ? first : `${first}–${last}`;
    }

    const mainDoneCount = mainDoneSet.size;
    const nextOpenSlot =
      MAIN_SLOTS.find((s) => !mainDoneSet.has(s)) || "snack";

    return {
      mainDoneCount,
      eatenCount: eatenItems.length,
      totalCount: items.length,
      totalKcal: Math.round(totalKcal),
      totalGrams: Math.round(totalGrams),
      protein: round1(protein),
      fat: round1(fat),
      carbs: round1(carbs),
      hasAnyMacros,
      eatingWindow,
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
  }, [
    dayData.recent_7d,
    overview.mainDoneCount,
    overview.eatenCount,
    activeDate,
  ]);

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
          normalizeDayResponse({ ...dayData, items: nextItems }, activeDate),
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
          normalizeDayResponse({ ...dayData, items: nextItems }, activeDate),
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
      notify?.(
        `«${menuItem.name}» добавлено в «${slotName}» (${dayLabel})`,
        "success",
      );
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
        list_type: "groceries",
      });
      setGroceryCount((prev) => (typeof prev === "number" ? prev + 1 : 1));
      notify?.(`«${menuItem.name}» добавлено в продукты`, "success");
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить в покупки", "error");
    }
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
    await Promise.all([
      loadMenu({ silent: true }),
      loadDay(activeDate, { silent: true }),
    ]);
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

  const macrosText = overview.hasAnyMacros
    ? `${Math.round(overview.protein)} / ${Math.round(overview.fat)} / ${Math.round(overview.carbs)}`
    : "—";

  return (
    <div className="mt-section">
      <PageHeader
        title="Питание"
        subtitle={
          activeSubTab === "shopping"
            ? "Продукты"
            : formatDateShortRu(activeDate)
        }
        action={
          activeSubTab !== "shopping" ? (
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              aria-label={
                activeSubTab === "menu"
                  ? "Новое блюдо в меню"
                  : "Добавить блюдо в рацион"
              }
              onClick={() => {
                if (activeSubTab === "menu") {
                  setCreateMenuSignal((n) => n + 1);
                } else {
                  openPickerForSlot(overview.nextOpenSlot);
                }
              }}
            >
              <Plus size={16} />
            </button>
          ) : null
        }
      />

      {activeSubTab !== "shopping" ? (
        <DateStrip
          selectedDate={activeDate}
          todayDate={todayDate}
          onSelectDate={onSelectDate}
          markers={dateMarkers}
        />
      ) : null}

      <SegmentedControl
        value={activeSubTab}
        onChange={setActiveSubTab}
        options={[
          {
            value: "ration",
            label: "Рацион",
            count: overview.totalCount,
          },
          {
            value: "menu",
            label: "Меню",
            count: menuItems.length,
          },
          {
            value: "shopping",
            label: "Покупки",
            count: typeof groceryCount === "number" ? groceryCount : undefined,
          },
        ]}
      />

      {activeSubTab !== "shopping" ? (
        <div
          className="nutrition-view-bar"
          role="group"
          aria-label="Режим отображения блюд"
        >
          <span className="nutrition-view-label">Отображение</span>
          <div className="nutrition-view-switch">
            <button
              type="button"
              className={`nutrition-view-btn${viewMode === "list" ? " is-active" : ""}`}
              aria-pressed={viewMode === "list"}
              onClick={() => handleChangeViewMode("list")}
            >
              <List size={14} aria-hidden="true" />
              <span>Список</span>
            </button>
            <button
              type="button"
              className={`nutrition-view-btn${viewMode === "cards" ? " is-active" : ""}`}
              aria-pressed={viewMode === "cards"}
              onClick={() => handleChangeViewMode("cards")}
            >
              <LayoutGrid size={14} aria-hidden="true" />
              <span>Карточки</span>
            </button>
          </div>
        </div>
      ) : null}

      {errorMsg ? <div className="mt-form-error">{errorMsg}</div> : null}

      {/* SUB-TAB 1: РАЦИОН */}
      {activeSubTab === "ration" ? (
        <div className="mt-stack">
          <MetricStrip
            items={[
              {
                key: "kcal",
                value: `${overview.totalKcal} ккал`,
                label: `${overview.mainDoneCount} из 3 осн.`,
                tone: overview.mainDoneCount === 3 ? "cobalt" : undefined,
              },
              {
                key: "macros",
                value: macrosText,
                label: "Б / Ж / У, г",
              },
              {
                key: "window",
                value: overview.eatingWindow,
                label: "Окно",
              },
            ]}
          />

          {loadingDay && dayData.items.length === 0 ? (
            <GroupList>
              <div className="mt-list-row">
                <div
                  className="mt-skeleton"
                  style={{ height: "20px", width: "55%" }}
                />
              </div>
              <div className="mt-list-row">
                <div
                  className="mt-skeleton"
                  style={{ height: "20px", width: "48%" }}
                />
              </div>
            </GroupList>
          ) : (
            MEAL_SLOTS.map((slot) => {
              const slotItems = dayData.slots?.[slot.key] || [];
              const eatenSlotItems = slotItems.filter(
                (item) => item.completed !== false,
              );
              const slotKcal = eatenSlotItems.reduce(
                (sum, item) => sum + (Number(item.kcal) || 0),
                0,
              );

              return (
                <section
                  key={slot.key}
                  className="mt-group-block"
                  aria-label={slot.label}
                >
                  <GroupHeader
                    title={slot.label}
                    meta={
                      slotKcal > 0
                        ? `${Math.round(slotKcal)} ккал`
                        : slot.key === "snack"
                          ? undefined
                          : slot.window
                    }
                    action={
                      <button
                        type="button"
                        className="mt-icon-btn"
                        style={{ color: "var(--cobalt)" }}
                        aria-label={`Добавить в ${slot.label.toLowerCase()}`}
                        onClick={() => openPickerForSlot(slot.key)}
                      >
                        <Plus size={18} />
                      </button>
                    }
                  />

                  {slotItems.length > 0 && viewMode === "cards" ? (
                    <div className="dish-grid">
                      {slotItems.map((meal) => {
                        const isEaten = meal.completed !== false;
                        const menuRef = meal.menu_item_id
                          ? menuById[meal.menu_item_id]
                          : null;
                        const cardPhoto =
                          meal.effective_photo_url ||
                          meal.photo_url ||
                          menuRef?.photo_url ||
                          "";
                        const cardDesc =
                          meal.note ||
                          meal.description ||
                          menuRef?.description ||
                          "";
                        return (
                          <DishPhotoCard
                            key={meal.id}
                            mode="meal"
                            title={meal.dish_name}
                            description={cardDesc}
                            photoUrl={cardPhoto}
                            weightText={formatMealWeightShort(meal)}
                            kcalText={
                              meal.kcal > 0
                                ? `${Math.round(meal.kcal)} ккал`
                                : ""
                            }
                            timeText={meal.eaten_at || ""}
                            isCompleted={isEaten}
                            onOpen={() => openPickerForEdit(meal)}
                            onToggleComplete={() =>
                              handleToggleMealCompleted(meal)
                            }
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <GroupList>
                      {slotItems.length > 0 ? (
                        slotItems.map((meal) => {
                          const isEaten = meal.completed !== false;
                          return (
                            <ListRow
                              key={meal.id}
                              checked={isEaten}
                              onToggle={() => handleToggleMealCompleted(meal)}
                              title={meal.dish_name}
                              meta={buildMealMetaLine(meal, isEaten)}
                              onClick={() => openPickerForEdit(meal)}
                              trailing={
                                <ChevronRight
                                  size={15}
                                  className="mt-list-row-chevron"
                                  aria-hidden="true"
                                />
                              }
                            />
                          );
                        })
                      ) : (
                        <button
                          type="button"
                          className="nutrition-empty-row"
                          onClick={() => openPickerForSlot(slot.key)}
                        >
                          <span>Добавить блюдо</span>
                          <Plus
                            size={16}
                            style={{ color: "var(--cobalt)", flexShrink: 0 }}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </GroupList>
                  )}
                </section>
              );
            })
          )}
        </div>
      ) : activeSubTab === "menu" ? (
        /* SUB-TAB 2: МЕНЮ */
        <MenuCatalogView
          menuItems={menuItems}
          loading={loadingMenu}
          viewMode={viewMode}
          selectedDateLabel={selectedDateShortLabel}
          createSignal={createMenuSignal}
          onConsumeCreateSignal={() => setCreateMenuSignal(0)}
          onQuickAddToDay={handleQuickAddFromMenu}
          onCustomizeAndAdd={openPickerForMenuItem}
          onAddToShopping={handleAddMenuItemToShopping}
          onSaveMenuItem={handleSaveMenuItem}
          onDeleteMenuItem={handleDeleteMenuItem}
        />
      ) : (
        /* SUB-TAB 3: ПОКУПКИ ПРОДУКТОВ */
        <ShoppingPanel
          listType="groceries"
          categories={GROCERY_CATEGORIES}
          placeholder="Продукт…"
          emptyTitle="Список продуктов пуст"
          emptyDescription="Добавьте продукты выше или отправьте блюдо в покупки из вкладки «Меню»."
          notify={notify}
          onDataChanged={onDataChanged}
          onCountChange={setGroceryCount}
        />
      )}

      {/* Bottom Sheet: Выбор блюда / редактирование / удаление */}
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
