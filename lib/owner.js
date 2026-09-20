// Аккаунты владельца: безлимит без оплаты, чтобы можно было тестировать.
//
// Право выдаётся только тому, кто доказал, что почта его: вошёл через Google
// (подпись проверена, почта подтверждена) или ввёл код из письма. Просто
// написать чужую почту в запросе недостаточно: такие места сюда не ведут.
//
// Список: почта Василия всегда есть. Ещё адреса можно добавить в Vercel,
// Settings → Environment Variables, переменная OWNER_EMAILS (через запятую).

const BUILT_IN = ['wzorkij@gmail.com'];

export function ownerList() {
  const extra = String(process.env.OWNER_EMAILS || '')
    .split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...BUILT_IN, ...extra])];
}

export function isOwner(mail) {
  if (!mail) return false;
  return ownerList().includes(String(mail).trim().toLowerCase());
}

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

/** Выдать безлимит, если почта из списка владельца. Возвращает true, если выдали. */
export function grantOwner(u, mail, now = Date.now()) {
  if (!isOwner(mail)) return false;
  u.plan = 'unlimited';
  u.stories = null;
  u.until = now + TEN_YEARS;
  u.owner = true;
  return true;
}
