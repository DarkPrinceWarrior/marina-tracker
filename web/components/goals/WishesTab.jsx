import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
} from "lucide-react";
import api, { withOptimistic } from "../../api.js";
import {
  CompactProgress,
  GroupList,
  ListRow,
  SelectField,
  EmptyState,
} from "../UiPrimitives.jsx";
import WishFormSheet from "./WishFormSheet.jsx";
import { GOAL_SPHERES } from "../../data/presets.js";
import { todayISO, parseISODate, formatDateShortRu } from "../../utils/date.js";

function computeWishSummary(items) {
  const total = items.length;
  const fulfilled = items.filter((w) => w.fulfilled).length;
  const percent = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
  return { total, fulfilled, remaining: total - fulfilled, percent };
}

export default function WishesTab({
  todayDate,
  notify,
  onDataChanged,
  createSignal = 0,
}) {
  const activeToday = todayDate || todayISO();
  const initialYear = parseISODate(activeToday).getFullYear();

  const [year, setYear] = useState(initialYear);
  const [wishes, setWishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [addingQuick, setAddingQuick] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWish, setEditingWish] = useState(null);
  const quickInputRef = useRef(null);

  const loadWishes = useCallback(async () => {
    try {
      const data = await api.getWishes(year);
      setWishes(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить список желаний", "error");
    } finally {
      setLoading(false);
    }
  }, [year, notify]);

  useEffect(() => {
    setLoading(true);
    loadWishes();
  }, [loadWishes]);

  useEffect(() => {
    if (createSignal > 0) {
      setEditingWish(null);
      setSheetOpen(true);
    }
  }, [createSignal]);

  const categoryFilterOptions = useMemo(
    () => [
      { value: "", label: "Все категории" },
      ...GOAL_SPHERES.map((s) => ({ value: s.key, label: s.label })),
    ],
    [],
  );

  const filteredWishes = useMemo(() => {
    const list = wishes.filter((w) =>
      categoryFilter ? w.category === categoryFilter : true,
    );
    return [...list].sort((a, b) => {
      if (Boolean(a.fulfilled) !== Boolean(b.fulfilled)) {
        return a.fulfilled ? 1 : -1;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
    });
  }, [wishes, categoryFilter]);

  const summary = useMemo(() => computeWishSummary(wishes), [wishes]);

  async function handleQuickAdd(event) {
    event?.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed || addingQuick) return;

    setAddingQuick(true);
    try {
      const created = await api.createWish({
        title: trimmed,
        target_year: year,
        category: categoryFilter || "Развлечения и отдых",
      });
      setWishes((prev) => [created, ...prev]);
      setQuickTitle("");
      notify?.("Желание добавлено", "success");
      onDataChanged?.();
      quickInputRef.current?.focus();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить желание", "error");
    } finally {
      setAddingQuick(false);
    }
  }

  async function handleToggleWish(wish) {
    const nextFulfilled = !wish.fulfilled;
    try {
      const updated = await withOptimistic({
        apply: () => {
          const prev = wishes;
          setWishes((list) =>
            list.map((item) =>
              item.id === wish.id
                ? {
                    ...item,
                    fulfilled: nextFulfilled,
                    fulfilled_at: nextFulfilled ? activeToday : null,
                  }
                : item,
            ),
          );
          return prev;
        },
        commit: () => api.toggleWish(wish.id, nextFulfilled),
        rollback: (prev) => setWishes(prev),
        onError: (err) => {
          notify?.(err?.message || "Не удалось обновить желание", "error");
        },
      });
      if (updated?.id) {
        setWishes((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      onDataChanged?.();
    } catch {
      // handled by onError
    }
  }

  async function handleSaveWish(payload) {
    if (payload.id) {
      const { id, ...body } = payload;
      const updated = await api.updateWish(id, body);
      if (Number(updated.target_year) !== year) {
        setYear(Number(updated.target_year));
      } else {
        setWishes((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      notify?.("Желание обновлено", "success");
    } else {
      const { id, fulfilled, ...body } = payload;
      const created = await api.createWish(body);
      if (Number(created.target_year) !== year) {
        setYear(Number(created.target_year));
      } else {
        setWishes((prev) => [created, ...prev]);
      }
      notify?.("Желание добавлено", "success");
    }
    onDataChanged?.();
  }

  async function handleDeleteWish(wishId) {
    await api.deleteWish(wishId);
    setWishes((prev) => prev.filter((item) => item.id !== wishId));
    notify?.("Желание удалено", "info");
    onDataChanged?.();
  }

  return (
    <div className="mt-stack">
      {/* Year Switcher */}
      <div className="wish-year-bar">
        <button
          type="button"
          className="mt-icon-btn"
          aria-label="Предыдущий год"
          onClick={() => setYear((y) => y - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="wish-year-label">{year} год</span>
        <button
          type="button"
          className="mt-icon-btn"
          aria-label="Следующий год"
          onClick={() => setYear((y) => y + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Progress */}
      <div className="mt-card mt-card--compact">
        <CompactProgress
          value={summary.fulfilled}
          max={Math.max(1, summary.total)}
          label={`Исполнено ${summary.fulfilled} из ${summary.total}`}
          meta={`${summary.percent}%`}
          tone="cobalt"
        />
      </div>

      {/* Category Filter */}
      <div className="goals-filter-bar">
        <SelectField
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryFilterOptions}
          ariaLabel="Фильтр желаний по категории"
          compact
        />
      </div>

      {/* Quick Add Wish Bar */}
      <form className="wish-quick-add" onSubmit={handleQuickAdd}>
        <div className="mt-input-row">
          <input
            ref={quickInputRef}
            type="text"
            className="mt-input"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder={`Напишите желание на ${year} год…`}
            aria-label="Новое желание на год"
            autoComplete="off"
          />
          <button
            type="submit"
            className="mt-btn mt-btn--primary"
            disabled={!quickTitle.trim() || addingQuick}
            aria-label="Добавить желание"
            style={{ paddingInline: "12px", minWidth: "46px" }}
          >
            <Plus size={19} />
          </button>
        </div>
      </form>

      {/* Wishes List */}
      {loading ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-card-sub">Загружаем список желаний...</p>
        </div>
      ) : filteredWishes.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title={
            categoryFilter
              ? "В этой категории пока нет желаний"
              : `Список желаний на ${year} год пуст`
          }
          description="Запишите то, что порадует вас в этом году — от маленького ритуала до большого путешествия."
          action={
            categoryFilter ? (
              <button
                type="button"
                className="mt-btn mt-btn--soft"
                onClick={() => setCategoryFilter("")}
              >
                Все категории
              </button>
            ) : null
          }
        />
      ) : (
        <GroupList>
          {filteredWishes.map((wish) => {
            const metaParts = [wish.category || "Развлечения и отдых"];
            if (wish.fulfilled && wish.fulfilled_at) {
              metaParts.push(`Исполнено ${formatDateShortRu(wish.fulfilled_at)}`);
            } else if (wish.note) {
              metaParts.push(wish.note);
            }

            return (
              <ListRow
                key={wish.id}
                checked={Boolean(wish.fulfilled)}
                onToggle={() => handleToggleWish(wish)}
                onClick={() => {
                  setEditingWish(wish);
                  setSheetOpen(true);
                }}
                strikethrough={true}
                accent="cobalt"
                title={wish.title}
                meta={metaParts.join(" · ")}
                trailing={
                  <ChevronRight
                    size={16}
                    className="muted"
                    aria-hidden="true"
                  />
                }
              />
            );
          })}
        </GroupList>
      )}

      <WishFormSheet
        open={sheetOpen}
        wish={editingWish}
        defaultYear={year}
        defaultCategory={categoryFilter || "Развлечения и отдых"}
        onClose={() => {
          setSheetOpen(false);
          setEditingWish(null);
        }}
        onSave={handleSaveWish}
        onDelete={handleDeleteWish}
      />
    </div>
  );
}
