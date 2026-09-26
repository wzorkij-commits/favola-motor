// Быстрая проверка без сети и без ключей: все модули грузятся без ошибок,
// данные библиотеки в порядке, а чистая логика (без обращений к провайдерам)
// ведёт себя правильно. Живые проверки провайдеров — через /api/ping?test=...
// уже в развёрнутом виде, отдельно (нужны настоящие ключи).
import assert from 'node:assert/strict';

let ok = 0, fail = 0;
function check(name, fn) {
  try { fn(); ok++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '  -> ' + e.message); }
}

console.log('модули api/*.js загружаются');
const apiFiles = ['account', 'auth', 'pay', 'ping', 'record', 'image', 'hero', 'voice', 'library', 'wizard', 'stories'];
for (const f of apiFiles) {
  try { await import('../api/' + f + '.js'); ok++; console.log('  ok   загрузился api/' + f + '.js'); }
  catch (e) { fail++; console.log('  FAIL api/' + f + '.js не загрузился -> ' + e.message); }
}

console.log('\nбиблиотека сказок (data/library.js)');
const { LIBRARY, libraryList, libraryOne } = await import('../data/library.js');
check('в библиотеке двенадцать сказок', () => assert.equal(LIBRARY.length, 12));
check('шесть русских, шесть английских', () => {
  assert.equal(LIBRARY.filter(s => s.lang === 'ru').length, 6);
  assert.equal(LIBRARY.filter(s => s.lang === 'en').length, 6);
});
check('все id разные', () => assert.equal(new Set(LIBRARY.map(s => s.id)).size, LIBRARY.length));
check('у каждой сказки есть текст, источник и оценка времени', () => {
  for (const s of LIBRARY) {
    assert.ok(s.text && s.text.length > 30, s.id + ': текст пустой или совсем короткий');
    assert.ok(s.source && s.source.length > 5, s.id + ': нет источника');
    assert.ok(s.estMinutes > 0, s.id + ': нет оценки времени чтения');
  }
});
check('libraryList фильтрует по языку', () => assert.equal(libraryList('ru').length, 6));
check('libraryOne находит по id, иначе null', () => {
  assert.equal(libraryOne('ru-repka').title, 'Репка');
  assert.equal(libraryOne('нет-такой'), null);
});

console.log('\nтарифы (lib/plans.js) — пакет сказок, год без ограничений, донат');
const { PLANS, FREE_STORIES, RECORD_FREE, grantFor } = await import('../lib/plans.js');
check('два тарифа: pack10, year', () => assert.deepEqual(Object.keys(PLANS).sort(), ['pack10', 'year']));
check('grantFor(pack10) даёт 10 сказок', () => {
  const g = grantFor('pack10', 0);
  assert.equal(g.stories, 10);
});
check('grantFor(year) даёт безлимит на 365 дней', () => {
  const g = grantFor('year', 0);
  assert.equal(g.stories, null);
  assert.equal(g.until, 365 * 86400000);
});
check('FREE_STORIES=1: ровно одна бесплатная сказка любым способом', () => { assert.equal(FREE_STORIES, 1); assert.equal(RECORD_FREE, 1); });

console.log('\nправила аккаунта (lib/store.js) — тот же счётчик, что списывает Favola');
const { canMake, canMakeRecord, blankUser, publicView, linkIdentity, emailKey, saveUser } = await import('../lib/store.js');
check('свежий аккаунт может сделать бесплатную сказку', () => {
  const u = blankUser('dev1');
  assert.equal(canMake(u, FREE_STORIES).ok, true);
});
check('после FREE_STORIES бесплатных без оплаты — нельзя', () => {
  const u = blankUser('dev2'); u.made = FREE_STORIES;
  assert.equal(canMake(u, FREE_STORIES).ok, false);
});
check('вторая сказка из записи без оплаты — нельзя (RECORD_FREE=1)', () => {
  const u = blankUser('dev3'); u.made = 1;
  assert.equal(canMakeRecord(u, FREE_STORIES, RECORD_FREE).ok, false);
});
check('publicView не отдаёт лишнего', () => {
  const u = blankUser('dev4');
  const v = publicView(u, FREE_STORIES, RECORD_FREE);
  assert.ok(!('payments' in v));
});
await (async () => {
  // Главная жалоба Василия: «зашёл под своей почтой с другого устройства —
  // а сказок нет». linkIdentity должен подтягивать radio_made (список своих
  // сказок Radio) точно так же, как уже подтягивает shelf для Favola.
  try {
    const mail = emailKey('semya-' + Date.now() + '@example.com');
    const devA = blankUser('devA-' + Date.now()); devA.radio_made = ['rd1', 'rd2'];
    await linkIdentity(devA, mail);
    await saveUser(devA);
    const devB = blankUser('devB-' + Date.now());
    await linkIdentity(devB, mail);
    assert.ok(devB.radio_made.includes('rd1') && devB.radio_made.includes('rd2'),
      'на новом устройстве под той же почтой нет сказок с первого: ' + JSON.stringify(devB.radio_made));
    ok++; console.log('  ok   при входе с новой почты/устройства свои сказки Radio подтягиваются с других устройств');
  } catch (e) { fail++; console.log('  FAIL при входе с новой почты/устройства свои сказки Radio подтягиваются с других устройств  -> ' + e.message); }
})();

console.log('\nразбор записи (lib/record.js) — переиспользованная логика Favola');
const { splitSentences, sceneCountFor, cleanShows, timeline } = await import('../lib/record.js');
check('splitSentences режет по точке', () => {
  const words = 'Раз. Два.'.split(' ').map((t, i) => ({ t, s: i, e: i + 0.5 }));
  const s = splitSentences(words);
  assert.ok(s.length >= 2);
});
check('sceneCountFor держится в границах 3..6', () => {
  assert.ok(sceneCountFor(300, 30) <= 6);
  assert.ok(sceneCountFor(5, 2) >= 1);
});
check('cleanShows убирает повторы и режет длину списка', () => {
  assert.deepEqual(cleanShows(['кот', 'КОТ', 'дом', 'дом', 'дом', 'а', 'б', 'в', 'г']).length <= 6, true);
});

console.log('\nподсказки (lib/prompts.js) — новые для Radio собраны без ошибок');
const { buildWizardPrompt, buildPolishPrompt, buildLibraryScenesPrompt, WIZARD_SYSTEM, POLISH_SYSTEM } = await import('../lib/prompts.js');
check('buildWizardPrompt подставляет все восемь ответов', () => {
  const p = buildWizardPrompt(['Ася', 'зверь', 'мёд', 'дождь', 'сова', 'лес', 'спрятался', 'подождал'], 'ru');
  assert.ok(p.includes('Ася') && p.includes('подождал'));
});
check('buildPolishPrompt нумерует предложения', () => {
  const p = buildPolishPrompt(['Раз.', 'Два.'], 'ru');
  assert.ok(p.includes('0: Раз.') && p.includes('1: Два.'));
});
check('buildLibraryScenesPrompt нумерует абзацы', () => {
  const p = buildLibraryScenesPrompt(['Абзац один.', 'Абзац два.'], 'ru');
  assert.ok(p.includes('0: Абзац один.'));
});
check('системные подсказки не пустые', () => { assert.ok(WIZARD_SYSTEM.length > 100); assert.ok(POLISH_SYSTEM.length > 100); });

console.log('\nсвои сказки (api/stories.js) — сохранение не должно молчать об ошибке');
{
  const storiesHandler = (await import('../api/stories.js')).default;
  // Маленькая подмена req/res в духе Vercel: handler читает req.method/query/body
  // и вызывает res.status(...).json(...).
  function call(req) {
    const res = { _status: 200, status(c){ this._status=c; return this; }, json(o){ this._body=o; return this; }, end(){ return this; }, setHeader(){ return this; } };
    req.query = req.query || {};
    return storiesHandler(req, res).then(() => ({ status: res._status, body: res._body }));
  }
  const device = 'selftest-device-' + Date.now();
  let sid = null;
  await (async () => {
    try {
      const r = await call({ method:'POST', body: { device, act:'start', story: {
        kind:'record', title:'Т', lang:'ru', panels:['раз','два'], questions:[],
        audio: { url: 'data:audio/webm;base64,QQ==', timeline: [], words: [], pauses: [] }
      } } });
      assert.equal(r.status, 200);
      assert.ok(r.body && r.body.id, 'нет id: ' + JSON.stringify(r.body));
      sid = r.body.id;
      ok++; console.log('  ok   act:start заводит сказку и не пишет data:-строку голоса в опись');
    } catch (e) { fail++; console.log('  FAIL act:start заводит сказку и не пишет data:-строку голоса в опись  -> ' + e.message); }
  })();
  await (async () => {
    try {
      assert.ok(sid, 'предыдущий шаг не завёл сказку');
      // Без BLOB_READ_WRITE_TOKEN/BLOB_STORE_ID (как в этой песочнице) хранилище файлов
      // не подключено — раньше act:asset тут молча отвечал «ok», а картинка терялась.
      const r = await call({ method:'POST', body: { device, act:'asset', id: sid, name:'panel-1', data:'data:image/jpeg;base64,QQ==' } });
      assert.ok(r.body && r.body.error, 'ожидали явную ошибку, получили: ' + JSON.stringify(r.body));
      ok++; console.log('  ok   act:asset без файлового хранилища возвращает понятную ошибку, а не тихий "ok"');
    } catch (e) { fail++; console.log('  FAIL act:asset без файлового хранилища возвращает понятную ошибку, а не тихий "ok"  -> ' + e.message); }
  })();
}

console.log('\nпрямая загрузка записи в хранилище (/api/upload) и хранение оригинала');
{
  const rec = await import('../lib/record.js');
  const recordHandler = (await import('../api/record.js')).default;
  const storiesHandler = (await import('../api/stories.js')).default;
  function mk(handler) {
    return req => {
      const res = { _status: 200, status(c){ this._status=c; return this; }, json(o){ this._body=o; return this; }, end(){ return this; }, setHeader(){ return this; } };
      req.query = req.query || {};
      return handler(req, res).then(() => ({ status: res._status, body: res._body }));
    };
  }
  const callRec = mk(recordHandler), callSt = mk(storiesHandler);
  check('путь загрузки лежит внутри radio-raw/ и не пускает чужие символы', () => {
    const p = rec.uploadPath('../../evil dev', 'take.m4a');
    assert.ok(p.startsWith('radio-raw/evildev/'), p);
    assert.ok(p.endsWith('.m4a'), p);
    assert.equal(rec.uploadPath('', 'x.webm'), null);
    assert.ok(rec.uploadPath('d1', 'x.exe').endsWith('.webm'));
  });
  await (async () => {
    const name = 'без ключа хранилища /api/upload честно говорит «no-storage»';
    try {
      const saved = process.env.BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN;
      const r = await callRec({ method:'POST', query:{ __r:'upload' }, body:{ device:'d1', name:'t.webm' } });
      if (saved) process.env.BLOB_READ_WRITE_TOKEN = saved;
      assert.equal(r.status, 503); assert.equal(r.body.outcome, 'no-storage');
      ok++; console.log('  ok   ' + name);
    } catch (e) { fail++; console.log('  FAIL ' + name + '  -> ' + e.message); }
  })();
  await (async () => {
    const name = 'с ключом хранилища /api/upload выдаёт пропуск на один путь';
    try {
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_secretsecretsecret';
      const r = await callRec({ method:'POST', query:{ __r:'upload' }, body:{ device:'d1', name:'t.webm' } });
      delete process.env.BLOB_READ_WRITE_TOKEN;
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(String(r.body.clientToken).startsWith('vercel_blob_client_'), 'не пропуск: ' + r.body.clientToken);
      assert.ok(r.body.pathname.startsWith('radio-raw/d1/'));
      const payload = JSON.parse(Buffer.from(Buffer.from(r.body.clientToken.split('_').pop(), 'base64').toString().split('.')[1], 'base64').toString());
      assert.equal(payload.pathname, r.body.pathname);
      assert.equal(payload.maximumSizeInBytes, rec.MAX_UPLOAD_BYTES);
      ok++; console.log('  ok   ' + name);
    } catch (e) { delete process.env.BLOB_READ_WRITE_TOKEN; fail++; console.log('  FAIL ' + name + '  -> ' + e.message); }
  })();
  await (async () => {
    const name = '/api/clean по ссылке берёт запись только из нашего хранилища';
    try {
      process.env.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'test';
      const r = await callRec({ method:'POST', query:{ __r:'clean' }, body:{ url:'https://evil.example.com/a.webm' } });
      assert.equal(r.status, 400);
      ok++; console.log('  ok   ' + name);
    } catch (e) { fail++; console.log('  FAIL ' + name + '  -> ' + e.message); }
  })();
  await (async () => {
    const name = 'act:start хранит исходную запись рядом с очищенной, чужие ссылки не берёт';
    try {
      const device = 'selftest-orig-' + Date.now();
      const good = 'https://abc.public.blob.vercel-storage.com/radio-raw/d/x.webm';
      const r1 = await callSt({ method:'POST', body:{ device, act:'start', story:{ kind:'record', title:'Т', lang:'ru', panels:['а'],
        audio:{ url:'https://abc.public.blob.vercel-storage.com/records/clean.mp3', original: good, timeline:[{start:0,end:1}] } } } });
      const g1 = await callSt({ method:'GET', query:{ device, id: r1.body.id } });
      assert.equal(g1.body.audio.original, good);
      assert.ok(g1.body.audio.voice);
      const r2 = await callSt({ method:'POST', body:{ device, act:'start', story:{ kind:'record', title:'Т', lang:'ru', panels:['а'],
        audio:{ url:'https://abc.public.blob.vercel-storage.com/records/clean.mp3', original:'https://evil.example.com/x.webm', timeline:[] } } } });
      const g2 = await callSt({ method:'GET', query:{ device, id: r2.body.id } });
      assert.equal(g2.body.audio.original, undefined);
      ok++; console.log('  ok   ' + name);
    } catch (e) { fail++; console.log('  FAIL ' + name + '  -> ' + e.message); }
  })();
}

console.log(`\n${ok} прошло, ${fail} провалено`);
process.exit(fail ? 1 : 0);
