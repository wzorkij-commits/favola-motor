// Каждый файл должен реально импортироваться — синтаксис проверяет не всё.
// Именно это ловит «Identifier has already been declared», из-за которого
// функция падает на Vercel ещё до первого запроса.
const files = ['../lib/data.js','../lib/providers.js','../lib/prompts.js','../lib/guardrails.js',
  '../api/ping.js','../api/triage.js','../api/story.js','../api/polish.js','../api/image.js','../api/voice.js','../api/hero.js',
  '../lib/plans.js','../lib/store.js','../lib/sumup.js','../lib/google.js','../api/auth.js','../lib/mail.js','../lib/h-otp.js',
  '../lib/blob.js','../api/stories.js','../lib/h-forget.js',
  '../api/account.js','../lib/h-spend.js','../api/pay.js','../lib/h-paystatus.js','../lib/route.js','../lib/record.js','../lib/bible.js','../lib/catalog.js','../lib/briefs.js','../lib/recipe.js','../lib/variety.js','../lib/lessons.js','../lib/owner.js'];
let bad = 0;
for (const f of files) {
  try { await import(f); console.log('OK   ' + f.replace('../','')); }
  catch (e) { bad++; console.log('FAIL ' + f.replace('../','') + ' -> ' + e.message.split('\n')[0]); }
}
const d = await import('../lib/data.js');
console.log(`\nконструктов: ${d.CONSTRUCTS.constructs.length} · текстов части 6: ${d.PANEL6.entries.length} · героев: ${d.HEROES.heroes.length}`);
process.exit(bad ? 1 : 0);
