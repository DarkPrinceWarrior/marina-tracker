import React from "react";
import { Check, Plus, Star, UtensilsCrossed } from "lucide-react";

/**
 * Samokat-inspired minimalist food photo card used in both
 * «Рацион» (mode="meal") and «Меню» (mode="menu").
 */
export default function DishPhotoCard({
  mode = "menu", // "menu" | "meal"
  title,
  description = "",
  photoUrl = "",
  weightText = "",
  kcalText = "",
  timeText = "",
  isFavorite = false,
  isCompleted = true,
  busy = false,
  onOpen,
  onToggleComplete,
  onQuickAdd,
  quickAddLabel = "Добавить в рацион",
}) {
  const isPlanned = mode === "meal" && !isCompleted;

  return (
    <article
      className={`dish-card${isPlanned ? " is-planned" : ""}`}
      data-dish-card={mode}
    >
      <div className="dish-card-media-wrap">
        <button
          type="button"
          className="dish-card-media-btn"
          onClick={onOpen}
          aria-label={`Открыть «${title}»`}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={title}
              className="dish-card-img"
              decoding="async"
            />
          ) : (
            <span className="dish-card-placeholder" aria-hidden="true">
              <UtensilsCrossed size={22} strokeWidth={1.6} />
              <span>Без фото</span>
            </span>
          )}
        </button>

        {/* Meal mode: top-left 1-tap eaten checkbox + top-right time / planned pill */}
        {mode === "meal" && onToggleComplete ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={isCompleted}
            aria-label={
              isCompleted
                ? `Отметить «${title}» как запланированное`
                : `Отметить «${title}» как съеденное`
            }
            className={`dish-card-check${isCompleted ? " is-checked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete();
            }}
          >
            {isCompleted ? <Check size={14} strokeWidth={2.8} /> : null}
          </button>
        ) : null}

        {mode === "meal" && (timeText || isPlanned) ? (
          <span
            className={`dish-card-pill-overlay tabular${
              isPlanned ? " is-planned" : ""
            }`}
          >
            {isPlanned ? "В плане" : timeText}
          </span>
        ) : null}

        {/* Menu mode: subtle frosted favorite star only when favorite */}
        {mode === "menu" && isFavorite ? (
          <span
            className="dish-card-fav-badge"
            aria-label="Избранное"
            title="Избранное"
          >
            <Star
              size={12}
              fill="var(--cobalt)"
              color="var(--cobalt)"
              aria-hidden="true"
            />
          </span>
        ) : null}
      </div>

      <button type="button" className="dish-card-body" onClick={onOpen}>
        <span className="dish-card-title">{title}</span>
        {description ? (
          <span className="dish-card-desc">{description}</span>
        ) : null}
        {mode === "menu" && weightText ? (
          <span className="dish-card-sub tabular">{weightText}</span>
        ) : null}
      </button>

      <div className="dish-card-footer">
        {mode === "menu" ? (
          <button
            type="button"
            className="dish-card-action-pill"
            disabled={busy}
            onClick={onQuickAdd}
            aria-label={quickAddLabel}
          >
            <span className="dish-card-action-label tabular">
              {kcalText || weightText || "В рацион"}
            </span>
            <span className="dish-card-action-plus" aria-hidden="true">
              <Plus size={15} strokeWidth={2.4} />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="dish-card-meal-pill"
            onClick={onOpen}
            aria-label={`Изменить «${title}»`}
          >
            <span className="dish-card-meal-weight tabular">
              {weightText || "Порция"}
            </span>
            {kcalText ? (
              <span className="dish-card-meal-kcal tabular">{kcalText}</span>
            ) : null}
          </button>
        )}
      </div>
    </article>
  );
}
