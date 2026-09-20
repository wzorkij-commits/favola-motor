// Тарифы в одном месте. Цены и квоты берёт и сервер, и приложение,
// чтобы на экране никогда не было написано одно, а списано другое.

export const CURRENCY = 'EUR';

export const PLANS = {
  month: {
    id: 'month',
    price: 9.99,
    stories: 4,
    days: 30,
    title: { ru: 'Месяц', en: 'One month' },
    note:  { ru: '4 новые сказки', en: '4 new stories' }
  },
  year: {
    id: 'year',
    price: 89,
    stories: 60,
    days: 365,
    title: { ru: 'Год', en: 'One year' },
    note:  { ru: '60 новых сказок', en: '60 new stories' }
  },
  unlimited: {
    id: 'unlimited',
    price: 199,
    stories: 365,                  // по сказке на каждый день года
    days: 365,
    title: { ru: 'Без ограничений', en: 'Unlimited' },
    note:  { ru: '365 новых сказок, по одной на каждый день', en: '365 new stories, one for every day' }
  }
};

// Сколько сказок человек собирает бесплатно, прежде чем увидит тарифы.
export const FREE_STORIES = 2;

// Сказка из записи голоса дороже обычной (очистка звука, расшифровка, кадры по записи),
// поэтому бесплатной может быть только самая первая сказка аккаунта. Дальше только платный доступ.
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
