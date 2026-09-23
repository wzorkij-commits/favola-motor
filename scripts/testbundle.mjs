// Гоняем собранный файл так, как его будет звать Vercel.
const { default: handler } = await import('../api/favola.js');

function fake(step, body = {}, method = 'POST') {
  let code = 0, payload = null;
  const res = {
    setHeader() {}, status(c) { code = c; return res; },
    json(j) { payload = j; return res; }, end() { return res; }
  };
  return handler({ method, url: `/api/${step}`, query: { step }, body }, res)
    .then(() => ({ code, payload }));
}

// 1. ping без ключей
const ping = await fake('ping', {}, 'GET');
console.log('ping ->', ping.code, ping.payload.status,
  '| конструктов:', ping.payload.constructs, '| текстов ч.6:', ping.payload.panel6_texts);

// 2. неизвестный шаг
const bad = await fake('nonsense');
console.log('неизвестный шаг ->', bad.code, '| known:', bad.payload.known.join(','));

// 3. GET на рабочий шаг
const get = await fake('story', {}, 'GET');
console.log('GET на story ->', get.code, JSON.stringify(get.payload));

// 4. протокол раскрытия — срабатывает без ключей, до модели
const disc = await fake('triage', { request: 'отчим бьёт её, она боится', child: {} });
console.log('раскрытие ->', disc.code, disc.payload.outcome, '|', disc.payload.screen.helplines.length, 'телефона');

// 5. пустой запрос
const empty = await fake('triage', { request: '   ' });
console.log('пустой запрос ->', empty.code, JSON.stringify(empty.payload));

// 6. story с несуществующим конструктом
const nc = await fake('story', { request: 'x', constructId: 'нетакого' });
console.log('плохой конструкт ->', nc.code, JSON.stringify(nc.payload));
