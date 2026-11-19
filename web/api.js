export class ApiError extends Error {
  constructor(message, { status = 0, detail = null, data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.data = data;
  }
}

function buildQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function localizeErrorMessage(raw, status) {
  const text = String(raw || "").trim();
  if (!text) {
    if (status === 404) return "Запись не найдена.";
    if (status === 422) return "Проверьте заполненные поля.";
    if (status >= 500) return "Временная ошибка сервера. Попробуйте ещё раз.";
    return "Не удалось выполнить запрос.";
  }

  const lower = text.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return "Не удалось связаться с сервером. Проверьте подключение.";
  }
  if (lower === "not found") return "Запись не найдена.";
  if (lower === "internal server error") {
    return "Временная ошибка сервера. Попробуйте ещё раз.";
  }
  if (
    lower.includes("field required") ||
    lower.includes("string should have") ||
    lower.includes("input should be") ||
    lower.includes("validation error")
  ) {
    return "Проверьте корректность введённых данных.";
  }
  return text;
}

async function request(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  const init = { method, headers, signal };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("Не удалось связаться с сервером. Проверьте подключение.", {
      status: 0,
    });
  }

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => "");
    data = text || null;
  }

  if (!response.ok) {
    const detail =
      (data && typeof data === "object" && (data.detail || data.message)) ||
      (typeof data === "string" && data) ||
      "";
    const rawMessage = Array.isArray(detail)
      ? detail.map((d) => d.msg || String(d)).join("; ")
      : String(detail || "");
    throw new ApiError(localizeErrorMessage(rawMessage, response.status), {
      status: response.status,
      detail,
      data,
    });
  }

  return data;
}

/**
 * Optimistic UI helper: applies local change immediately, commits to API,
 * rolls back cleanly and triggers onError on failure.
 */
export async function withOptimistic({ apply, commit, rollback, onError }) {
  const snapshot = apply?.();
  try {
    return await commit();
  } catch (err) {
    rollback?.(snapshot);
    onError?.(err);
    throw err;
  }
}

export const api = {
  request,

  // 0. Health
  health: () => request("/api/health"),

  // 1. Today & Reflection
  getToday: (date) => request(`/api/today${buildQuery({ date })}`),
  saveReflection: (payload) =>
    request("/api/today/reflection", { method: "PUT", body: payload }),

  // 2. Tasks
  getTasks: (date, status = "all") =>
    request(`/api/tasks${buildQuery({ date, status })}`),
  createTask: (payload) =>
    request("/api/tasks", { method: "POST", body: payload }),
  updateTask: (id, payload) =>
    request(`/api/tasks/${id}`, { method: "PATCH", body: payload }),
  toggleTask: (id, completed) =>
    request(`/api/tasks/${id}/toggle`, {
      method: "POST",
      body: completed === undefined ? {} : { completed },
    }),
  rescheduleTask: (id, payload = { days: 1 }) =>
    request(`/api/tasks/${id}/reschedule`, { method: "POST", body: payload }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: "DELETE" }),

  // 3. Multi-Year Goals
  getGoals: ({ status = "all", horizon = "all" } = {}) =>
    request(`/api/goals${buildQuery({ status, horizon })}`),
  createGoal: (payload) =>
    request("/api/goals", { method: "POST", body: payload }),
  updateGoal: (id, payload) =>
    request(`/api/goals/${id}`, { method: "PATCH", body: payload }),
  deleteGoal: (id) => request(`/api/goals/${id}`, { method: "DELETE" }),
  createMilestone: (goalId, payload) =>
    request(`/api/goals/${goalId}/milestones`, {
      method: "POST",
      body: payload,
    }),
  updateMilestone: (goalId, milestoneId, payload) =>
    request(`/api/goals/${goalId}/milestones/${milestoneId}`, {
      method: "PATCH",
      body: payload,
    }),
  deleteMilestone: (goalId, milestoneId) =>
    request(`/api/goals/${goalId}/milestones/${milestoneId}`, {
      method: "DELETE",
    }),
  createGoalCheckin: (goalId, payload) =>
    request(`/api/goals/${goalId}/checkins`, {
      method: "POST",
      body: payload,
    }),

  // 4. Habits, Vitamins, Water & Workouts
  getHabits: (date) => request(`/api/habits${buildQuery({ date })}`),
  createHabit: (payload) =>
    request("/api/habits", { method: "POST", body: payload }),
  updateHabit: (id, payload) =>
    request(`/api/habits/${id}`, { method: "PATCH", body: payload }),
  deleteHabit: (id) => request(`/api/habits/${id}`, { method: "DELETE" }),
  toggleHabit: (id, payload = {}) =>
    request(`/api/habits/${id}/toggle`, { method: "POST", body: payload }),

  getWater: (date) => request(`/api/water${buildQuery({ date })}`),
  logWater: (payload) =>
    request("/api/water/log", { method: "POST", body: payload }),
  deleteWaterLog: (id) =>
    request(`/api/water/log/${id}`, { method: "DELETE" }),
  setWaterGoal: (goalOrPayload) => {
    const body =
      typeof goalOrPayload === "number"
        ? { daily_goal_ml: goalOrPayload }
        : goalOrPayload;
    return request("/api/water/goal", { method: "PUT", body });
  },

  getWorkouts: (date, days = 30) =>
    request(`/api/workouts${buildQuery({ date, days })}`),
  createWorkout: (payload) =>
    request("/api/workouts", { method: "POST", body: payload }),
  updateWorkout: (id, payload) =>
    request(`/api/workouts/${id}`, { method: "PATCH", body: payload }),
  deleteWorkout: (id) =>
    request(`/api/workouts/${id}`, { method: "DELETE" }),

  // 5. Female Cycle Tracker (12+ months)
  getCycleOverview: (year, month) =>
    request(`/api/cycle/overview${buildQuery({ year, month })}`),
  saveCycleDay: (date, payload) =>
    request(`/api/cycle/day/${date}`, { method: "PUT", body: payload }),
  deleteCycleDay: (date) =>
    request(`/api/cycle/day/${date}`, { method: "DELETE" }),
  updateCycleSettings: (payload) =>
    request("/api/cycle/settings", { method: "PUT", body: payload }),

  // 6. Nutrition & Menu
  getMenu: ({ slot, q } = {}) =>
    request(`/api/nutrition/menu${buildQuery({ slot, q })}`),
  createMenuItem: (payload) =>
    request("/api/nutrition/menu", { method: "POST", body: payload }),
  updateMenuItem: (id, payload) =>
    request(`/api/nutrition/menu/${id}`, { method: "PATCH", body: payload }),
  deleteMenuItem: (id) =>
    request(`/api/nutrition/menu/${id}`, { method: "DELETE" }),

  getNutritionDay: (date) =>
    request(`/api/nutrition/day${buildQuery({ date })}`),
  createMeal: (payload) =>
    request("/api/nutrition/meals", { method: "POST", body: payload }),
  updateMeal: (id, payload) =>
    request(`/api/nutrition/meals/${id}`, { method: "PATCH", body: payload }),
  deleteMeal: (id) =>
    request(`/api/nutrition/meals/${id}`, { method: "DELETE" }),

  // 7. Home Chores & Shopping
  getChores: (date) => request(`/api/home/chores${buildQuery({ date })}`),
  createChore: (payload) =>
    request("/api/home/chores", { method: "POST", body: payload }),
  updateChore: (id, payload) =>
    request(`/api/home/chores/${id}`, { method: "PATCH", body: payload }),
  deleteChore: (id) =>
    request(`/api/home/chores/${id}`, { method: "DELETE" }),
  toggleChore: (id, payload = {}) =>
    request(`/api/home/chores/${id}/toggle`, { method: "POST", body: payload }),

  getShopping: () => request("/api/home/shopping"),
  createShoppingItem: (payload) =>
    request("/api/home/shopping", { method: "POST", body: payload }),
  updateShoppingItem: (id, payload) =>
    request(`/api/home/shopping/${id}`, { method: "PATCH", body: payload }),
  deleteShoppingItem: (id) =>
    request(`/api/home/shopping/${id}`, { method: "DELETE" }),
  clearBoughtShopping: () =>
    request("/api/home/shopping/clear-bought", { method: "POST", body: {} }),
};

export default api;
