import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Trash2,
} from "lucide-react";
import Sheet from "../Sheet.jsx";
import {
  CheckField,
  EmptyState,
  GroupHeader,
  GroupList,
  Pill,
} from "../UiPrimitives.jsx";
import DishPhotoCard from "./DishPhotoCard.jsx";
import PhotoPickerField from "./PhotoPickerField.jsx";
import { MEAL_SLOTS, MEAL_SLOT_MAP } from "../../data/presets.js";
import { formatCountRu } from "../../utils/date.js";

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
  if (/(матча|чай|кофе|напит|смузи|латте|перекус|миндал|орех)/.test(hay)) {
    return "Напитки и перекусы";
  }
  if (/(лосос|дорадо|рыб|индейк|курин|кревет|тунец|мяс|филе)/.test(hay)) {
    return "Белок и рыба";
  }
  if (/(творог|сырник|йогурт|кефир|молок|сыр|омлет|яиц|яйц|фет)/.test(hay)) {
    return "Молочное";
  }
  if (
    /(салат|боул|овощ|яблок|груш|ягод|манго|тыкв|кабач|хумус|авокад|шпинат)/.test(
      hay,
    )
  ) {
    return "Овощи и фрукты";
  }
  if (/(овсян|киноа|гречк|гранол|круп|рис|паст|хлеб|тост)/.test(hay)) {
    return "Бакалея";
  }
  return "Прочее";
}

export function MenuItemFormSheet({
  open = false,
  onClose,
  editingItem = null,
  defaultSlot = "breakfast",
  onSave,
  onDelete,
  onAddToShopping,
  onCustomizeAndAdd,
}) {
  const isEditing = Boolean(editingItem?.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
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
  const [shoppingBusy, setShoppingBusy] = useState(false);
  const [shoppingDone, setShoppingDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubmitting(false);
    setDeleting(false);
    setShoppingBusy(false);
    setShoppingDone(false);

    if (editingItem) {
      setName(editingItem.name || "");
      setDescription(editingItem.description || "");
      setPhotoUrl(editingItem.photo_url || "");
      setMealSlot(editingItem.meal_slot || "breakfast");
      setCategory(editingItem.category || "Свои блюда");
      setDefaultPortion(editingItem.default_portion || "1 порция");
      setDefaultGrams(
        editingItem.default_grams != null
          ? String(editingItem.default_grams)
          : "",
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
    setDescription("");
    setPhotoUrl("");
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
        description: description.trim(),
        photo_url: photoUrl,
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

  const handleAddShopping = async () => {
    if (!editingItem || !onAddToShopping) return;
    setShoppingBusy(true);
    try {
      await onAddToShopping(editingItem);
      setShoppingDone(true);
    } finally {
      setShoppingBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Блюдо из меню" : "Новое блюдо в меню"}
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
            disabled={submitting || deleting || !name.trim()}
            onClick={handleSubmit}
          >
            <Check size={18} />
            <span>
              {submitting
                ? "Сохраняем…"
                : isEditing
                  ? "Сохранить"
                  : "Добавить в меню"}
            </span>
          </button>
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        {/* Quick actions when viewing/editing an existing menu dish */}
        {isEditing && (onAddToShopping || onCustomizeAndAdd) ? (
          <div className="mt-grid-2">
            {onCustomizeAndAdd ? (
              <button
                type="button"
                className="mt-btn mt-btn--soft mt-btn--sm"
                onClick={() => {
                  onClose?.();
                  onCustomizeAndAdd(editingItem);
                }}
              >
                <SlidersHorizontal size={15} />
                <span>В рацион</span>
              </button>
            ) : null}
            {onAddToShopping ? (
              <button
                type="button"
                className="mt-btn mt-btn--secondary mt-btn--sm"
                disabled={shoppingBusy}
                onClick={handleAddShopping}
              >
                {shoppingDone ? (
                  <Check size={15} style={{ color: "var(--success)" }} />
                ) : (
                  <ShoppingBag size={15} />
                )}
                <span>{shoppingDone ? "В покупках" : "В покупки"}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        <PhotoPickerField
          label="Фото блюда"
          photoUrl={photoUrl}
          onChange={setPhotoUrl}
          disabled={submitting || deleting}
        />

        <div className="mt-field">
          <label className="mt-label" htmlFor="menu-dish-name">
            Название блюда
          </label>
          <input
            id="menu-dish-name"
            type="text"
            className="mt-input"
            placeholder="Например: киноа с авокадо"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="menu-dish-description">
            Короткое описание
          </label>
          <textarea
            id="menu-dish-description"
            rows={2}
            maxLength={240}
            className="mt-textarea"
            placeholder="Состав или пара слов для карточки…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="mt-field">
          <span className="mt-label">Приём пищи</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {MEAL_SLOTS.map((slot) => (
              <Pill
                key={slot.key}
                tone="cobalt"
                active={mealSlot === slot.key}
                onClick={() => setMealSlot(slot.key)}
              >
                {slot.label}
              </Pill>
            ))}
            <Pill
              tone="cobalt"
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
          <div className="mt-chip-row mt-chip-row--wrap">
            {MENU_CATEGORY_PRESETS.map((cat) => (
              <Pill
                key={cat}
                tone="cobalt"
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
              Порция
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
              Вес (г)
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
            Калорийность (ккал)
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
          <span className="mt-label">Белки / жиры / углеводы (г)</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "8px",
              minWidth: 0,
            }}
          >
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
              placeholder="Углев."
              aria-label="Углеводы (г)"
              value={carbsG}
              onChange={(e) => setCarbsG(e.target.value)}
            />
          </div>
        </div>

        <CheckField
          checked={isFavorite}
          onChange={setIsFavorite}
          label="Избранное блюдо"
          icon={
            <Star
              size={15}
              fill={isFavorite ? "var(--cobalt)" : "none"}
              color={isFavorite ? "var(--cobalt)" : "var(--muted)"}
            />
          }
        />

        {error ? <div className="mt-form-error">{error}</div> : null}
      </form>
    </Sheet>
  );
}

export default function MenuCatalogView({
  menuItems = [],
  loading = false,
  viewMode = "list",
  selectedDateLabel = "сегодня",
  createSignal = 0,
  onConsumeCreateSignal,
  onQuickAddToDay,
  onCustomizeAndAdd,
  onAddToShopping,
  onSaveMenuItem,
  onDeleteMenuItem,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [slotFilter, setSlotFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [busyAddId, setBusyAddId] = useState(null);

  useEffect(() => {
    if (createSignal > 0) {
      setEditingItem(null);
      setFormOpen(true);
      onConsumeCreateSignal?.();
    }
  }, [createSignal, onConsumeCreateSignal]);

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
        const hay = normalizeText(
          `${item.name} ${item.category || ""} ${item.description || ""}`,
        );
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
      (item) =>
        !item.meal_slot ||
        item.meal_slot === "any" ||
        !MEAL_SLOT_MAP[item.meal_slot],
    );
    if (anyItems.length > 0) {
      groups.push({
        key: "any",
        label: "Универсальные",
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
      {/* Clean Search + 1-line filter */}
      <div className="mt-stack mt-stack--sm">
        <div className="mt-search-wrap">
          <span className="mt-search-icon" aria-hidden="true">
            <Search size={16} />
          </span>
          <input
            type="search"
            className="mt-input"
            placeholder="Поиск блюд…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="mt-chip-row" role="group" aria-label="Фильтр меню">
          <Pill
            tone="cobalt"
            active={slotFilter === "all"}
            onClick={() => setSlotFilter("all")}
          >
            Все
          </Pill>
          {MEAL_SLOTS.map((slot) => (
            <Pill
              key={slot.key}
              tone="cobalt"
              active={slotFilter === slot.key}
              onClick={() => setSlotFilter(slot.key)}
            >
              {slot.label}
            </Pill>
          ))}
          <Pill
            tone="cobalt"
            active={slotFilter === "favorites"}
            icon={<Star size={12} />}
            onClick={() => setSlotFilter("favorites")}
          >
            Избранное
          </Pill>
        </div>
      </div>

      {/* Grouped iOS Catalog Lists */}
      {loading && menuItems.length === 0 ? (
        <GroupList>
          <div className="mt-list-row">
            <div className="mt-skeleton" style={{ height: "20px", width: "60%" }} />
          </div>
          <div className="mt-list-row">
            <div className="mt-skeleton" style={{ height: "20px", width: "52%" }} />
          </div>
        </GroupList>
      ) : groupedSections.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="В меню пока пусто"
          description="Сбросьте фильтр или добавьте своё любимое блюдо."
          action={
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              onClick={openCreateForm}
            >
              <Plus size={16} />
              <span>Добавить блюдо</span>
            </button>
          }
        />
      ) : (
        groupedSections.map((group) => (
          <section
            key={group.key}
            className="mt-group-block"
            aria-label={`Меню: ${group.label}`}
          >
            <GroupHeader
              title={group.label}
              meta={formatCountRu(group.items.length, "блюдо", "блюда", "блюд")}
            />
            {viewMode === "cards" ? (
              <div className="dish-grid">
                {group.items.map((item) => {
                  const isAdding = busyAddId === item.id;
                  const weightParts = [];
                  if (item.default_grams) {
                    weightParts.push(`${item.default_grams} г`);
                  }
                  if (item.default_portion) {
                    weightParts.push(item.default_portion);
                  }
                  return (
                    <DishPhotoCard
                      key={item.id}
                      mode="menu"
                      title={item.name}
                      description={item.description || ""}
                      photoUrl={item.photo_url || ""}
                      weightText={weightParts.join(" · ")}
                      kcalText={item.kcal > 0 ? `${item.kcal} ккал` : ""}
                      isFavorite={Boolean(item.is_favorite)}
                      busy={isAdding}
                      onOpen={() => openEditForm(item)}
                      onQuickAdd={() => handleQuickAdd(item)}
                      quickAddLabel={`Добавить «${item.name}» на ${selectedDateLabel}`}
                    />
                  );
                })}
              </div>
            ) : (
              <GroupList>
                {group.items.map((item) => {
                  const isAdding = busyAddId === item.id;
                  const metaParts = [];
                  if (item.default_grams) metaParts.push(`${item.default_grams} г`);
                  else if (item.default_portion) metaParts.push(item.default_portion);
                  if (item.kcal > 0) metaParts.push(`${item.kcal} ккал`);

                  return (
                    <div key={item.id} className="mt-list-row">
                      <button
                        type="button"
                        className="mt-list-body mt-list-body--clickable"
                        onClick={() => openEditForm(item)}
                      >
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
                        {metaParts.length > 0 ? (
                          <span className="mt-list-meta tabular">
                            {metaParts.join(" · ")}
                          </span>
                        ) : null}
                      </button>

                      <div className="mt-list-trailing">
                        <button
                          type="button"
                          className="mt-icon-btn"
                          disabled={isAdding}
                          aria-label={`Добавить «${item.name}» на ${selectedDateLabel}`}
                          title={`Добавить на ${selectedDateLabel}`}
                          onClick={() => handleQuickAdd(item)}
                          style={{ color: "var(--cobalt)" }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </GroupList>
            )}
          </section>
        ))
      )}

      <button
        type="button"
        className="mt-btn mt-btn--secondary mt-btn--wide"
        onClick={openCreateForm}
      >
        <Plus size={16} />
        <span>Новое блюдо в меню</span>
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
        onAddToShopping={onAddToShopping}
        onCustomizeAndAdd={onCustomizeAndAdd}
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
    <Sheet open={open} onClose={onClose} title="Меню блюд">
      <MenuCatalogView {...catalogProps} />
    </Sheet>
  );
}
