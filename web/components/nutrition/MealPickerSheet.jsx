import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Search,
  Star,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import Sheet from "../Sheet.jsx";
import {
  EmptyState,
  GroupList,
  MetricStrip,
  Pill,
  SegmentedControl,
  SelectField,
  StepperPill,
} from "../UiPrimitives.jsx";
import {
  MEAL_SLOTS,
  MEAL_SLOT_MAP,
  NUTRITION_QUICK_NOTES,
  PORTION_PRESETS,
  PORTION_UNITS,
} from "../../data/presets.js";
import { nowTimeHHMM } from "../../utils/date.js";

const QUICK_TIME_PRESETS = ["08:30", "13:30", "19:00"];

export function parseDefaultPortion(portionStr) {
  const raw = String(portionStr || "").trim();
  if (!raw) return { amountValue: 1, amountUnit: "порция" };
  const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) {
    return { amountValue: 1, amountUnit: raw };
  }
  const parsedNum = Number(match[1].replace(",", "."));
  const unit = (match[2] || "").trim() || "порция";
  return {
    amountValue: Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : 1,
    amountUnit: unit,
  };
}

export function formatAmountNumber(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return "1";
  const rounded = Math.round(num * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatMealAmount(meal) {
  const grams = Number(meal?.grams) || 0;
  const val = Number(meal?.amount_value) || 0;
  const unit = String(meal?.amount_unit || "").trim();

  if (grams > 0 && unit && unit !== "г" && val > 0) {
    return `${Math.round(grams)} г · ${formatAmountNumber(val)} ${unit}`;
  }
  if (grams > 0) {
    return `${Math.round(grams)} г`;
  }
  if (val > 0) {
    return `${formatAmountNumber(val)} ${unit || "порция"}`;
  }
  return "";
}

function normalizeSearch(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function stepForUnit(unit) {
  if (unit === "г" || unit === "мл") return 25;
  if (unit === "ложка") return 1;
  return 0.5;
}

function minForUnit(unit) {
  if (unit === "г" || unit === "мл") return 25;
  return 0.25;
}

export default function MealPickerSheet({
  open = false,
  onClose,
  selectedDate,
  initialSlot = "breakfast",
  editingMeal = null,
  initialMenuItem = null,
  menuItems = [],
  onSaveMeal,
  onDeleteMeal,
  onSaveToMenu,
}) {
  const isEditing = Boolean(editingMeal?.id);

  const [mealSlot, setMealSlot] = useState(initialSlot || "breakfast");
  const [sourceMode, setSourceMode] = useState("menu"); // "menu" | "custom"
  const [searchQuery, setSearchQuery] = useState("");
  const [menuFilter, setMenuFilter] = useState("slot"); // "slot" | "favorites" | "all"
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);
  const [showCatalogList, setShowCatalogList] = useState(true);

  const [dishName, setDishName] = useState("");
  const [amountValue, setAmountValue] = useState("1");
  const [amountUnit, setAmountUnit] = useState("порция");
  const [grams, setGrams] = useState("");
  const [kcal, setKcal] = useState("");
  const [eatenAt, setEatenAt] = useState("08:30");
  const [note, setNote] = useState("");
  const [completed, setCompleted] = useState(true);
  const [saveCustomToMenu, setSaveCustomToMenu] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const [baseRef, setBaseRef] = useState({
    amountValue: 1,
    amountUnit: "порция",
    grams: 200,
    kcal: 280,
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubmitting(false);
    setDeleting(false);
    setSearchQuery("");
    setSaveCustomToMenu(false);

    if (editingMeal) {
      const slot = editingMeal.meal_slot || initialSlot || "breakfast";
      const matchedMenu = editingMeal.menu_item_id
        ? menuItems.find((m) => m.id === editingMeal.menu_item_id) || null
        : null;
      const parsedFromMenu = matchedMenu
        ? parseDefaultPortion(matchedMenu.default_portion)
        : null;

      setMealSlot(slot);
      setSelectedMenuItem(matchedMenu);
      setSourceMode(matchedMenu ? "menu" : "custom");
      setShowCatalogList(false);
      setDishName(editingMeal.dish_name || "");
      setAmountValue(formatAmountNumber(editingMeal.amount_value ?? 1));
      setAmountUnit(editingMeal.amount_unit || "порция");
      setGrams(
        editingMeal.grams != null && editingMeal.grams !== ""
          ? String(Math.round(Number(editingMeal.grams)))
          : "",
      );
      setKcal(
        editingMeal.kcal != null && editingMeal.kcal !== ""
          ? String(Math.round(Number(editingMeal.kcal)))
          : "",
      );
      setEatenAt(
        editingMeal.eaten_at || MEAL_SLOT_MAP[slot]?.defaultTime || nowTimeHHMM(),
      );
      setNote(editingMeal.note || "");
      setCompleted(editingMeal.completed !== false);
      setMenuFilter("slot");
      setBaseRef({
        amountValue:
          parsedFromMenu?.amountValue ||
          Number(editingMeal.amount_value) ||
          1,
        amountUnit:
          parsedFromMenu?.amountUnit || editingMeal.amount_unit || "порция",
        grams:
          Number(matchedMenu?.default_grams) || Number(editingMeal.grams) || 200,
        kcal: Number(matchedMenu?.kcal) || Number(editingMeal.kcal) || 250,
      });
      return;
    }

    if (initialMenuItem) {
      const slot =
        initialSlot ||
        (initialMenuItem.meal_slot && initialMenuItem.meal_slot !== "any"
          ? initialMenuItem.meal_slot
          : "breakfast");
      const parsed = parseDefaultPortion(initialMenuItem.default_portion);
      setMealSlot(slot);
      setSourceMode("menu");
      setSelectedMenuItem(initialMenuItem);
      setShowCatalogList(false);
      setMenuFilter("slot");
      setDishName(initialMenuItem.name || "");
      setAmountValue(formatAmountNumber(parsed.amountValue));
      setAmountUnit(parsed.amountUnit);
      setGrams(
        initialMenuItem.default_grams
          ? String(Math.round(initialMenuItem.default_grams))
          : "",
      );
      setKcal(
        initialMenuItem.kcal ? String(Math.round(initialMenuItem.kcal)) : "",
      );
      setEatenAt(nowTimeHHMM());
      setNote("");
      setCompleted(true);
      setBaseRef({
        amountValue: parsed.amountValue,
        amountUnit: parsed.amountUnit,
        grams: Number(initialMenuItem.default_grams) || 200,
        kcal: Number(initialMenuItem.kcal) || 250,
      });
      return;
    }

    const slot = initialSlot || "breakfast";
    setMealSlot(slot);
    setSourceMode("menu");
    setSelectedMenuItem(null);
    setShowCatalogList(true);
    setMenuFilter("slot");
    setDishName("");
    setAmountValue("1");
    setAmountUnit("порция");
    setGrams("");
    setKcal("");
    setEatenAt(MEAL_SLOT_MAP[slot]?.defaultTime || nowTimeHHMM());
    setNote("");
    setCompleted(true);
    setBaseRef({
      amountValue: 1,
      amountUnit: "порция",
      grams: 200,
      kcal: 250,
    });
  }, [open, editingMeal, initialMenuItem, initialSlot, menuItems]);

  const unitOptions = useMemo(() => {
    const keys = PORTION_UNITS.map((u) => u.key);
    if (amountUnit && !keys.includes(amountUnit)) {
      return [{ key: amountUnit, label: amountUnit }, ...PORTION_UNITS];
    }
    return PORTION_UNITS;
  }, [amountUnit]);

  const filteredMenu = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    return menuItems.filter((item) => {
      if (q) {
        const hay = normalizeSearch(`${item.name} ${item.category || ""}`);
        if (!hay.includes(q)) return false;
      } else if (menuFilter === "favorites") {
        if (!item.is_favorite) return false;
      } else if (menuFilter === "slot") {
        if (
          item.meal_slot &&
          item.meal_slot !== "any" &&
          item.meal_slot !== mealSlot
        ) {
          return false;
        }
      }
      return true;
    });
  }, [menuItems, searchQuery, menuFilter, mealSlot]);

  const scaledMacros = useMemo(() => {
    if (!selectedMenuItem) return null;
    const baseG = Number(selectedMenuItem.default_grams) || 0;
    const baseKcal = Number(selectedMenuItem.kcal) || 0;
    const curG = Number(grams) || 0;
    const curKcal = Number(kcal) || 0;

    let ratio = 1;
    if (baseG > 0 && curG > 0) {
      ratio = curG / baseG;
    } else if (baseKcal > 0 && curKcal > 0) {
      ratio = curKcal / baseKcal;
    } else {
      const parsed = parseDefaultPortion(selectedMenuItem.default_portion);
      const curAmt = Number(amountValue) || 1;
      ratio = parsed.amountValue > 0 ? curAmt / parsed.amountValue : curAmt;
    }

    return {
      protein: round1((selectedMenuItem.protein_g || 0) * ratio),
      fat: round1((selectedMenuItem.fat_g || 0) * ratio),
      carbs: round1((selectedMenuItem.carbs_g || 0) * ratio),
    };
  }, [selectedMenuItem, grams, kcal, amountValue]);

  const slotQuickTimes = useMemo(() => {
    const slotMeta = MEAL_SLOT_MAP[mealSlot];
    const merged = [...QUICK_TIME_PRESETS];
    if (slotMeta?.defaultTime && !merged.includes(slotMeta.defaultTime)) {
      merged.push(slotMeta.defaultTime);
    }
    return merged;
  }, [mealSlot]);

  const handleSelectMenuDish = (item) => {
    const parsed = parseDefaultPortion(item.default_portion);
    setSelectedMenuItem(item);
    setDishName(item.name);
    setAmountValue(formatAmountNumber(parsed.amountValue));
    setAmountUnit(parsed.amountUnit);
    setGrams(item.default_grams ? String(Math.round(item.default_grams)) : "");
    setKcal(item.kcal ? String(Math.round(item.kcal)) : "");
    setBaseRef({
      amountValue: parsed.amountValue,
      amountUnit: parsed.amountUnit,
      grams: Number(item.default_grams) || 200,
      kcal: Number(item.kcal) || 250,
    });
    setShowCatalogList(false);
    setError("");
  };

  const rescaleByAmount = (nextVal, unit = amountUnit) => {
    const num = Math.max(0, Number(nextVal) || 0);
    setAmountValue(formatAmountNumber(num));
    if (num <= 0) return;

    if (unit === "г" || unit === "мл") {
      setGrams(String(Math.round(num)));
      if (baseRef.grams > 0 && baseRef.kcal > 0) {
        setKcal(String(Math.round((baseRef.kcal * num) / baseRef.grams)));
      }
    } else {
      const baseCount = baseRef.amountValue > 0 ? baseRef.amountValue : 1;
      const ratio = num / baseCount;
      if (baseRef.grams > 0) {
        setGrams(String(Math.round(baseRef.grams * ratio)));
      }
      if (baseRef.kcal > 0) {
        setKcal(String(Math.round(baseRef.kcal * ratio)));
      }
    }
  };

  const handleApplyPortionPreset = (preset) => {
    if (preset.mode === "multiplier") {
      const targetUnit =
        baseRef.amountUnit &&
        baseRef.amountUnit !== "г" &&
        baseRef.amountUnit !== "мл"
          ? baseRef.amountUnit
          : "порция";
      const nextCount = round1((baseRef.amountValue || 1) * preset.value);
      setAmountUnit(targetUnit);
      setAmountValue(formatAmountNumber(nextCount));
      if (baseRef.grams > 0) {
        setGrams(String(Math.round(baseRef.grams * preset.value)));
      }
      if (baseRef.kcal > 0) {
        setKcal(String(Math.round(baseRef.kcal * preset.value)));
      }
    } else if (preset.mode === "grams") {
      const targetG = preset.value;
      setAmountUnit("г");
      setAmountValue(String(targetG));
      setGrams(String(targetG));
      if (baseRef.grams > 0 && baseRef.kcal > 0) {
        setKcal(String(Math.round((baseRef.kcal * targetG) / baseRef.grams)));
      }
    }
  };

  const handleUnitChange = (nextUnit) => {
    const prevUnit = amountUnit;
    setAmountUnit(nextUnit);

    if (nextUnit === "г" || nextUnit === "мл") {
      const g = Number(grams) || baseRef.grams || 200;
      setAmountValue(String(Math.round(g)));
      setGrams(String(Math.round(g)));
    } else if (prevUnit === "г" || prevUnit === "мл") {
      const g = Number(grams) || baseRef.grams || 200;
      const ratio = baseRef.grams > 0 ? g / baseRef.grams : 1;
      const count = Math.max(0.25, round1((baseRef.amountValue || 1) * ratio));
      setAmountValue(formatAmountNumber(count));
    }
  };

  const handleGramsManualChange = (raw) => {
    setGrams(raw);
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return;
    if (amountUnit === "г" || amountUnit === "мл") {
      setAmountValue(String(Math.round(num)));
    }
    if (baseRef.grams > 0 && baseRef.kcal > 0) {
      setKcal(String(Math.round((baseRef.kcal * num) / baseRef.grams)));
    }
  };

  const handleStep = (direction) => {
    const step = stepForUnit(amountUnit);
    const min = minForUnit(amountUnit);
    const current = Number(amountValue) || 0;
    const next = Math.max(min, round1(current + direction * step));
    rescaleByAmount(next, amountUnit);
  };

  const handleToggleQuickNote = (chipText) => {
    const trimmed = note.trim();
    if (!trimmed) {
      setNote(chipText);
      return;
    }
    const lower = trimmed.toLowerCase();
    if (lower.includes(chipText.toLowerCase())) {
      const parts = trimmed
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.toLowerCase() !== chipText.toLowerCase());
      setNote(parts.join(", "));
    } else {
      setNote(`${trimmed}, ${chipText.toLowerCase()}`);
    }
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const cleanName = dishName.trim();
    if (!cleanName) {
      setError("Выберите блюдо из меню или введите название.");
      return;
    }

    const parsedAmount = Number(String(amountValue).replace(",", "."));
    const safeAmount =
      Number.isFinite(parsedAmount) && parsedAmount > 0
        ? Math.min(10000, parsedAmount)
        : 1;
    const parsedGrams =
      grams === ""
        ? null
        : Math.min(10000, Math.max(0, Math.round(Number(grams))));
    const parsedKcal =
      kcal === ""
        ? null
        : Math.min(15000, Math.max(0, Math.round(Number(kcal))));
    const cleanTime = (eatenAt || nowTimeHHMM()).trim().slice(0, 5);

    setSubmitting(true);
    setError("");
    try {
      let linkedMenuId = selectedMenuItem?.id ?? null;

      if (
        sourceMode === "custom" &&
        saveCustomToMenu &&
        !isEditing &&
        onSaveToMenu
      ) {
        try {
          const created = await onSaveToMenu({
            name: cleanName,
            meal_slot: mealSlot,
            default_portion: `${formatAmountNumber(safeAmount)} ${amountUnit}`,
            default_grams: parsedGrams && parsedGrams > 0 ? parsedGrams : 200,
            kcal: parsedKcal && parsedKcal >= 0 ? parsedKcal : 0,
            category: MEAL_SLOT_MAP[mealSlot]?.label || "Свои блюда",
            is_favorite: false,
          });
          if (created?.id) linkedMenuId = created.id;
        } catch {
          // Optional catalog save failure should not block meal logging
        }
      }

      const payload = {
        log_date: selectedDate,
        meal_slot: mealSlot,
        menu_item_id: linkedMenuId,
        dish_name: cleanName,
        amount_value: safeAmount,
        amount_unit: amountUnit || "порция",
        grams:
          parsedGrams !== null &&
          Number.isFinite(parsedGrams) &&
          parsedGrams >= 0
            ? parsedGrams
            : null,
        eaten_at: cleanTime,
        kcal:
          parsedKcal !== null && Number.isFinite(parsedKcal) && parsedKcal >= 0
            ? parsedKcal
            : null,
        note: note.trim(),
        completed,
      };

      await onSaveMeal?.(payload, editingMeal?.id || null);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось сохранить приём пищи.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingMeal?.id || !onDeleteMeal) return;
    setDeleting(true);
    setError("");
    try {
      await onDeleteMeal(editingMeal);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось удалить запись.");
    } finally {
      setDeleting(false);
    }
  };

  const slotLabel = MEAL_SLOT_MAP[mealSlot]?.label || "Приём пищи";
  const showDetailForm =
    sourceMode === "custom" ||
    Boolean(selectedMenuItem) ||
    isEditing ||
    !showCatalogList;

  const isPresetActive = (preset) => {
    if (preset.mode === "grams") {
      return amountUnit === "г" && Math.round(Number(grams)) === preset.value;
    }
    if (amountUnit === "г" || amountUnit === "мл") return false;
    const target = round1((baseRef.amountValue || 1) * preset.value);
    return Math.abs((Number(amountValue) || 0) - target) < 0.05;
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редактировать блюдо" : `Добавить · ${slotLabel}`}
      footer={
        <div className="mt-row" style={{ width: "100%" }}>
          {isEditing && onDeleteMeal ? (
            <button
              type="button"
              className="mt-btn mt-btn--danger"
              disabled={submitting || deleting}
              onClick={handleDelete}
              aria-label="Удалить блюдо из рациона"
            >
              <Trash2 size={17} />
            </button>
          ) : null}
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            disabled={submitting || deleting || !dishName.trim()}
            onClick={handleSubmit}
          >
            <Check size={18} />
            <span>
              {submitting
                ? "Сохраняем..."
                : isEditing
                  ? "Сохранить"
                  : completed
                    ? "Записать в рацион"
                    : "Добавить в план"}
            </span>
          </button>
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        {/* 1. Meal slot selector */}
        <div className="mt-chip-row" role="group" aria-label="Приём пищи">
          {MEAL_SLOTS.map((slot) => (
            <Pill
              key={slot.key}
              tone="cobalt"
              active={mealSlot === slot.key}
              onClick={() => {
                setMealSlot(slot.key);
                if (!isEditing && !selectedMenuItem) {
                  setEatenAt(slot.defaultTime);
                }
              }}
            >
              {slot.label}
            </Pill>
          ))}
        </div>

        {/* 2. Mode switch: From Menu vs Custom Dish */}
        <SegmentedControl
          value={sourceMode}
          onChange={(mode) => {
            setSourceMode(mode);
            if (mode === "menu") {
              setShowCatalogList(!selectedMenuItem);
            } else {
              setSelectedMenuItem(null);
              setShowCatalogList(false);
            }
          }}
          options={[
            { value: "menu", label: "Из меню", count: menuItems.length },
            { value: "custom", label: "Своё блюдо" },
          ]}
        />

        {/* 3. Menu Picker List */}
        {sourceMode === "menu" && (
          <div className="mt-stack mt-stack--sm">
            {selectedMenuItem && !showCatalogList ? (
              <GroupList>
                <div className="mt-list-row">
                  <div className="mt-list-body">
                    <span className="mt-list-title">{selectedMenuItem.name}</span>
                    <span className="mt-list-meta tabular">
                      {[
                        selectedMenuItem.default_grams
                          ? `${selectedMenuItem.default_grams} г`
                          : null,
                        selectedMenuItem.default_portion || null,
                        selectedMenuItem.kcal
                          ? `${selectedMenuItem.kcal} ккал`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="mt-list-trailing">
                    <button
                      type="button"
                      className="mt-btn mt-btn--secondary mt-btn--sm"
                      onClick={() => setShowCatalogList(true)}
                    >
                      Другое
                    </button>
                  </div>
                </div>
              </GroupList>
            ) : (
              <div className="mt-stack mt-stack--sm">
                <div style={{ position: "relative" }}>
                  <Search
                    size={16}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: "13px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--muted)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="search"
                    className="mt-input"
                    style={{ paddingLeft: "38px" }}
                    placeholder="Поиск: овсянка, лосось, суп..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="mt-chip-row">
                  <Pill
                    tone="cobalt"
                    active={menuFilter === "slot"}
                    onClick={() => setMenuFilter("slot")}
                  >
                    На {slotLabel.toLowerCase()}
                  </Pill>
                  <Pill
                    tone="cobalt"
                    active={menuFilter === "favorites"}
                    icon={<Star size={13} />}
                    onClick={() => setMenuFilter("favorites")}
                  >
                    Избранное
                  </Pill>
                  <Pill
                    tone="cobalt"
                    active={menuFilter === "all"}
                    onClick={() => setMenuFilter("all")}
                  >
                    Всё меню
                  </Pill>
                </div>

                {filteredMenu.length === 0 ? (
                  <EmptyState
                    icon={<UtensilsCrossed size={20} />}
                    title="В меню не нашлось"
                    description="Переключите фильтр на «Всё меню» или запишите своё блюдо."
                    action={
                      <button
                        type="button"
                        className="mt-btn mt-btn--soft mt-btn--sm"
                        onClick={() => {
                          setSourceMode("custom");
                          if (searchQuery.trim()) setDishName(searchQuery.trim());
                        }}
                      >
                        Записать своё блюдо
                      </button>
                    }
                  />
                ) : (
                  <GroupList
                    className="nutrition-picker-list"
                  >
                    <div
                      style={{
                        maxHeight: "280px",
                        overflowY: "auto",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      {filteredMenu.map((item, idx) => {
                        const isChosen = selectedMenuItem?.id === item.id;
                        const metaText = [
                          item.default_grams
                            ? `${item.default_grams} г`
                            : null,
                          item.default_portion || null,
                          item.kcal ? `${item.kcal} ккал` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="mt-list-row mt-list-row--clickable"
                            style={{
                              width: "100%",
                              borderTop:
                                idx > 0
                                  ? "1px solid var(--divider, var(--border-subtle))"
                                  : "none",
                              background: isChosen
                                ? "var(--cobalt-soft)"
                                : "transparent",
                            }}
                            onClick={() => handleSelectMenuDish(item)}
                          >
                            <span className="mt-list-body">
                              <span className="mt-list-title">
                                {item.name}
                                {item.is_favorite ? (
                                  <Star
                                    size={12}
                                    fill="var(--cobalt)"
                                    color="var(--cobalt)"
                                    aria-label="Избранное"
                                    style={{
                                      display: "inline-block",
                                      verticalAlign: "-1px",
                                      marginLeft: "5px",
                                    }}
                                  />
                                ) : null}
                              </span>
                              {metaText ? (
                                <span className="mt-list-meta tabular">
                                  {metaText}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className="mt-list-trailing"
                              style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "var(--cobalt)",
                              }}
                            >
                              Выбрать
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </GroupList>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. Dish Name, Portion Scaling, Time & Note */}
        {showDetailForm && (
          <div className="mt-stack">
            <div className="mt-field">
              <label className="mt-label" htmlFor="meal-dish-name">
                Что съела
              </label>
              <input
                id="meal-dish-name"
                type="text"
                className="mt-input"
                placeholder="Например: скрэмбл с авокадо"
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                required
              />
            </div>

            {/* Portion controls */}
            <div className="mt-stack mt-stack--sm">
              <div className="mt-row mt-row--between">
                <span className="mt-label">Сколько съела</span>
                <StepperPill
                  value={amountValue || "0"}
                  unit={amountUnit}
                  min={minForUnit(amountUnit)}
                  max={5000}
                  onDecrement={() => handleStep(-1)}
                  onIncrement={() => handleStep(1)}
                  label="Изменить размер порции"
                />
              </div>

              <div className="mt-chip-row">
                {PORTION_PRESETS.map((preset) => (
                  <Pill
                    key={preset.key}
                    tone="cobalt"
                    active={isPresetActive(preset)}
                    onClick={() => handleApplyPortionPreset(preset)}
                  >
                    {preset.label}
                  </Pill>
                ))}
              </div>

              <div className="mt-form-grid">
                <div className="mt-field">
                  <label className="mt-label" htmlFor="meal-amount-val">
                    Количество
                  </label>
                  <input
                    id="meal-amount-val"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0.1"
                    className="mt-input tabular"
                    value={amountValue}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setAmountValue(raw);
                      const num = Number(raw.replace(",", "."));
                      if (Number.isFinite(num) && num > 0) {
                        rescaleByAmount(num, amountUnit);
                      }
                    }}
                  />
                </div>
                <div className="mt-field">
                  <label className="mt-label" htmlFor="meal-amount-unit">
                    Единица
                  </label>
                  <SelectField
                    id="meal-amount-unit"
                    compact
                    value={amountUnit}
                    onChange={handleUnitChange}
                    options={unitOptions.map((u) => ({
                      value: u.key,
                      label: u.label,
                    }))}
                    ariaLabel="Единица измерения"
                  />
                </div>
              </div>

              <div className="mt-form-grid">
                <div className="mt-field">
                  <label className="mt-label" htmlFor="meal-grams">
                    Вес (г / мл)
                  </label>
                  <input
                    id="meal-grams"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    className="mt-input tabular"
                    placeholder="220"
                    value={grams}
                    onChange={(e) => handleGramsManualChange(e.target.value)}
                  />
                </div>
                <div className="mt-field">
                  <label className="mt-label" htmlFor="meal-kcal">
                    Калории (ккал)
                  </label>
                  <input
                    id="meal-kcal"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    className="mt-input tabular"
                    placeholder="320"
                    value={kcal}
                    onChange={(e) => setKcal(e.target.value)}
                  />
                </div>
              </div>

              {scaledMacros &&
              (scaledMacros.protein > 0 ||
                scaledMacros.fat > 0 ||
                scaledMacros.carbs > 0) ? (
                <MetricStrip
                  items={[
                    {
                      key: "p",
                      value: `${scaledMacros.protein} г`,
                      label: "Белки",
                    },
                    {
                      key: "f",
                      value: `${scaledMacros.fat} г`,
                      label: "Жиры",
                    },
                    {
                      key: "c",
                      value: `${scaledMacros.carbs} г`,
                      label: "Углеводы",
                    },
                  ]}
                />
              ) : null}
            </div>

            {/* Time of eating */}
            <div className="mt-field">
              <label className="mt-label" htmlFor="meal-eaten-at">
                Во сколько съела
              </label>
              <div className="mt-input-row">
                <input
                  id="meal-eaten-at"
                  type="time"
                  className="mt-input tabular"
                  value={eatenAt}
                  onChange={(e) => setEatenAt(e.target.value)}
                />
                <button
                  type="button"
                  className="mt-btn mt-btn--soft"
                  onClick={() => setEatenAt(nowTimeHHMM())}
                >
                  <Clock size={16} />
                  <span>Сейчас</span>
                </button>
              </div>
              <div className="mt-chip-row">
                {slotQuickTimes.map((t) => (
                  <Pill
                    key={t}
                    tone="cobalt"
                    active={eatenAt === t}
                    onClick={() => setEatenAt(t)}
                  >
                    {t}
                  </Pill>
                ))}
              </div>
            </div>

            {/* Eaten vs Planned status */}
            <div className="mt-field">
              <span className="mt-label">Статус</span>
              <SegmentedControl
                value={completed ? "eaten" : "planned"}
                onChange={(val) => setCompleted(val === "eaten")}
                options={[
                  { value: "eaten", label: "Уже съела" },
                  { value: "planned", label: "В плане" },
                ]}
              />
            </div>

            {/* Optional Note + quick chips */}
            <div className="mt-field">
              <label className="mt-label" htmlFor="meal-note">
                Заметка
              </label>
              <input
                id="meal-note"
                type="text"
                className="mt-input"
                placeholder="Например: без сахара, домашнее"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-chip-row">
                {NUTRITION_QUICK_NOTES.map((chip) => {
                  const active = note
                    .toLowerCase()
                    .includes(chip.toLowerCase());
                  return (
                    <Pill
                      key={chip}
                      tone="cobalt"
                      active={active}
                      onClick={() => handleToggleQuickNote(chip)}
                    >
                      {chip}
                    </Pill>
                  );
                })}
              </div>
            </div>

            {sourceMode === "custom" && !isEditing && onSaveToMenu ? (
              <label
                className="mt-row"
                style={{
                  minHeight: "44px",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "var(--ink-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={saveCustomToMenu}
                  onChange={(e) => setSaveCustomToMenu(e.target.checked)}
                  style={{
                    width: "20px",
                    height: "20px",
                    accentColor: "var(--cobalt)",
                  }}
                />
                <span>Сохранить блюдо в «Меню»</span>
              </label>
            ) : null}
          </div>
        )}

        {error ? <div className="mt-form-error">{error}</div> : null}
      </form>
    </Sheet>
  );
}
