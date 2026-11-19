// Curated Russian presets, domain dictionaries, and iOS PWA copy for Marina Tracker («Ритм»)
// Shared across Today, Habits/Water/Workouts/Cycle, Nutrition, Home, Goals, and App shell.

export const APP_BRAND = {
  shortName: 'Ритм',
  fullName: 'Ритм · Личный трекер Марины',
  ownerName: 'Марина',
  tagline: 'Спокойный ежедневный трекер привычек, питания, цикла, дома и долгосрочных целей',
};

// ---------------------------------------------------------------------------
// 1. Habits, Vitamins & Water
// ---------------------------------------------------------------------------

export const HABIT_PERIODS = [
  { key: 'morning', label: 'Утро', shortLabel: 'Утро', window: '07:00–11:30', icon: 'Sun' },
  { key: 'afternoon', label: 'Обед', shortLabel: 'Обед', window: '12:00–16:30', icon: 'CloudSun' },
  { key: 'evening', label: 'Вечер', shortLabel: 'Вечер', window: '18:00–23:00', icon: 'Moon' },
];

export const HABIT_CATEGORIES = [
  { key: 'habit', label: 'Привычка', plural: 'Привычки', tone: 'habits' },
  { key: 'vitamin', label: 'Витамин', plural: 'Витамины', tone: 'brand' },
];

export const WATER_QUICK_AMOUNTS = [
  { amount_ml: 200, label: '+200 мл', hint: 'Стакан' },
  { amount_ml: 250, label: '+250 мл', hint: 'Кружка' },
  { amount_ml: 500, label: '+500 мл', hint: 'Бутылка' },
];

export const WATER_GOAL_PRESETS = [1500, 1800, 2000, 2200, 2500];

// ---------------------------------------------------------------------------
// 2. Workouts & Guided Practice Timers (Дыхательная практика, Пилатес, Цигун)
// ---------------------------------------------------------------------------

export const WORKOUT_TYPES = [
  {
    key: 'breathing',
    label: 'Дыхательная практика',
    shortLabel: 'Дыхание',
    icon: 'Wind',
    accent: 'water',
    defaultDuration: 8,
    description: 'Выравнивает ритм дыхания, успокаивает нервную систему и возвращает ясность',
  },
  {
    key: 'pilates',
    label: 'Пилатес',
    shortLabel: 'Пилатес',
    icon: 'Activity',
    accent: 'habits',
    defaultDuration: 25,
    description: 'Укрепляет центр тела, улучшает осанку и мягко развивает гибкость',
  },
  {
    key: 'qigong',
    label: 'Цигун',
    shortLabel: 'Цигун',
    icon: 'Flower2',
    accent: 'brand',
    defaultDuration: 20,
    description: 'Плавные движения с дыханием для энергии, баланса и лёгкости в суставах',
  },
  {
    key: 'other',
    label: 'Своя практика',
    shortLabel: 'Своя',
    icon: 'Sparkles',
    accent: 'goals',
    defaultDuration: 20,
    description: 'Прогулка, растяжка, йога или любая активность по настроению',
  },
];

export const WORKOUT_TYPE_MAP = Object.fromEntries(WORKOUT_TYPES.map((w) => [w.key, w]));

export const WORKOUT_DURATIONS = [10, 15, 20, 30, 45, 60];

export const WORKOUT_INTENSITIES = [
  { key: 'light', label: 'Мягко' },
  { key: 'medium', label: 'Средне' },
  { key: 'intense', label: 'Интенсивно' },
];

export const WORKOUT_MOODS = [
  { key: 'calm', label: 'Спокойствие' },
  { key: 'energized', label: 'Бодрость' },
  { key: 'balanced', label: 'Баланс' },
  { key: 'strong', label: 'Сила и тонус' },
  { key: 'relaxed', label: 'Расслабление' },
  { key: 'focused', label: 'Ясная голова' },
];

/**
 * Curated guided presets used by PracticeTimerSheet and WorkoutsTab.
 * Breathing presets carry exact phase timings (seconds) for the visual pacer ring.
 * Pilates / Qigong presets carry structured countdown stages.
 */
export const WORKOUT_PRESETS = {
  breathing: [
    {
      id: 'breath-478',
      workoutType: 'breathing',
      title: 'Дыхание 4–7–8',
      subtitle: 'Мягкое вечернее успокоение и снятие напряжения',
      durationMin: 6,
      cycles: 10,
      intensity: 'light',
      mood: 'relaxed',
      patternLabel: '4 · 7 · 8 сек',
      phases: [
        { key: 'inhale', label: 'Вдох через нос', seconds: 4, scale: 1.0 },
        { key: 'holdIn', label: 'Спокойная задержка', seconds: 7, scale: 1.0 },
        { key: 'exhale', label: 'Плавный выдох', seconds: 8, scale: 0.62 },
      ],
      tip: 'Опустите плечи и расслабьте челюсть. Выдыхайте чуть длиннее вдоха.',
    },
    {
      id: 'breath-box',
      workoutType: 'breathing',
      title: 'Квадратное дыхание',
      subtitle: 'Баланс и фокус в середине дня',
      durationMin: 5,
      cycles: 10,
      intensity: 'light',
      mood: 'focused',
      patternLabel: '4 · 4 · 4 · 4 сек',
      phases: [
        { key: 'inhale', label: 'Вдох', seconds: 4, scale: 1.0 },
        { key: 'holdIn', label: 'Пауза на вдохе', seconds: 4, scale: 1.0 },
        { key: 'exhale', label: 'Выдох', seconds: 4, scale: 0.62 },
        { key: 'holdOut', label: 'Пауза на выдохе', seconds: 4, scale: 0.62 },
      ],
      tip: 'Представляйте ровный квадрат: все четыре стороны одинаково спокойные.',
    },
    {
      id: 'breath-morning',
      workoutType: 'breathing',
      title: 'Утренний поток',
      subtitle: 'Мягкое пробуждение тела и ясное начало дня',
      durationMin: 8,
      cycles: 16,
      intensity: 'light',
      mood: 'energized',
      patternLabel: '4 · 2 · 6 сек',
      phases: [
        { key: 'inhale', label: 'Глубокий вдох', seconds: 4, scale: 1.0 },
        { key: 'holdIn', label: 'Мягкая пауза', seconds: 2, scale: 1.0 },
        { key: 'exhale', label: 'Свободный выдох', seconds: 6, scale: 0.64 },
      ],
      tip: 'Потянитесь макушкой вверх и раскрывайте грудную клетку на каждом вдохе.',
    },
  ],
  pilates: [
    {
      id: 'pilates-core',
      workoutType: 'pilates',
      title: 'Кор и осанка',
      subtitle: 'Укрепление глубоких мышц живота и спины',
      durationMin: 25,
      intensity: 'medium',
      mood: 'balanced',
      stages: [
        { title: 'Настройка дыхания и таза', durationMin: 4, hint: 'Рёберное дыхание, нейтральное положение поясницы' },
        { title: 'Активация центра (Кор)', durationMin: 8, hint: 'Подъём ног поочерёдно, плавная сотня, контроль пресса' },
        { title: 'Спина и плечевой пояс', durationMin: 8, hint: 'Плечевой мост, плавание лёжа, раскрытие лопаток' },
        { title: 'Вытяжение и заминка', durationMin: 5, hint: 'Скручивание позвоночника, поза ребёнка, глубокий выдох' },
      ],
    },
    {
      id: 'pilates-stretch',
      workoutType: 'pilates',
      title: 'Мягкая растяжка',
      subtitle: 'Подвижность суставов и лёгкость во всём теле',
      durationMin: 20,
      intensity: 'light',
      mood: 'balanced',
      stages: [
        { title: 'Мобильность позвоночника', durationMin: 5, hint: 'Кошка-корова, мягкие боковые наклоны' },
        { title: 'Раскрытие тазобедренных', durationMin: 7, hint: 'Круги бедром, поза голубя без усилия' },
        { title: 'Задняя поверхность ног и спина', durationMin: 5, hint: 'Плавные наклоны на выдохе' },
        { title: 'Тихое восстановление', durationMin: 3, hint: 'Лёжа на спине, ощущение опоры и тепла' },
      ],
    },
    {
      id: 'pilates-evening',
      workoutType: 'pilates',
      title: 'Вечерний релакс',
      subtitle: 'Снятие усталости с шеи, плеч и поясницы',
      durationMin: 15,
      intensity: 'light',
      mood: 'relaxed',
      stages: [
        { title: 'Освобождение шеи и плеч', durationMin: 4, hint: 'Медленные круги плечами, мягкое вытяжение шеи' },
        { title: 'Разгрузка поясницы', durationMin: 6, hint: 'Колени к груди, мягкие покачивания, мост' },
        { title: 'Спокойное дыхание лёжа', durationMin: 5, hint: 'Замедление выдоха и отпускание напряжения' },
      ],
    },
  ],
  qigong: [
    {
      id: 'qigong-brocades',
      workoutType: 'qigong',
      title: '8 кусков парчи',
      subtitle: 'Классический оздоровительный комплекс Ба Дуань Цзинь',
      durationMin: 20,
      intensity: 'medium',
      mood: 'energized',
      stages: [
        { title: 'Стойка и центрирование', durationMin: 3, hint: 'Стопы на ширине плеч, мягкие колени, ровное дыхание' },
        { title: 'Формы 1–4 (верх и грудная клетка)', durationMin: 7, hint: 'Поддержка неба, натягивание лука, разделение неба и земли' },
        { title: 'Формы 5–8 (поясница и баланс)', durationMin: 7, hint: 'Покачивания, поклон к стопам, подъём на носки' },
        { title: 'Собирание ци в центре', durationMin: 3, hint: 'Ладони на нижней части живота, 6 спокойных вдохов' },
      ],
    },
    {
      id: 'qigong-morning',
      workoutType: 'qigong',
      title: 'Утреннее пробуждение энергии',
      subtitle: 'Мягкая разминка суставов, простукивание и поток',
      durationMin: 15,
      intensity: 'light',
      mood: 'energized',
      stages: [
        { title: 'Потряхивание и сброс застоя', durationMin: 3, hint: 'Лёгкая вибрация в коленях и плечах' },
        { title: 'Скручивания корпуса «Барабанчик»', durationMin: 4, hint: 'Свободные руки мягко касаются поясницы' },
        { title: 'Подъём и опускание энергии', durationMin: 5, hint: 'Синхронизация плавных рук с вдохом и выдохом' },
        { title: 'Завершение и намерение на день', durationMin: 3, hint: 'Тишина в теле и тёплое внимание к себе' },
      ],
    },
    {
      id: 'qigong-balance',
      workoutType: 'qigong',
      title: 'Дыхание и баланс',
      subtitle: 'Заземление, ровный ритм и восстановление опоры',
      durationMin: 12,
      intensity: 'light',
      mood: 'calm',
      stages: [
        { title: 'Опора в стопах', durationMin: 3, hint: 'Плавный перенос веса справа налево' },
        { title: 'Облачные руки', durationMin: 6, hint: 'Медленное движение ладоней, взгляд мягкий' },
        { title: 'Закрытие практики', durationMin: 3, hint: 'Глубокое брюшное дыхание, ладони на центре' },
      ],
    },
  ],
  other: [
    {
      id: 'other-custom',
      workoutType: 'other',
      title: 'Свободная практика',
      subtitle: 'Спокойный таймер для прогулки, йоги или своей тренировки',
      durationMin: 20,
      intensity: 'medium',
      mood: 'energized',
      stages: [
        { title: 'Разминка', durationMin: 3, hint: 'Мягкий вход в движение' },
        { title: 'Основная часть', durationMin: 14, hint: 'В своём комфортном темпе' },
        { title: 'Заминка и дыхание', durationMin: 3, hint: 'Спокойное завершение' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. Female Cycle Tracker Dictionaries
// ---------------------------------------------------------------------------

export const CYCLE_PHASES = {
  menstruation: {
    key: 'menstruation',
    label: 'Менструация',
    shortLabel: 'Менструация',
    tone: 'cycle',
    guidance: 'Бережный ритм: больше тепла, воды и мягкого восстановления.',
  },
  follicular: {
    key: 'follicular',
    label: 'Фолликулярная фаза',
    shortLabel: 'Фолликулярная',
    tone: 'habits',
    guidance: 'Энергия постепенно растёт — хорошее время для новых задач и практик.',
  },
  ovulation: {
    key: 'ovulation',
    label: 'Овуляция',
    shortLabel: 'Овуляция',
    tone: 'nutrition',
    guidance: 'Пик жизненного тонуса, открытости и физической активности.',
  },
  luteal: {
    key: 'luteal',
    label: 'Лютеиновая фаза',
    shortLabel: 'Лютеиновая',
    tone: 'goals',
    guidance: 'Время завершать начатое, заботиться о сне и выбирать спокойные практики.',
  },
};

export const CYCLE_FLOW_LEVELS = [
  { key: 'none', label: 'Нет', dots: 0 },
  { key: 'light', label: 'Лёгкие', dots: 1 },
  { key: 'medium', label: 'Средние', dots: 2 },
  { key: 'heavy', label: 'Обильные', dots: 3 },
];

export const CYCLE_SYMPTOMS = [
  { key: 'cramps', label: 'Тянет живот', icon: 'Flame', group: 'body' },
  { key: 'fatigue', label: 'Усталость', icon: 'BatteryLow', group: 'energy' },
  { key: 'headache', label: 'Головная боль', icon: 'CloudRain', group: 'body' },
  { key: 'bloating', label: 'Отёки', icon: 'Droplets', group: 'body' },
  { key: 'mood_swings', label: 'Перепады настроения', icon: 'Cloud', group: 'mood' },
  { key: 'tender_breasts', label: 'Чувствительность груди', icon: 'Heart', group: 'body' },
  { key: 'back_pain', label: 'Поясница', icon: 'Activity', group: 'body' },
  { key: 'cravings', label: 'Тяга к сладкому', icon: 'Cookie', group: 'body' },
  { key: 'high_energy', label: 'Прилив энергии', icon: 'Sparkles', group: 'energy' },
  { key: 'calm_sleep', label: 'Спокойный сон', icon: 'Moon', group: 'energy' },
];

export const CYCLE_SYMPTOM_MAP = Object.fromEntries(
  CYCLE_SYMPTOMS.map((s) => [s.key, s]),
);

export function getSymptomLabel(key) {
  if (!key) return '';
  return CYCLE_SYMPTOM_MAP[key]?.label || key;
}

export const CYCLE_MOODS = [
  { key: 'calm', label: 'Спокойствие', icon: 'Feather' },
  { key: 'balanced', label: 'Равновесие', icon: 'Scale' },
  { key: 'energized', label: 'Подъём', icon: 'Sun' },
  { key: 'tender', label: 'Нежность', icon: 'Heart' },
  { key: 'tired', label: 'Усталость', icon: 'Moon' },
  { key: 'sensitive', label: 'Чувствительность', icon: 'Cloud' },
];

// ---------------------------------------------------------------------------
// 4. Nutrition & Menu Meal Presets
// ---------------------------------------------------------------------------

export const MEAL_SLOTS = [
  {
    key: 'breakfast',
    label: 'Завтрак',
    window: '07:30–10:00',
    defaultTime: '08:30',
    quickTimes: ['07:30', '08:30', '09:30'],
    icon: 'Sunrise',
  },
  {
    key: 'lunch',
    label: 'Обед',
    window: '12:30–15:00',
    defaultTime: '13:30',
    quickTimes: ['12:30', '13:30', '14:30'],
    icon: 'Sun',
  },
  {
    key: 'dinner',
    label: 'Ужин',
    window: '18:00–20:30',
    defaultTime: '19:00',
    quickTimes: ['18:00', '19:00', '20:00'],
    icon: 'Sunset',
  },
  {
    key: 'snack',
    label: 'Перекус',
    window: 'по желанию',
    defaultTime: '16:00',
    quickTimes: ['11:00', '16:00', '21:00'],
    icon: 'Apple',
  },
];

export const MEAL_SLOT_MAP = Object.fromEntries(MEAL_SLOTS.map((s) => [s.key, s]));

export const PORTION_UNITS = [
  { key: 'г', label: 'г' },
  { key: 'мл', label: 'мл' },
  { key: 'порция', label: 'порция' },
  { key: 'шт', label: 'шт' },
  { key: 'ложка', label: 'ложка' },
];

export const PORTION_PRESETS = [
  { key: 'half', label: '½ порции', mode: 'multiplier', value: 0.5 },
  { key: 'one', label: '1 порция', mode: 'multiplier', value: 1 },
  { key: 'one-half', label: '1.5 порции', mode: 'multiplier', value: 1.5 },
  { key: 'g150', label: '150 г', mode: 'grams', value: 150 },
  { key: 'g250', label: '250 г', mode: 'grams', value: 250 },
];

export const NUTRITION_QUICK_NOTES = [
  'Домашнее',
  'Без сахара',
  'Тёплое',
  'С зеленью',
  'Вне дома',
];

// ---------------------------------------------------------------------------
// 5. Home Chores & Grocery Taxonomy
// ---------------------------------------------------------------------------

export const CHORE_ZONES = [
  { key: 'Кухня', label: 'Кухня', icon: 'UtensilsCrossed' },
  { key: 'Ванная', label: 'Ванная', icon: 'Droplets' },
  { key: 'Комнаты', label: 'Комнаты', icon: 'Sofa' },
  { key: 'Стирка', label: 'Стирка', icon: 'Shirt' },
  { key: 'Общее', label: 'Общее', icon: 'Home' },
];

export const CHORE_FREQUENCIES = [
  { key: 'daily', label: 'Ежедневно', shortLabel: 'Каждый день' },
  { key: 'weekly', label: 'Раз в неделю', shortLabel: 'Раз в нед.' },
  { key: 'monthly', label: 'Раз в месяц', shortLabel: 'Раз в мес.' },
  { key: 'once', label: 'Разово', shortLabel: 'Разово' },
];

export const CHORE_FREQUENCY_MAP = Object.fromEntries(CHORE_FREQUENCIES.map((f) => [f.key, f]));

export const GROCERY_CATEGORIES = [
  { key: 'Овощи и фрукты', label: 'Овощи и фрукты', icon: 'Salad' },
  { key: 'Белок и рыба', label: 'Белок и рыба', icon: 'Fish' },
  { key: 'Молочное', label: 'Молочное', icon: 'Milk' },
  { key: 'Бакалея', label: 'Бакалея', icon: 'Wheat' },
  { key: 'Напитки и перекусы', label: 'Напитки и перекусы', icon: 'Coffee' },
  { key: 'Прочее', label: 'Прочее', icon: 'ShoppingBag' },
];

export const GROCERY_CATEGORY_MAP = Object.fromEntries(
  GROCERY_CATEGORIES.map((c) => [c.key, c]),
);

export const HOUSEHOLD_CATEGORIES = [
  { key: 'Моющие и уборка', label: 'Моющие и уборка', icon: 'SprayCan' },
  { key: 'Бытовая техника', label: 'Бытовая техника', icon: 'Sparkles' },
  { key: 'Мебель и интерьер', label: 'Мебель и интерьер', icon: 'Sofa' },
  { key: 'Текстиль и уют', label: 'Текстиль и уют', icon: 'Home' },
  { key: 'Хозтовары', label: 'Хозтовары', icon: 'ShoppingBag' },
  { key: 'Ремонт и мелочи', label: 'Ремонт и мелочи', icon: 'Wrench' },
];

export const HOUSEHOLD_CATEGORY_MAP = Object.fromEntries(
  HOUSEHOLD_CATEGORIES.map((c) => [c.key, c]),
);

export const SHOPPING_CATEGORIES = [
  ...GROCERY_CATEGORIES,
  ...HOUSEHOLD_CATEGORIES,
];

export const SHOPPING_CATEGORY_MAP = Object.fromEntries(
  SHOPPING_CATEGORIES.map((c) => [c.key, c]),
);

export const GRATITUDE_CATEGORIES = [
  { key: 'self', label: 'Себе' },
  { key: 'people', label: 'Близким' },
  { key: 'day', label: 'Дню' },
  { key: 'body', label: 'Телу' },
  { key: 'other', label: 'Другое' },
];

export const GRATITUDE_CATEGORY_MAP = Object.fromEntries(
  GRATITUDE_CATEGORIES.map((c) => [c.key, c]),
);

export const EVENT_CATEGORIES = [
  { key: 'doctor', label: 'Врач' },
  { key: 'beauty', label: 'Косметолог' },
  { key: 'meeting', label: 'Встреча' },
  { key: 'event', label: 'Событие' },
  { key: 'personal', label: 'Личное' },
  { key: 'home', label: 'Дом' },
];

export const EVENT_CATEGORY_MAP = Object.fromEntries(
  EVENT_CATEGORIES.map((c) => [c.key, c]),
);

// ---------------------------------------------------------------------------
// 6. Daily Tasks, Reflection & Multi-Year Goals
// ---------------------------------------------------------------------------

export const TASK_PRIORITIES = [
  { key: 'high', label: 'Важно', tone: 'danger' },
  { key: 'medium', label: 'Обычно', tone: 'warning' },
  { key: 'low', label: 'Не срочно', tone: 'neutral' },
];

export const TASK_SECTIONS = [
  { key: 'personal', label: 'Личное', tone: 'brand' },
  { key: 'health', label: 'Здоровье', tone: 'habits' },
  { key: 'home', label: 'Дом', tone: 'home' },
  { key: 'goal', label: 'Цели', tone: 'goals' },
  { key: 'work', label: 'Работа', tone: 'neutral' },
];

export const TASK_SECTION_MAP = Object.fromEntries(TASK_SECTIONS.map((s) => [s.key, s]));

export const DAY_MOODS = [
  { key: 'calm', label: 'Спокойный' },
  { key: 'energized', label: 'Бодрый' },
  { key: 'inspired', label: 'Вдохновлённый' },
  { key: 'balanced', label: 'Ровный' },
  { key: 'tired', label: 'Усталый' },
];

export const MOOD_LABEL_MAP = {
  calm: 'Спокойствие',
  energized: 'Бодрость',
  balanced: 'Равновесие',
  strong: 'Сила и тонус',
  relaxed: 'Расслабление',
  focused: 'Ясная голова',
  inspired: 'Вдохновение',
  tender: 'Нежность',
  tired: 'Усталость',
  sensitive: 'Чувствительность',
  grateful: 'Благодарность',
};

export function getMoodLabel(key) {
  if (!key) return '';
  return MOOD_LABEL_MAP[key] || key;
}

export const ENERGY_LEVELS = [
  { value: 1, label: 'Низкая' },
  { value: 2, label: 'Спокойная' },
  { value: 3, label: 'Ровная' },
  { value: 4, label: 'Хорошая' },
  { value: 5, label: 'Высокая' },
];

export const GOAL_SPHERES = [
  { key: 'Здоровье и спорт', label: 'Здоровье и спорт', icon: 'HeartPulse', tone: 'cobalt' },
  { key: 'Семья и отношения', label: 'Семья и отношения', icon: 'Heart', tone: 'cobalt' },
  { key: 'Друзья и социум', label: 'Друзья и социум', icon: 'Users', tone: 'cobalt' },
  { key: 'Развлечения и отдых', label: 'Развлечения и отдых', icon: 'Sparkles', tone: 'cobalt' },
  { key: 'Хобби и увлечения', label: 'Хобби и увлечения', icon: 'BookOpen', tone: 'cobalt' },
  { key: 'Деньги и благосостояние', label: 'Деньги и благосостояние', icon: 'Wallet', tone: 'cobalt' },
  { key: 'Работа и бизнес', label: 'Работа и бизнес', icon: 'Briefcase', tone: 'cobalt' },
];

export const GOAL_HORIZONS = [
  {
    key: 'month',
    value: 'month',
    horizon_unit: 'month',
    horizon_years: 1,
    years: 0,
    months: 1,
    label: '1 месяц',
    shortLabel: '1 мес.',
  },
  {
    key: '1y',
    value: '1y',
    horizon_unit: 'year',
    horizon_years: 1,
    years: 1,
    months: 12,
    label: '1 год',
    shortLabel: '1 год',
  },
  {
    key: '5y',
    value: '5y',
    horizon_unit: 'year',
    horizon_years: 5,
    years: 5,
    months: 60,
    label: '5 лет',
    shortLabel: '5 лет',
  },
];

export function formatGoalHorizonRu(goal) {
  if (!goal) return '1 год';
  if (goal.horizon_unit === 'month') return '1 месяц';
  const y = Number(goal.horizon_years) || 1;
  if (y === 1) return '1 год';
  if (y >= 5) return `${y} лет`;
  if (y >= 2 && y <= 4) return `${y} года`;
  return `${y} лет`;
}

export const GOAL_CHECKIN_CADENCES = [
  { key: 'weekly', label: 'Раз в неделю' },
  { key: 'biweekly', label: 'Раз в 2 недели' },
  { key: 'monthly', label: 'Раз в месяц' },
];

export const QUARTER_OPTIONS = [
  { value: 'Q1', label: '1 кв.' },
  { value: 'Q2', label: '2 кв.' },
  { value: 'Q3', label: '3 кв.' },
  { value: 'Q4', label: '4 кв.' },
];

export const QUARTER_LABEL_MAP = Object.fromEntries(
  QUARTER_OPTIONS.map((q) => [q.value, q.label]),
);

export function formatQuarterRu(q) {
  if (q == null || q === '') return '';
  const raw = String(q).trim();
  const upper = raw.toUpperCase();
  if (QUARTER_LABEL_MAP[upper]) return QUARTER_LABEL_MAP[upper];
  const digitMatch = upper.match(/^Q?([1-4])$/);
  if (digitMatch) return `${digitMatch[1]} кв.`;
  return raw;
}

export function formatYearQuarterRu(year, quarter) {
  const qLabel = formatQuarterRu(quarter);
  if (qLabel && year) return `${qLabel} ${year}`;
  if (year) return String(year);
  return qLabel;
}

export const GOAL_PACE_META = {
  on_track: {
    key: 'on_track',
    label: 'В графике',
    shortLabel: 'В графике',
    tone: 'success',
    cssModifier: 'on_track',
    hint: 'Темп соответствует плану — продолжайте в том же ритме.',
  },
  ahead: {
    key: 'ahead',
    label: 'Опережаю план',
    shortLabel: 'Опережаю',
    tone: 'cobalt',
    cssModifier: 'ahead',
    hint: 'Вы движетесь быстрее намеченного срока.',
  },
  at_risk: {
    key: 'at_risk',
    label: 'Нужно внимание',
    shortLabel: 'Внимание',
    tone: 'warning',
    cssModifier: 'at_risk',
    hint: 'Пора сделать небольшой шаг или обновить чек-ин.',
  },
  attention: {
    key: 'attention',
    label: 'Нужно внимание',
    shortLabel: 'Внимание',
    tone: 'warning',
    cssModifier: 'at_risk',
    hint: 'Пора сделать небольшой шаг или обновить чек-ин.',
  },
};

export const GOAL_STARTER_BLUEPRINTS = [
  {
    id: 'blueprint-body',
    title: 'Сильное гибкое тело и спокойное дыхание',
    description: 'Регулярные занятия пилатесом, цигуном и дыхательной практикой 3–4 раза в неделю без перегрузки.',
    category: 'Здоровье и спорт',
    horizon_unit: 'year',
    horizon_years: 1,
    check_in_cadence: 'weekly',
    milestones: [
      { title: 'Сформировать устойчивый ритм: 3 практики в неделю', offsetMonths: 3 },
      { title: 'Свободно выполнять базовый комплекс 30 минут', offsetMonths: 6 },
      { title: 'Уверенная осанка и 100+ практик за год', offsetMonths: 12 },
    ],
  },
  {
    id: 'blueprint-month-sprint',
    title: 'Месяц без пропусков утренних практик',
    description: 'Короткий фокусный шаг на 30 дней: дыхание, вода и спокойный утренний старт.',
    category: 'Здоровье и спорт',
    horizon_unit: 'month',
    horizon_years: 1,
    check_in_cadence: 'weekly',
    milestones: [
      { title: 'Первая неделя в стабильном ритме', offsetMonths: 1 },
    ],
  },
  {
    id: 'blueprint-language',
    title: 'Свободный английский для жизни и путешествий',
    description: 'Живое чтение, подкасты и разговорная практика маленькими шагами.',
    category: 'Хобби и увлечения',
    horizon_unit: 'year',
    horizon_years: 1,
    check_in_cadence: 'weekly',
    milestones: [
      { title: 'Устойчивый словарь и 20 минут практики 4 раза в неделю', offsetMonths: 4 },
      { title: 'Свободный разговорный клуб и книги в оригинале', offsetMonths: 8 },
      { title: 'Свободное общение и чтение без языкового барьера', offsetMonths: 12 },
    ],
  },
  {
    id: 'blueprint-finance',
    title: 'Финансовая подушка и спокойный капитал',
    description: 'Ежемесячное пополнение резерва и осознанное планирование крупных целей на 5 лет.',
    category: 'Деньги и благосостояние',
    horizon_unit: 'year',
    horizon_years: 5,
    check_in_cadence: 'monthly',
    milestones: [
      { title: 'Настроить автоматический перевод 15% дохода', offsetMonths: 6 },
      { title: 'Собрать резерв на 6 месяцев спокойной жизни', offsetMonths: 18 },
      { title: 'Сформировать устойчивый долгосрочный капитал', offsetMonths: 60 },
    ],
  },
  {
    id: 'blueprint-home',
    title: 'Тёплый ритм семьи и уютный дом',
    description: 'Совместные традиции, спокойный быт и поэтапное обновление пространства.',
    category: 'Семья и отношения',
    horizon_unit: 'year',
    horizon_years: 5,
    check_in_cadence: 'monthly',
    milestones: [
      { title: 'Навести базовую систему хранения на кухне и в шкафах', offsetMonths: 12 },
      { title: 'Обновить текстиль, свет и рабочую зону', offsetMonths: 30 },
      { title: 'Завершить все этапы обновления пространства', offsetMonths: 60 },
    ],
  },
];

// ---------------------------------------------------------------------------
// 7. iPhone 14 Pro Safari & Chrome Standalone PWA Instructions
// ---------------------------------------------------------------------------

export const PWA_INSTALL_GUIDES = {
  safari: {
    browser: 'Safari на iPhone',
    badge: 'Рекомендуем',
    summary: 'Откроет «Ритм» на весь экран без нижней панели браузера — как родное приложение iOS.',
    steps: [
      {
        step: 1,
        icon: 'Share',
        title: 'Нажмите «Поделиться»',
        detail: 'Квадрат со стрелкой вверх в нижней панели Safari.',
      },
      {
        step: 2,
        icon: 'PlusSquare',
        title: 'Выберите «На экран „Домой“»',
        detail: 'Пролистайте меню чуть ниже и нажмите на этот пункт.',
      },
      {
        step: 3,
        icon: 'CheckCircle2',
        title: 'Нажмите «Добавить»',
        detail: 'Иконка «Ритм» появится на главном экране — запускайте приложение с неё.',
      },
    ],
  },
  chrome: {
    browser: 'Chrome на iPhone',
    badge: 'Тоже работает',
    summary: 'На iOS Chrome также умеет добавлять ярлык «Ритм» на экран «Домой» в полноэкранном режиме.',
    steps: [
      {
        step: 1,
        icon: 'Share',
        title: 'Нажмите «Поделиться» в адресной строке',
        detail: 'Иконка квадрата со стрелкой вверх справа от адреса сайта.',
      },
      {
        step: 2,
        icon: 'PlusSquare',
        title: 'Нажмите «На экран „Домой“»',
        detail: 'Если пункта сразу не видно, прокрутите список действий вниз.',
      },
      {
        step: 3,
        icon: 'CheckCircle2',
        title: 'Подтвердите «Добавить»',
        detail: 'Откройте «Ритм» с экрана «Домой» — нижняя панель браузера скроется.',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 8. Russian Pluralization Helpers
// ---------------------------------------------------------------------------

export function pluralRu(count, one, few, many) {
  const n = Math.abs(Number(count) || 0) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

export function formatCountRu(count, one, few, many) {
  return `${count} ${pluralRu(count, one, few, many)}`;
}

export function getGreetingByHour(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return `Доброе утро, ${APP_BRAND.ownerName}`;
  if (hour >= 12 && hour < 18) return `Добрый день, ${APP_BRAND.ownerName}`;
  if (hour >= 18 && hour < 23) return `Добрый вечер, ${APP_BRAND.ownerName}`;
  return `Спокойной ночи, ${APP_BRAND.ownerName}`;
}
