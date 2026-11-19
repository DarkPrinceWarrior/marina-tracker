import React, { useEffect, useMemo, useState } from "react";
import {
  Apple,
  BookOpen,
  Check,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import Sheet from "../Sheet.jsx";
import { EmptyState, Pill } from "../UiPrimitives.jsx";
import { MEAL_SLOTS, MEAL_SLOT_MAP } from "../../data/presets.js";
import { formatCountRu } from "../../utils/date.js";

const SLOT_ICONS = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Sunset,
  snack: Apple,
};

const MENU_CATEGORY_PRESETS = [
  "Завтраки",
  "Основные блюда",
  "Супы",
  "Салаты и боулы",
  "Ужин",
  "Перекусы",
  "Напитки",
];

function normalizeText(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

export function inferShoppingCategory(item) {
  const hay = normalizeText(`${item?.category || ""} ${item?.name || ""}`);
  if (/(матча|чай|кофе|напит|смузи|латте)/.test(hay)) return "Напитки и чай";
  if (/(лосос|дорадо|рыб|индейк|курин|кревет|тунец|мяс|филе)/.test(hay)) {
    return "Белок и рыба";
  }
  if (/(творог|сырник|йогурт|кефир|молок|сыр|омлет|яиц|яйц|фет)/.test(hay)) {
    return "Молочное";
  }
  if (/(салат|боул|овощ|яблок|груш|ягод|манго|тыкв|кабач|хумус|авокад|шпинат)/.test(hay)) {
    return "Овощи и фрукты";
  }
  if (/(овсян|киноа|гречк|гранол|круп|рис|паст|хлеб|тост)/.test(hay)) {
    return "Бакалея";
  }
  return "Другое";
}

export function MenuItemFormSheet({
  open = false,
  onClose,
  editingItem = null,
  defaultSlot = "breakfast",
  onSave,
  onDelete,
}) {
  const isEditing = Boolean(editingItem?.id);

  const [name, setName] = useState("");
  const [mealSlot, setMealSlot] = useState(defaultSlot || "breakfast");
  const [category, setCategory] = useState("Завтраки");
  const [defaultPortion, setDefaultPortion] = useState("1 порция");
  const [defaultGrams, setDefaultGrams] = useState("220");
  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [fatG, setFatG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubmitting(false);
    setDeleting(false);

    if (editingItem) {
      setName(editingItem.name || "");
      setMealSlot(editingItem.meal_slot || "breakfast");
      setCategory(editingItem.category || "Свои блюда");
      setDefaultPortion(editingItem.default_portion || "1 порция");
      setDefaultGrams(
        editingItem.default_grams != null ? String(editingItem.default_grams) : "",
      );
      setKcal(editingItem.kcal != null ? String(editingItem.kcal) : "");
      setProteinG(
        editingItem.protein_g != null && editingItem.protein_g > 0
          ? String(editingItem.protein_g)
          : "",
      );
      setFatG(
        editingItem.fat_g != null && editingItem.fat_g > 0
          ? String(editingItem.fat_g)
          : "",
      );
      setCarbsG(
        editingItem.carbs_g != null && editingItem.carbs_g > 0
          ? String(editingItem.carbs_g)
          : "",
      );
      setIsFavorite(Boolean(editingItem.is_favorite));
      return;
    }

    const slot = defaultSlot || "breakfast";
    setName("");
    setMealSlot(slot);
    setCategory(
      slot === "breakfast"
        ? "Завтраки"
        : slot === "lunch"
          ? "Основные блюда"
          : slot === "dinner"
            ? "Ужин"
            : "Перекусы",
    );
    setDefaultPortion("1 порция");
    setDefaultGrams("220");
    setKcal("");
    setProteinG("");
    setFatG("");
    setCarbsG("");
    setIsFavorite(true);
  }, [open, editingItem, defaultSlot]);

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Введите название блюда.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = {
        name: cleanName,
        meal_slot: mealSlot || "any",
        category: category.trim() || "Свои блюда",
        default_portion: defaultPortion.trim() || "1 порция",
        default_grams:
          defaultGrams !== "" && Number.isFinite(Number(defaultGrams))
            ? Math.min(5000, Math.max(0, Math.round(Number(defaultGrams))))
            : 200,
        kcal:
          kcal !== "" && Number.isFinite(Number(kcal))
            ? Math.min(10000, Math.max(0, Math.round(Number(kcal))))
            : 0,
        protein_g:
          proteinG !== "" && Number.isFinite(Number(proteinG))
            ? Math.min(1000, Math.max(0, Number(proteinG)))
            : 0,
        fat_g:
          fatG !== "" && Number.isFinite(Number(fatG))
            ? Math.min(1000, Math.max(0, Number(fatG)))
            : 0,
        carbs_g:
          carbsG !== "" && Number.isFinite(Number(carbsG))
            ? Math.min(1000, Math.max(0, Number(carbsG)))
            : 0,
        is_favorite: isFavorite,
      };
      await onSave?.(payload, editingItem?.id || null);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось сохранить блюдо в меню.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem?.id || !onDelete) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(editingItem);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось удалить блюдо.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редактировать блюдо" : "Новое блюдо в меню"}
      subtitle="Сохраните любимый рецепт для быстрого добавления в рацион"
      footer={
        <div className="mt-row" style={{ width: "100%" }}>
          {isEditing && onDelete ? (
            <button
              type="button"
              className="mt-btn mt-btn--danger"
              disabled={submitting || deleting}
              onClick={handleDelete}
              aria-label="Удалить блюдо из меню"
            >
              <Trash2 size={17} />
            </button>
          ) : null}
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            data-accent="nutrition"
            disabled={submitting || deleting || !name.trim()}
            onClick={handleSubmit}
          >
            <Check size={18} />
            <span>
              {submitting
                ? "Сохраняем..."
                : isEditing
                  ? "Сохранить изменения"
                  : "Добавить в меню"}
            </span>
          </button>
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        <div className="mt-field">
          <label className="mt-label" htmlFor="menu-dish-name">
            Название блюда или рецепта
          </label>
          <input
            id="menu-dish-name"
            type="text"
            className="mt-input"
            placeholder="Например: Киноа с авокадо и яйцом пашот"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="mt-field">
          <span className="mt-label">Для какого приёма пищи</span>
          <div className="mt-chip-row">
            {MEAL_SLOTS.map((slot) => (
              <Pill
                key={slot.key}
                tone="nutrition"
                active={mealSlot === slot.key}
                onClick={() => setMealSlot(slot.key)}
              >
                {slot.label}
              </Pill>
            ))}
            <Pill
              tone="neutral"
              active={mealSlot === "any"}
              onClick={() => setMealSlot("any")}
            >
              Любой
            </Pill>
          </div>
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="menu-dish-category">
            Категория
          </label>
          <input
            id="menu-dish-category"
            type="text"
            className="mt-input"
            placeholder="Например: Завтраки"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <div className="mt-chip-row">
            {MENU_CATEGORY_PRESETS.map((cat) => (
              <Pill
                key={cat}
                tone="neutral"
                active={category === cat}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </Pill>
            ))}
          </div>
        </div>

        <div className="mt-form-grid">
          <div className="mt-field">
            <label className="mt-label" htmlFor="menu-default-portion">
              Порция по умолчанию
            </label>
            <input
              id="menu-default-portion"
              type="text"
              className="mt-input"
              placeholder="1 порция"
              value={defaultPortion}
              onChange={(e) => setDefaultPortion(e.target.value)}
            />
          </div>
          <div className="mt-field">
            <label className="mt-label" htmlFor="menu-default-grams">
              Вес порции (г)
            </label>
            <input
              id="menu-default-grams"
              type="number"
              inputMode="numeric"
              min="0"
              className="mt-input tabular"
              placeholder="220"
              value={defaultGrams}
              onChange={(e) => setDefaultGrams(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="menu-kcal">
            Калорийность порции (ккал)
          </label>
          <input
            id="menu-kcal"
            type="number"
            inputMode="numeric"
            min="0"
            className="mt-input tabular"
            placeholder="320"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
          />
        </div>

        <div className="mt-field">
          <span className="mt-label">Б / Ж / У на порцию (по желанию, г)</span>
          <div className="nutrition-macros-row">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              className="mt-input tabular"
              placeholder="Белки"
              aria-label="Белки (г)"
              value={proteinG}
              onChange={(e) => setProteinG(e.target.value)}
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              className="mt-input tabular"
              placeholder="Жиры"
              aria-label="Жиры (г)"
              value={fatG}
              onChange={(e) => setFatG(e.target.value)}
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              className="mt-input tabular"
              placeholder="Углеводы"
              aria-label="Углеводы (г)"
              value={carbsG}
              onChange={(e) => setCarbsG(e.target.value)}
            />
          </div>
        </div>

        <label
          className="mt-row"
          style={{
            minHeight: "44px",
            cursor: "pointer",
            fontSize: "14.5px",
            color: "var(--ink)",
          }}
        >
          <input
            type="checkbox"
            checked={isFavorite}
            onChange={(e) => setIsFavorite(e.target.checked)}
            style={{ width: "20px", height: "20px", accentColor: "var(--nutrition)" }}
          />
          <Star
            size={16}
            fill={isFavorite ? "var(--nutrition)" : "none"}
            color="var(--nutrition)"
          />
          <span>Отметить как избранное блюдо</span>
        </label>

        {error ? <div className="mt-form-error">{error}</div> : null}
      </form>
    </Sheet>
  );
}

export default function MenuCatalogView({
  menuItems = [],
  loading = false,
  selectedDateLabel = "сегодня",
  onQuickAddToDay,
  onCustomizeAndAdd,
  onAddToShopping,
  onToggleFavorite,
  onSaveMenuItem,
  onDeleteMenuItem,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [slotFilter, setSlotFilter] = useState("all"); // "all" | "favorites" | "breakfast" | "lunch" | "dinner" | "snack"
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [busyAddId, setBusyAddId] = useState(null);
  const [busyShopId, setBusyShopId] = useState(null);
  const [addedShopIds, setAddedShopIds] = useState({});

  const filteredItems = useMemo(() => {
    const q = normalizeText(searchQuery);
    return menuItems.filter((item) => {
      if (slotFilter === "favorites" && !item.is_favorite) return false;
      if (
        slotFilter !== "all" &&
        slotFilter !== "favorites" &&
        item.meal_slot !== slotFilter &&
        item.meal_slot !== "any"
      ) {
        return false;
      }
      if (q) {
        const hay = normalizeText(`${item.name} ${item.category || ""}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [menuItems, searchQuery, slotFilter]);

  const groupedSections = useMemo(() => {
    const groups = MEAL_SLOTS.map((slot) => ({
      ...slot,
      items: filteredItems.filter((item) => item.meal_slot === slot.key),
    }));
    const anyItems = filteredItems.filter(
      (item) => !item.meal_slot || item.meal_slot === "any" || !MEAL_SLOT_MAP[item.meal_slot],
    );
    if (anyItems.length > 0) {
      groups.push({
        key: "any",
        label: "Универсальные блюда",
        window: "в любое время",
        items: anyItems,
      });
    }
    return groups.filter((g) => g.items.length > 0);
  }, [filteredItems]);

  const handleQuickAdd = async (item) => {
    if (!onQuickAddToDay) return;
    setBusyAddId(item.id);
    try {
      await onQuickAddToDay(item);
    } finally {
      setBusyAddId(null);
    }
  };

  const handleShopClick = async (item) => {
    if (!onAddToShopping) return;
    setBusyShopId(item.id);
    try {
      await onAddToShopping(item);
      setAddedShopIds((prev) => ({ ...prev, [item.id]: true }));
      window.setTimeout(() => {
        setAddedShopIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }, 2200);
    } finally {
      setBusyShopId(null);
    }
  };

  const openCreateForm = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const openEditForm = (item) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const defaultSlotForNew =
    slotFilter === "breakfast" ||
    slotFilter === "lunch" ||
    slotFilter === "dinner" ||
    slotFilter === "snack"
      ? slotFilter
      : "breakfast";

  return (
    <div className="mt-stack">
      {/* Search + Add recipe header card */}
      <div className="mt-card mt-card--compact" data-accent="nutrition">
        <div className="mt-row mt-row--between">
          <div className="mt-stack mt-stack--xs">
            <h2 className="mt-card-title" style={{ fontSize: "16px" }}>
              Личное меню блюд
            </h2>
            <p className="mt-card-sub" style={{ marginTop: 0 }}>
              {formatCountRu(menuItems.length, "блюдо", "блюда", "блюд")} · быстрое добавление в рацион и покупки
            </p>
          </div>
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--sm"
            data-accent="nutrition"
            onClick={openCreateForm}
          >
            <Plus size={16} />
            <span>Рецепт</span>
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <Search
            size={17}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "13px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--subtle)",
              pointerEvents: "none",
            }}
          />
          <input
            type="search"
            className="mt-input"
            style={{ paddingLeft: "38px" }}
            placeholder="Поиск: лосось, сырники, суп..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="mt-chip-row" role="group" aria-label="Фильтр меню">
          <Pill
            tone="nutrition"
            active={slotFilter === "all"}
            onClick={() => setSlotFilter("all")}
          >
            Все ({menuItems.length})
          </Pill>
          <Pill
            tone="nutrition"
            active={slotFilter === "favorites"}
            icon={<Star size={13} />}
            onClick={() => setSlotFilter("favorites")}
          >
            Избранное
          </Pill>
          {MEAL_SLOTS.map((slot) => (
            <Pill
              key={slot.key}
              tone="nutrition"
              active={slotFilter === slot.key}
              onClick={() => setSlotFilter(slot.key)}
            >
              {slot.label}
            </Pill>
          ))}
        </div>
      </div>

      {/* Grouped menu catalog */}
      {loading && menuItems.length === 0 ? (
        <div className="mt-card">
          <div className="mt-skeleton" style={{ height: "20px", width: "45%" }} />
          <div className="mt-skeleton" style={{ height: "74px", width: "100%" }} />
          <div className="mt-skeleton" style={{ height: "74px", width: "100%" }} />
        </div>
      ) : groupedSections.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={24} />}
          title="В меню пока пусто по этому фильтру"
          description="Сбросьте поиск или добавьте своё любимое блюдо в личный каталог."
          action={
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              data-accent="nutrition"
              onClick={openCreateForm}
            >
              <Plus size={16} />
              <span>Добавить блюдо в меню</span>
            </button>
          }
        />
      ) : (
        groupedSections.map((group) => {
          const SlotIcon = SLOT_ICONS[group.key] || UtensilsCrossed;
          return (
            <section
              key={group.key}
              className="menu-catalog-card"
              data-accent="nutrition"
              aria-label={`Меню: ${group.label}`}
            >
              <div className="nutrition-slot-head">
                <div className="mt-row" style={{ gap: "8px" }}>
                  <span
                    className="mt-pill mt-pill--nutrition"
                    style={{ padding: "5px 8px" }}
                    aria-hidden="true"
                  >
                    <SlotIcon size={15} />
                  </span>
                  <div>
                    <h3 className="mt-card-title">{group.label}</h3>
                    <span className="nutrition-slot-window">
                      {formatCountRu(group.items.length, "блюдо", "блюда", "блюд")}
                      {group.window ? ` · ${group.window}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-stack mt-stack--sm">
                {group.items.map((item) => {
                  const isAdding = busyAddId === item.id;
                  const isShopping = busyShopId === item.id;
                  const shopDone = Boolean(addedShopIds[item.id]);
                  const hasMacros =
                    (item.protein_g || 0) > 0 ||
                    (item.fat_g || 0) > 0 ||
                    (item.carbs_g || 0) > 0;

                  return (
                    <article
                      key={item.id}
                      className="menu-catalog-item"
                      style={{
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: "10px",
                      }}
                    >
                      <div
                        className="mt-row mt-row--between"
                        style={{ alignItems: "flex-start", gap: "8px" }}
                      >
                        <div className="mt-stack mt-stack--xs" style={{ flex: 1 }}>
                          <strong
                            style={{
                              fontSize: "14.5px",
                              lineHeight: "20px",
                              color: "var(--ink)",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {item.name}
                          </strong>
                          <div className="mt-row mt-row--wrap" style={{ gap: "6px" }}>
                            {item.default_grams ? (
                              <span className="nutrition-amount-badge">
                                {item.default_grams} г
                                {item.default_portion ? ` · ${item.default_portion}` : ""}
                              </span>
                            ) : item.default_portion ? (
                              <span className="nutrition-amount-badge">
                                {item.default_portion}
                              </span>
                            ) : null}
                            {item.kcal > 0 ? (
                              <span className="nutrition-kcal-badge">
                                {item.kcal} ккал
                              </span>
                            ) : null}
                          </div>
                          {hasMacros ? (
                            <span
                              className="muted tabular"
                              style={{ fontSize: "12px", lineHeight: "16px" }}
                            >
                              Б {item.protein_g || 0} г · Ж {item.fat_g || 0} г · У{" "}
                              {item.carbs_g || 0} г
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-row" style={{ gap: "2px", flexShrink: 0 }}>
                          <button
                            type="button"
                            className="mt-icon-btn"
                            aria-label={
                              item.is_favorite
                                ? "Убрать из избранного"
                                : "Добавить в избранное"
                            }
                            aria-pressed={Boolean(item.is_favorite)}
                            onClick={() => onToggleFavorite?.(item)}
                          >
                            <Star
                              size={18}
                              fill={item.is_favorite ? "var(--nutrition)" : "none"}
                              color={
                                item.is_favorite ? "var(--nutrition)" : "var(--subtle)"
                              }
                            />
                          </button>
                          <button
                            type="button"
                            className="mt-icon-btn"
                            aria-label={`Редактировать «${item.name}»`}
                            onClick={() => openEditForm(item)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-row" style={{ gap: "6px" }}>
                        <button
                          type="button"
                          className="mt-btn mt-btn--soft mt-btn--sm"
                          data-accent="nutrition"
                          style={{ flex: 1, minWidth: 0 }}
                          disabled={isAdding}
                          onClick={() => handleQuickAdd(item)}
                        >
                          <Plus size={15} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {isAdding
                              ? "Добавляем..."
                              : selectedDateLabel === "сегодня"
                                ? "В сегодня"
                                : `На ${selectedDateLabel}`}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="mt-btn mt-btn--secondary mt-btn--sm"
                          disabled={isShopping}
                          onClick={() => handleShopClick(item)}
                          aria-label={`Добавить «${item.name}» в покупки`}
                        >
                          {shopDone ? (
                            <Check size={15} color="var(--success)" />
                          ) : (
                            <ShoppingBag size={15} />
                          )}
                          <span>{shopDone ? "В покупках" : "В покупки"}</span>
                        </button>

                        {onCustomizeAndAdd ? (
                          <button
                            type="button"
                            className="mt-icon-btn mt-icon-btn--bordered"
                            aria-label={`Настроить порцию и время для «${item.name}»`}
                            title="Выбрать порцию и время"
                            onClick={() => onCustomizeAndAdd(item)}
                          >
                            <SlidersHorizontal size={16} />
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {/* Bottom CTA for adding own dish */}
      <button
        type="button"
        className="mt-btn mt-btn--secondary mt-btn--wide"
        onClick={openCreateForm}
      >
        <Plus size={17} />
        <span>Добавить свой рецепт или блюдо в меню</span>
      </button>

      <MenuItemFormSheet
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        defaultSlot={defaultSlotForNew}
        onSave={onSaveMenuItem}
        onDelete={onDeleteMenuItem}
      />
    </div>
  );
}

export function MenuCatalogSheet({
  open = false,
  onClose,
  ...catalogProps
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Меню блюд"
      subtitle="Выберите блюдо для рациона или добавьте в покупки"
    >
      <MenuCatalogView {...catalogProps} />
    </Sheet>
  );
}
