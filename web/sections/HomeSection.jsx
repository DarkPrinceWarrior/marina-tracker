import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShoppingBasket,
  Clock,
  CheckCircle2,
  UtensilsCrossed,
  Droplets,
  Sofa,
  Shirt,
  Home as HomeIcon,
  Salad,
  Milk,
  Fish,
  Wheat,
  SprayCan,
  Coffee,
  ShoppingBag,
} from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  SectionHeader,
  SegmentedControl,
  CheckRow,
  Pill,
  EmptyState,
} from "../components/UiPrimitives.jsx";
import ChoreSheet from "../components/home/ChoreSheet.jsx";
import {
  CHORE_ZONES,
  CHORE_FREQUENCY_MAP,
  SHOPPING_CATEGORIES,
  formatCountRu,
} from "../data/presets.js";
import {
  todayISO,
  formatDateShortRu,
  formatRelativeDayRu,
  nowTimeHHMM,
} from "../utils/date.js";

const SHOPPING_ICON_MAP = {
  Salad,
  Milk,
  Fish,
  Wheat,
  SprayCan,
  Sparkles,
  Coffee,
  ShoppingBag,
};

const ZONE_ICON_MAP = {
  UtensilsCrossed,
  Droplets,
  Sofa,
  Shirt,
  Home: HomeIcon,
};

function formatLastDone(chore, activeDate) {
  if (chore.completed && chore.completed_at) {
    const dayLabel = formatRelativeDayRu(activeDate).toLowerCase();
    return `Последний раз: ${dayLabel} ${chore.completed_at}`;
  }
  if (chore.last_completed_date) {
    const rel = formatRelativeDayRu(chore.last_completed_date);
    const dayText =
      rel === "Сегодня" || rel === "Вчера" || rel === "Завтра"
        ? rel.toLowerCase()
        : formatDateShortRu(chore.last_completed_date);
    return `Последний раз: ${dayText}${chore.last_completed_at ? ` ${chore.last_completed_at}` : ""}`;
  }
  return "Ещё не отмечалось";
}

function recomputeChoreSummary(items) {
  const active = items.filter((item) => item.active !== false);
  const done_today = active.filter((i) => i.completed).length;
  const daily = active.filter((i) => i.frequency === "daily");
  const weekly = active.filter((i) => i.frequency === "weekly");
  return {
    done_today,
    total_active: active.length,
    daily_done: daily.filter((i) => i.completed).length,
    daily_total: daily.length,
    weekly_done: weekly.filter((i) => i.completed).length,
    weekly_total: weekly.length,
  };
}

function recomputeShoppingSummary(items) {
  const bought = items.filter((i) => i.bought).length;
  return {
    remaining: items.length - bought,
    bought,
    total: items.length,
  };
}

export default function HomeSection({
  selectedDate,
  todayDate,
  initialSubTab,
  notify,
  onDataChanged,
}) {
  const activeDate = selectedDate || todayDate || todayISO();
  const [subTab, setSubTab] = useState(
    initialSubTab === "shopping" ? "shopping" : "chores",
  );

  // Chores state
  const [chores, setChores] = useState([]);
  const [choresSummary, setChoresSummary] = useState({
    done_today: 0,
    total_active: 0,
    daily_done: 0,
    daily_total: 0,
    weekly_done: 0,
    weekly_total: 0,
  });
  const [choresLoading, setChoresLoading] = useState(true);
  const [choreFilter, setChoreFilter] = useState("all");
  const [choreSheetOpen, setChoreSheetOpen] = useState(false);
  const [editingChore, setEditingChore] = useState(null);

  // Shopping state
  const [shoppingItems, setShoppingItems] = useState([]);
  const [shoppingSummary, setShoppingSummary] = useState({
    remaining: 0,
    bought: 0,
    total: 0,
  });
  const [shoppingLoading, setShoppingLoading] = useState(true);
  const [quickName, setQuickName] = useState("");
  const [quickQty, setQuickQty] = useState("");
  const [quickCategory, setQuickCategory] = useState(
    SHOPPING_CATEGORIES[0].key,
  );
  const [addingItem, setAddingItem] = useState(false);
  const [clearingBought, setClearingBought] = useState(false);
  const [boughtExpanded, setBoughtExpanded] = useState(true);
  const quickInputRef = useRef(null);

  useEffect(() => {
    if (initialSubTab === "shopping" || initialSubTab === "chores") {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const loadChores = useCallback(async () => {
    try {
      const data = await api.getChores(activeDate);
      const list = Array.isArray(data?.items) ? data.items : [];
      setChores(list);
      setChoresSummary(data?.summary || recomputeChoreSummary(list));
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить дела по дому", "error");
    } finally {
      setChoresLoading(false);
    }
  }, [activeDate, notify]);

  const loadShopping = useCallback(async () => {
    try {
      const data = await api.getShopping();
      const list = Array.isArray(data?.items) ? data.items : [];
      setShoppingItems(list);
      setShoppingSummary(data?.summary || recomputeShoppingSummary(list));
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить список покупок", "error");
    } finally {
      setShoppingLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    setChoresLoading(true);
    loadChores();
  }, [loadChores]);

  useEffect(() => {
    setShoppingLoading(true);
    loadShopping();
  }, [loadShopping]);

  // Chore filter options
  const choreFilterOptions = useMemo(() => {
    const base = [
      { key: "all", label: "Все" },
      { key: "today", label: "Сегодня" },
    ];
    const zoneKeys = CHORE_ZONES.map((z) => ({ key: z.key, label: z.label }));
    return [...base, ...zoneKeys];
  }, []);

  const filteredChores = useMemo(() => {
    const list = chores.filter((chore) => {
      if (choreFilter === "all") return true;
      if (choreFilter === "today") {
        return (
          chore.frequency === "daily" ||
          chore.completed ||
          chore.frequency === "once"
        );
      }
      return chore.zone === choreFilter;
    });
    return [...list].sort((a, b) => {
      if (Boolean(a.completed) !== Boolean(b.completed)) {
        return a.completed ? 1 : -1;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
    });
  }, [chores, choreFilter]);

  const progressStats = useMemo(() => {
    const done = choresSummary.done_today || 0;
    const total = choresSummary.total_active || chores.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [choresSummary, chores.length]);

  const choresPendingCount = useMemo(
    () => Math.max(0, (choresSummary.total_active || 0) - (choresSummary.done_today || 0)),
    [choresSummary],
  );

  // Handlers: Chores
  async function handleToggleChore(chore) {
    const nextCompleted = !chore.completed;
    const nowTime = nowTimeHHMM();

    try {
      const updated = await withOptimistic({
        apply: () => {
          const prevChores = chores;
          const nextChores = chores.map((item) =>
            item.id === chore.id
              ? {
                  ...item,
                  completed: nextCompleted,
                  completed_at: nextCompleted ? nowTime : null,
                  last_completed_date: nextCompleted
                    ? activeDate
                    : item.last_completed_date,
                  last_completed_at: nextCompleted
                    ? nowTime
                    : item.last_completed_at,
                }
              : item,
          );
          setChores(nextChores);
          setChoresSummary(recomputeChoreSummary(nextChores));
          return prevChores;
        },
        commit: () =>
          api.toggleChore(chore.id, {
            date: activeDate,
            completed: nextCompleted,
          }),
        rollback: (prevChores) => {
          setChores(prevChores);
          setChoresSummary(recomputeChoreSummary(prevChores));
        },
        onError: (err) => {
          notify?.(err?.message || "Не удалось обновить статус дела", "error");
        },
      });

      if (updated?.id) {
        setChores((prev) => {
          const next = prev.map((item) =>
            item.id === updated.id ? { ...item, ...updated } : item,
          );
          setChoresSummary(recomputeChoreSummary(next));
          return next;
        });
      }
      onDataChanged?.();
    } catch {
      // handled by onError
    }
  }

  async function handleSaveChore(payload) {
    if (payload.id) {
      const updated = await api.updateChore(payload.id, {
        title: payload.title,
        zone: payload.zone,
        frequency: payload.frequency,
      });
      setChores((prev) => {
        const next = prev.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        );
        setChoresSummary(recomputeChoreSummary(next));
        return next;
      });
      notify?.("Дело обновлено", "success");
    } else {
      const created = await api.createChore({
        title: payload.title,
        zone: payload.zone,
        frequency: payload.frequency,
      });
      setChores((prev) => {
        const next = [...prev, created];
        setChoresSummary(recomputeChoreSummary(next));
        return next;
      });
      notify?.("Дело добавлено в список", "success");
    }
    onDataChanged?.();
  }

  async function handleDeleteChore(choreId) {
    await api.deleteChore(choreId);
    setChores((prev) => {
      const next = prev.filter((item) => item.id !== choreId);
      setChoresSummary(recomputeChoreSummary(next));
      return next;
    });
    notify?.("Дело удалено", "info");
    onDataChanged?.();
  }

  // Grouped shopping lists
  const { activeShoppingGroups, boughtItems } = useMemo(() => {
    const unbought = shoppingItems.filter((item) => !item.bought);
    const bought = shoppingItems.filter((item) => item.bought);

    const grouped = new Map();
    SHOPPING_CATEGORIES.forEach((cat) => {
      grouped.set(cat.key, []);
    });

    unbought.forEach((item) => {
      const catKey = item.category || "Другое";
      if (!grouped.has(catKey)) {
        grouped.set(catKey, []);
      }
      grouped.get(catKey).push(item);
    });

    const groups = [];
    for (const [category, items] of grouped.entries()) {
      if (items.length > 0) {
        const meta = SHOPPING_CATEGORIES.find((c) => c.key === category);
        groups.push({
          category,
          iconName: meta?.icon || "ShoppingBag",
          items,
        });
      }
    }

    return { activeShoppingGroups: groups, boughtItems: bought };
  }, [shoppingItems]);

  // Handlers: Shopping
  async function handleQuickAddShopping(event) {
    event?.preventDefault();
    const trimmed = quickName.trim();
    if (!trimmed || addingItem) return;

    setAddingItem(true);
    try {
      const created = await api.createShoppingItem({
        name: trimmed,
        quantity: quickQty.trim(),
        category: quickCategory,
      });
      setShoppingItems((prev) => {
        const next = [created, ...prev];
        setShoppingSummary(recomputeShoppingSummary(next));
        return next;
      });
      setQuickName("");
      setQuickQty("");
      notify?.(`Добавлено: ${trimmed}`, "success");
      onDataChanged?.();
      quickInputRef.current?.focus();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить покупку", "error");
    } finally {
      setAddingItem(false);
    }
  }

  async function handleToggleShopping(item) {
    const nextBought = !item.bought;
    try {
      const updated = await withOptimistic({
        apply: () => {
          const prev = shoppingItems;
          const next = shoppingItems.map((entry) =>
            entry.id === item.id ? { ...entry, bought: nextBought } : entry,
          );
          setShoppingItems(next);
          setShoppingSummary(recomputeShoppingSummary(next));
          return prev;
        },
        commit: () =>
          api.updateShoppingItem(item.id, { bought: nextBought }),
        rollback: (prev) => {
          setShoppingItems(prev);
          setShoppingSummary(recomputeShoppingSummary(prev));
        },
        onError: (err) => {
          notify?.(err?.message || "Не удалось обновить покупку", "error");
        },
      });
      if (updated?.id) {
        setShoppingItems((prev) => {
          const next = prev.map((entry) =>
            entry.id === updated.id ? { ...entry, ...updated } : entry,
          );
          setShoppingSummary(recomputeShoppingSummary(next));
          return next;
        });
      }
      onDataChanged?.();
    } catch {
      // handled by onError
    }
  }

  async function handleDeleteShopping(item) {
    try {
      await withOptimistic({
        apply: () => {
          const prev = shoppingItems;
          const next = shoppingItems.filter((entry) => entry.id !== item.id);
          setShoppingItems(next);
          setShoppingSummary(recomputeShoppingSummary(next));
          return prev;
        },
        commit: () => api.deleteShoppingItem(item.id),
        rollback: (prev) => {
          setShoppingItems(prev);
          setShoppingSummary(recomputeShoppingSummary(prev));
        },
        onError: (err) => {
          notify?.(err?.message || "Не удалось удалить позицию", "error");
        },
      });
      notify?.("Позиция удалена", "info");
      onDataChanged?.();
    } catch {
      // handled by onError
    }
  }

  async function handleClearBought() {
    if (boughtItems.length === 0 || clearingBought) return;
    setClearingBought(true);
    try {
      const res = await api.clearBoughtShopping();
      setShoppingItems((prev) => {
        const next = prev.filter((item) => !item.bought);
        setShoppingSummary(recomputeShoppingSummary(next));
        return next;
      });
      const count = res?.cleared ?? boughtItems.length;
      notify?.(
        `Очищено ${formatCountRu(count, "купленная позиция", "купленные позиции", "купленных позиций")}`,
        "success",
      );
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось очистить купленное", "error");
    } finally {
      setClearingBought(false);
    }
  }

  return (
    <section className="mt-section" data-accent="home" aria-label="Дом">
      <SectionHeader
        eyebrow="Дом и уют"
        title="Дом"
        subtitle={
          subTab === "chores"
            ? "Спокойный ритм уборки и бытовых дел"
            : "Быстрый список продуктов и мелочей для дома"
        }
        action={
          subTab === "chores" ? (
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              data-accent="home"
              aria-label="Новое дело"
              onClick={() => {
                setEditingChore(null);
                setChoreSheetOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Дело</span>
            </button>
          ) : null
        }
      />

      <SegmentedControl
        value={subTab}
        onChange={setSubTab}
        accent="home"
        options={[
          {
            value: "chores",
            label: "Уборка и дела",
            count: choresPendingCount,
          },
          {
            value: "shopping",
            label: "Покупки",
            count: shoppingSummary.remaining,
          },
        ]}
      />

      {subTab === "chores" ? (
        <div className="mt-stack">
          {/* Summary Card: Порядок дома */}
          <div className="home-progress-card" data-accent="home">
            <div className="mt-card-head">
              <div>
                <h2 className="mt-card-title">Порядок дома</h2>
                <p className="mt-card-sub tabular">
                  Выполнено {progressStats.done} из {progressStats.total}
                </p>
              </div>
              <Pill tone={progressStats.pct === 100 && progressStats.total > 0 ? "success" : "home"}>
                {progressStats.pct}%
              </Pill>
            </div>

            <div
              className="home-progress-bar"
              role="progressbar"
              aria-valuenow={progressStats.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Прогресс дел по дому"
            >
              <div
                className="home-progress-fill"
                style={{ width: `${progressStats.pct}%` }}
              />
            </div>

            <div className="mt-row mt-row--wrap" style={{ gap: "6px" }}>
              {choresSummary.daily_total > 0 && (
                <Pill tone="neutral">
                  Ежедневные: {choresSummary.daily_done}/{choresSummary.daily_total}
                </Pill>
              )}
              {choresSummary.weekly_total > 0 && (
                <Pill tone="neutral">
                  За неделю: {choresSummary.weekly_done}/{choresSummary.weekly_total}
                </Pill>
              )}
            </div>
          </div>

          {/* Filter Chips by Frequency / Zone */}
          <div
            className="mt-chip-row"
            role="group"
            aria-label="Фильтр дел по зонам"
          >
            {choreFilterOptions.map((opt) => (
              <Pill
                key={opt.key}
                tone="home"
                active={choreFilter === opt.key}
                onClick={() => setChoreFilter(opt.key)}
              >
                {opt.label}
              </Pill>
            ))}
          </div>

          {/* Chores List */}
          {choresLoading ? (
            <div className="mt-card mt-card--compact">
              <p className="mt-card-sub">Загружаем список дел...</p>
            </div>
          ) : filteredChores.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={24} />}
              title="В этой категории пока чисто"
              description="Добавьте регулярное или разовое дело, чтобы спокойно держать дом в порядке."
              action={
                <button
                  type="button"
                  className="mt-btn mt-btn--primary"
                  data-accent="home"
                  onClick={() => {
                    setEditingChore(null);
                    setChoreSheetOpen(true);
                  }}
                >
                  <Plus size={18} />
                  <span>Новое дело</span>
                </button>
              }
            />
          ) : (
            <div className="mt-stack mt-stack--sm">
              {filteredChores.map((chore) => {
                const freqMeta = CHORE_FREQUENCY_MAP[chore.frequency];
                const zoneMeta = CHORE_ZONES.find((z) => z.key === chore.zone);
                const ZoneIcon = ZONE_ICON_MAP[zoneMeta?.icon] || HomeIcon;

                return (
                  <div key={chore.id} className="chore-card" data-accent="home">
                    <CheckRow
                      checked={Boolean(chore.completed)}
                      onToggle={() => handleToggleChore(chore)}
                      accent="home"
                      strikethrough={true}
                      title={chore.title}
                      subtitle={
                        <span className="chore-meta">
                          <Pill tone="home" icon={<ZoneIcon size={12} />}>
                            {chore.zone || "Общее"}
                          </Pill>
                          <Pill tone="neutral">
                            {freqMeta?.label || "Регулярно"}
                          </Pill>
                          <span
                            className="mt-row"
                            style={{ gap: "4px", fontSize: "12px" }}
                          >
                            <Clock size={12} />
                            <span>{formatLastDone(chore, activeDate)}</span>
                          </span>
                        </span>
                      }
                      trailing={
                        <button
                          type="button"
                          className="mt-icon-btn"
                          aria-label={`Редактировать «${chore.title}»`}
                          onClick={() => {
                            setEditingChore(chore);
                            setChoreSheetOpen(true);
                          }}
                        >
                          <Pencil size={17} />
                        </button>
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-stack">
          {/* Quick-Add Sticky/Top Bar */}
          <form
            className="shopping-quick-bar"
            data-accent="home"
            onSubmit={handleQuickAddShopping}
          >
            <div className="mt-input-row">
              <input
                ref={quickInputRef}
                type="text"
                className="mt-input"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Что купить?"
                aria-label="Название продукта или товара"
                autoComplete="off"
                style={{ flex: "1 1 150px" }}
              />
              <input
                type="text"
                className="mt-input"
                value={quickQty}
                onChange={(e) => setQuickQty(e.target.value)}
                placeholder="Кол-во"
                aria-label="Количество (необязательно)"
                autoComplete="off"
                style={{ flex: "0 0 88px", width: "88px", paddingInline: "10px" }}
              />
              <button
                type="submit"
                className="mt-btn mt-btn--primary"
                data-accent="home"
                disabled={!quickName.trim() || addingItem}
                aria-label="Добавить в покупки"
                style={{ paddingInline: "13px", minWidth: "46px" }}
              >
                <Plus size={20} />
              </button>
            </div>

            <div
              className="mt-chip-row"
              role="group"
              aria-label="Категория покупки"
            >
              {SHOPPING_CATEGORIES.map((cat) => {
                const CatIcon = SHOPPING_ICON_MAP[cat.icon] || ShoppingBag;
                return (
                  <Pill
                    key={cat.key}
                    tone="home"
                    active={quickCategory === cat.key}
                    icon={<CatIcon size={13} />}
                    onClick={() => setQuickCategory(cat.key)}
                  >
                    {cat.label}
                  </Pill>
                );
              })}
            </div>
          </form>

          {/* Remaining Counter + Clear Bought Action */}
          <div className="mt-row mt-row--between" style={{ gap: "8px" }}>
            <span className="mt-card-sub tabular" style={{ margin: 0, whiteSpace: "nowrap" }}>
              {shoppingSummary.remaining > 0
                ? `Осталось: ${shoppingSummary.remaining}`
                : shoppingSummary.total > 0
                  ? "Всё куплено!"
                  : "Список пуст"}
            </span>
            {boughtItems.length > 0 && (
              <button
                type="button"
                className="mt-btn mt-btn--soft mt-btn--sm"
                data-accent="home"
                disabled={clearingBought}
                onClick={handleClearBought}
              >
                <Trash2 size={15} />
                <span>Очистить купленное</span>
              </button>
            )}
          </div>

          {/* Categorized Active List */}
          {shoppingLoading ? (
            <div className="mt-card mt-card--compact">
              <p className="mt-card-sub">Загружаем список покупок...</p>
            </div>
          ) : activeShoppingGroups.length === 0 && boughtItems.length === 0 ? (
            <EmptyState
              icon={<ShoppingBasket size={24} />}
              title="Список покупок пока пуст"
              description="Введите продукт в строке выше и выберите категорию — добавление займёт секунду."
            />
          ) : (
            <div className="mt-stack">
              {activeShoppingGroups.length === 0 && boughtItems.length > 0 && (
                <div className="mt-card mt-card--compact mt-card--tinted" data-accent="habits">
                  <div className="mt-row">
                    <CheckCircle2 size={20} style={{ color: "var(--success)", flexShrink: 0 }} />
                    <div>
                      <p className="mt-card-title">Корзина собрана</p>
                      <p className="mt-card-sub">
                        Все пункты отмечены как купленные. Можно очистить список одним нажатием.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeShoppingGroups.map((group) => {
                const GroupIcon = SHOPPING_ICON_MAP[group.iconName] || ShoppingBag;
                return (
                  <div key={group.category} className="shopping-group">
                    <div className="shopping-group-title">
                      <span className="mt-row" style={{ gap: "7px" }}>
                        <GroupIcon size={15} />
                        <span>{group.category}</span>
                      </span>
                      <span className="muted tabular" style={{ fontSize: "12px" }}>
                        {group.items.length}
                      </span>
                    </div>
                    <div className="mt-stack mt-stack--xs">
                      {group.items.map((item) => (
                        <CheckRow
                          key={item.id}
                          checked={false}
                          onToggle={() => handleToggleShopping(item)}
                          accent="home"
                          strikethrough={true}
                          title={item.name}
                          badge={
                            item.quantity ? (
                              <Pill tone="neutral">{item.quantity}</Pill>
                            ) : null
                          }
                          trailing={
                            <button
                              type="button"
                              className="mt-icon-btn mt-icon-btn--danger"
                              aria-label={`Удалить «${item.name}»`}
                              onClick={() => handleDeleteShopping(item)}
                            >
                              <Trash2 size={16} />
                            </button>
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Collapsible «Куплено» Footer */}
              {boughtItems.length > 0 && (
                <div className="mt-stack mt-stack--sm">
                  <button
                    type="button"
                    className="shopping-bought-toggle"
                    aria-expanded={boughtExpanded}
                    onClick={() => setBoughtExpanded((prev) => !prev)}
                  >
                    <span className="mt-row" style={{ gap: "8px" }}>
                      <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
                      <span className="tabular">
                        Куплено ({boughtItems.length})
                      </span>
                    </span>
                    {boughtExpanded ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </button>

                  {boughtExpanded && (
                    <div className="shopping-group" style={{ opacity: 0.9 }}>
                      <div className="mt-stack mt-stack--xs">
                        {boughtItems.map((item) => (
                          <CheckRow
                            key={item.id}
                            checked={true}
                            onToggle={() => handleToggleShopping(item)}
                            accent="home"
                            strikethrough={true}
                            title={item.name}
                            subtitle={item.category}
                            badge={
                              item.quantity ? (
                                <Pill tone="neutral">{item.quantity}</Pill>
                              ) : null
                            }
                            trailing={
                              <button
                                type="button"
                                className="mt-icon-btn mt-icon-btn--danger"
                                aria-label={`Удалить «${item.name}»`}
                                onClick={() => handleDeleteShopping(item)}
                              >
                                <Trash2 size={16} />
                              </button>
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ChoreSheet
        open={choreSheetOpen}
        chore={editingChore}
        onClose={() => {
          setChoreSheetOpen(false);
          setEditingChore(null);
        }}
        onSave={handleSaveChore}
        onDelete={handleDeleteChore}
      />
    </section>
  );
}
