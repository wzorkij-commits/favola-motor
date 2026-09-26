// Тарифы в одном месте. Цены и квоты берёт и сервер, и приложение,
// чтобы на экране никогда не было написано одно, а списано другое.

export const CURRENCY = 'EUR';

export const PLANS = {
  pack10: {
    id: 'pack10',
    price: 9.99,
    stories: 10,
    days: 3650,                    // пакет не сгорает по времени, только по числу сказок
    title: { ru: '10 сказок', en: '10 stories' },
    note:  { ru: 'Не сгорают, пока не потрачены', en: "Don't expire until used" }
  },
  year: {
    id: 'year',
    price: 49.99,
    stories: null,                 // без ограничений по числу, пока действует год
    days: 365,
    title: { ru: 'Год', en: 'One year' },
    note:  { ru: 'Сказки без ограничений весь год', en: 'Unlimited stories for a year' }
  }
};

// Сколько сказок человек собирает бесплатно, прежде чем увидит тарифы —
// одна, любым способом (запись, чтение с суфлёра или конструктор). Владелец
// (см. lib/owner.js) под это ограничение не попадает вообще.
export const FREE_STORIES = 1;

// Запись голосом — тот же общий бесплатный лимит, отдельного порога больше нет.
export const RECORD_FREE = 1;

export const DONATION = {
  id: 'support',
  title: { ru: 'Поддержать проект', en: 'Support the project' },
  note:  { ru: 'Любая сумма, без доступа', en: 'Any amount, no access attached' },
  min: 1,
  max: 10000
};

/** Что человеку начисляется за покупку. Донат доступа не даёт. */
export function grantFor(planId, now = Date.now()) {
  const p = PLANS[planId];
  if (!p) return null;
  return {
    plan: p.id,
    stories: p.stories,                                   // null = без ограничений
    until: now + p.days * 24 * 60 * 60 * 1000
  };
}

export function priceOf(planId, amount) {
  if (planId === DONATION.id) {
    const a = Number(amount);
    if (!isFinite(a) || a < DONATION.min || a > DONATION.max) return null;
    return Math.round(a * 100) / 100;
  }
  return PLANS[planId] ? PLANS[planId].price : null;
}
