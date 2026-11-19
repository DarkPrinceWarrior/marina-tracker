import React from "react";
import {
  Sun,
  HeartPulse,
  UtensilsCrossed,
  Home,
  Target,
} from "lucide-react";

const TABS = [
  { key: "today", label: "Сегодня", icon: Sun },
  { key: "habits", label: "Привычки", icon: HeartPulse },
  { key: "nutrition", label: "Питание", icon: UtensilsCrossed },
  { key: "home", label: "Дом", icon: Home },
  { key: "goals", label: "Цели", icon: Target },
];

export default function BottomNav({
  activeTab = "today",
  onSelectTab,
  badges = {},
}) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = activeTab === key;
        const badgeCount = badges?.[key];
        const hasBadge = typeof badgeCount === "number" && badgeCount > 0;
        return (
          <button
            key={key}
            type="button"
            className={`bottom-nav-item${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            aria-label={hasBadge ? `${label} (${badgeCount})` : label}
            onClick={() => onSelectTab?.(key)}
          >
            <span className="bottom-nav-icon" aria-hidden="true">
              <Icon size={21} strokeWidth={isActive ? 2.2 : 1.75} />
              {hasBadge && (
                <span className="bottom-nav-badge">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span className="bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
