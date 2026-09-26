# Проверка сохранности записи: настоящий Chromium, поддельный мотор, поддельный
# микрофон, который отдаёт звук кусочками, как настоящий MediaRecorder.
# Что проверяем: запись уходит в хранилище напрямую, очистка берёт её по ссылке,
# исходник сохраняется рядом, сказка сама ложится на полку, после сбоя сборка
# продолжается с того же шага, закрытая посреди записи вкладка не теряет голос.
import json, threading, http.server, socketserver, functools, os, subprocess
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', 'site', 'site')
PORT = 8472
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

# Настоящий пропуск на загрузку, выписанный той же библиотекой, что и мотор.
TOKEN = subprocess.check_output(['node', '-e', """
import('@vercel/blob/client').then(async m => {
  process.stdout.write(await m.generateClientTokenFromReadWriteToken({ token: 'vercel_blob_rw_teststore_secretsecret', pathname: 'radio-raw/d/take.webm' }));
});"""], cwd=os.path.join(HERE, '..')).decode()

JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
ORIG = 'https://teststore.public.blob.vercel-storage.com/radio-raw/d/take-abc.webm'
CLEAN = 'https://teststore.public.blob.vercel-storage.com/records/clean-abc.mp3'
LIBIMG = 'https://teststore.public.blob.vercel-storage.com/library/ru-repka/scene-1.jpg'

S = {'fail': set(), 'upload_ok': True, 'blob_puts': 0}
CALLS = []            # (путь, тело)
STORE = {}
results = []
def check(name, cond, extra=''):
    results.append(bool(cond)); print(('  ok   ' if cond else '  FAIL ') + name + (('  -> ' + str(extra)) if (extra and not cond) else ''))
def calls(path): return [b for p, b in CALLS if p == path]

def blob(route):
    req = route.request
    H = {'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT,POST,GET,OPTIONS',
         'access-control-allow-headers': req.headers.get('access-control-request-headers', '*')}
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=H)
    S['blob_puts'] += 1
    return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(
        {'url': ORIG, 'downloadUrl': ORIG + '?download=1', 'pathname': 'radio-raw/d/take-abc.webm',
         'contentType': 'audio/webm', 'contentDisposition': 'inline'}))

def api(route):
    req = route.request; u = urlparse(req.url); path = u.path.split('/api/')[1]; qs = parse_qs(u.query); m = req.method
    J = lambda o, c=200: route.fulfill(status=c, content_type='application/json', body=json.dumps(o), headers={'access-control-allow-origin': '*'})
    if m == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS'})
    body = {}
    if m == 'POST':
        try: body = json.loads(req.post_data or '{}')
        except Exception: body = {}
    CALLS.append((path, body))
    if path in S['fail']: return J({'error': 'нарочно сломано: ' + path}, 500)
    if path == 'auth' and m == 'GET': return J({'enabled': False})
    if path == 'otp' and m == 'GET': return J({'enabled': True})
    if path == 'otp': return J({'outcome': 'ok', 'email': 'r@example.com', 'made': 0, 'canMake': True}) if body.get('code') else J({'outcome': 'sent'})
    if path == 'account': return J({'email': 'r@example.com', 'made': 0, 'canMake': True, 'canRecord': True})
    if path == 'spend': return J({'ok': True, 'canMake': True, 'canRecord': True})
    if path == 'upload':
        if not S['upload_ok']: return J({'error': 'файловое хранилище не подключено', 'outcome': 'no-storage'}, 503)
        return J({'pathname': 'radio-raw/d/take.webm', 'clientToken': TOKEN})
    if path == 'clean':
        return J({'url': CLEAN, 'mime': 'audio/mpeg'}) if S['upload_ok'] else J({'audio': 'data:audio/webm;base64,AAAA'})
    if path == 'transcribe':
        return J({'language': 'ru', 'sentences': [{'i': 0, 'text': 'Раз.', 'start': 0, 'end': 1}, {'i': 1, 'text': 'Два.', 'start': 1, 'end': 2}, {'i': 2, 'text': 'Три.', 'start': 2, 'end': 3}],
                  'words': [], 'pauses': [], 'duration': 3})
    if path == 'polish': return J({'sentences': ['Раз.', 'Два.', 'Три.']})
    if path == 'scenes':
        return J({'title': 'Бабушкина сказка', 'world': '', 'castText': '',
                  'scenes': [{'from': i, 'to': i, 'text': t, 'brief': 'x', 'shows': [], 'start': i, 'end': i + 1} for i, t in enumerate(['Раз.', 'Два.', 'Три.'])],
                  'questions': ['В1?', 'В2?', 'В3?']})
    if path == 'hero': return J({'sheet': None})
    if path == 'image': return J({'image': JPG})
    if path == 'align':
        n = len(body.get('weights') or []); return J({'scenes': [{'start': i, 'end': i + 1} for i in range(n)]})
    if path == 'library' and m == 'GET':
        if qs.get('id'):
            return J({'id': 'ru-repka', 'lang': 'ru', 'title': 'Репка', 'text': 'Один.\n\nДва.',
                      'scenes': [{'text': 'Один.', 'image': LIBIMG}, {'text': 'Два.', 'image': LIBIMG}]})
        return J({'stories': [{'id': 'ru-repka', 'lang': 'ru', 'title': 'Репка', 'estMinutes': 2}]})
    if path == 'stories' and m == 'GET':
        if qs.get('id'): return J(STORE.get(qs['id'][0]) or {'error': 'нет'}, 200 if qs['id'][0] in STORE else 404)
        return J({'stories': [{'id': k, 'title': v['title'], 'cover': None} for k, v in STORE.items()], 'файловое_хранилище': True})
    if path == 'stories':
        a = body.get('act')
        if a == 'start':
            sid = 'rd%d' % (len(STORE) + 1); st = body.get('story') or {}
            STORE[sid] = {'id': sid, 'title': st.get('title'), 'kind': st.get('kind'), 'panels': st.get('panels'), 'art': st.get('art') or [],
                          'audio': {'voice': (st.get('audio') or {}).get('url')}, 'questions': []}
            return J({'id': sid})
        if a == 'asset': return J({'url': JPG})
        return J({'ok': True})
    return J({'error': 'unexpected ' + path}, 404)

# Микрофон отдаёт кусочек каждые 300 мс, как MediaRecorder.start(timeslice).
FAKE_MEDIA = """
navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop(){} }] });
class FakeRecorder {
  constructor(){ this.mimeType = 'audio/webm'; this._h = {}; this.state = 'inactive'; }
  addEventListener(ev, fn){ this._h[ev] = fn; }
  start(ts){ this.state = 'recording'; this._iv = setInterval(()=>{ if (this.ondataavailable) this.ondataavailable({ data: new Blob(['voice-chunk-'], {type:'audio/webm'}) }); }, 300); }
  stop(){ clearInterval(this._iv); this.state = 'inactive';
          if (this.ondataavailable) this.ondataavailable({ data: new Blob(['last'], {type:'audio/webm'}) });
          const done = this._h['stop']; if (done) setTimeout(done, 0); }
}
window.MediaRecorder = FakeRecorder;
"""

pw = sync_playwright().start()
_exe = '/opt/pw-browsers/chromium'
br = pw.chromium.launch(**({'executable_path': _exe} if os.path.isfile(_exe) else {}), args=['--no-sandbox'])
ctx = br.new_context(viewport={'width': 390, 'height': 844})
page = ctx.new_page(); errs = []
page.on('pageerror', lambda e: errs.append(str(e)[:200]))
DIALOG = {'accept': False}
page.on('dialog', lambda d: d.accept() if DIALOG['accept'] else d.dismiss())
page.add_init_script(FAKE_MEDIA)
page.route('https://favola-radio.vercel.app/**', api)
page.route('https://vercel.com/api/blob**', blob)
page.route('https://accounts.google.com/**', lambda r: r.abort())
cur = lambda: page.evaluate("()=>{const s=document.querySelector('.screen[data-active]');return s?s.dataset.screen:null}")
takes = lambda: page.evaluate("async ()=> (await TakeDB.list()).length")

def to_hub(first=False):
    page.goto(f'http://localhost:{PORT}/app.html'); page.wait_for_timeout(700)
    if cur() != 'hub':
        page.click('.langpick button[data-lang=ru]'); page.wait_for_timeout(400)
    if cur() == 'signin':
        page.fill('#email', 'r@example.com'); page.click('#sendCode'); page.wait_for_timeout(250)
        page.fill('#code', '123456'); page.click('#checkCode'); page.wait_for_timeout(400)
    page.wait_for_timeout(300)

def record(seconds=0.8):
    page.click('#goRecord'); page.wait_for_timeout(200)
    page.click('.stylecard >> nth=0'); page.wait_for_timeout(150)
    page.click('#recStart'); page.wait_for_timeout(int(seconds * 1000))
    page.click('#recStop'); page.wait_for_timeout(2000)

to_hub()
check('дошли до развилки', cur() == 'hub', cur())
check('модуль прямой загрузки подключён', page.evaluate("()=>!!(window.FavolaBlob && FavolaBlob.put)"))

print('\nзапись уходит в хранилище напрямую, исходник хранится, сказка сама ложится на полку')
CALLS.clear()
record()
check('сказка собрана', cur() == 'story', cur())
check('запись ушла в хранилище одним прямым запросом, минуя мотор', S['blob_puts'] == 1, S['blob_puts'])
cl = calls('clean')
check('очистка получила ссылку на исходник, а не сам файл', cl and cl[0].get('url') == ORIG and 'audio' not in cl[0], cl)
tr = calls('transcribe')
check('расшифровка идёт по очищенной записи', tr and tr[0].get('url') == CLEAN, tr)
starts = [b for b in calls('stories') if b.get('act') == 'start']
check('сказка сама легла на полку, кнопку никто не нажимал', len(starts) == 1, len(starts))
aud = (starts[0].get('story') or {}).get('audio') or {} if starts else {}
check('на полку ушёл и очищенный голос, и исходник', aud.get('url') == CLEAN and aud.get('original') == ORIG, aud)
page.wait_for_timeout(300)
check('после сохранения запись удалена из памяти телефона', takes() == 0, takes())
page.click('#pgNext'); page.click('#pgNext'); page.click('#pgNext'); page.wait_for_timeout(200)
page.click('#qSkip'); page.wait_for_timeout(150)
check('на экране вопросов кнопка говорит, что сказка уже на полке', 'уже на полке' in page.inner_text('#saveStory'), page.inner_text('#saveStory'))
page.click('#saveStory'); page.wait_for_timeout(900)
check('повторное нажатие не заводит вторую такую же сказку', len([b for b in calls('stories') if b.get('act') == 'start']) == 1)
check('и открывает полку', cur() == 'shelf', cur())
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(200)

print('\nсбой посреди сборки: повтор продолжает с того же шага')
CALLS.clear(); S['fail'] = {'scenes'}
record()
check('после сбоя остаёмся на экране записи', cur() == 'record', cur())
check('видна понятная ошибка и сказано, что запись цела', 'Запись цела' in page.inner_text('#recErr'), page.inner_text('#recErr'))
check('видна кнопка «Попробовать ещё раз»', page.is_visible('#recRetry'))
check('запись лежит в памяти телефона', takes() == 1, takes())
n_clean, n_tr, n_pol = len(calls('clean')), len(calls('transcribe')), len(calls('polish'))
S['fail'] = set()
page.click('#recRetry'); page.wait_for_timeout(2000)
check('повтор собрал сказку', cur() == 'story', cur())
check('повтор не чистил и не расшифровывал запись второй раз (не платим дважды)',
      (len(calls('clean')), len(calls('transcribe')), len(calls('polish'))) == (n_clean, n_tr, n_pol),
      (len(calls('clean')), len(calls('transcribe')), len(calls('polish'))))
page.wait_for_timeout(300)
check('после сохранения память телефона пуста', takes() == 0, takes())
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(200)

print('\nвкладку закрыли посреди записи — голос не пропал')
CALLS.clear()
page.click('#goRecord'); page.wait_for_timeout(200)
page.click('.stylecard >> nth=0'); page.wait_for_timeout(150)
page.click('#recStart'); page.wait_for_timeout(3800)
to_hub()      # перезагрузка страницы, как если бы телефон закрыл вкладку
check('после перезагрузки мы на развилке', cur() == 'hub', cur())
check('развилка показывает запись, которая ещё не на полке', page.is_visible('#pendingTake'))
check('в карточке видна длина записи', '0:0' in page.inner_text('#pendingText'), page.inner_text('#pendingText'))
check('кусочки записи сохранились в памяти телефона', page.evaluate("async ()=>{ const l = await TakeDB.list(); const t = await TakeDB.get(l[0].id); return t.blob.size; }") > 50)
page.click('#pendingGo'); page.wait_for_timeout(2500)
check('из карточки собралась сказка', cur() == 'story', cur())
check('исходник ушёл в хранилище', len(calls('upload')) >= 1)
page.wait_for_timeout(300)
check('сказка легла на полку, карточка больше не нужна', takes() == 0, takes())
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(300)
check('на развилке карточки больше нет', page.is_hidden('#pendingTake'))

print('\nочистка сломалась, а исходник в хранилище: голосом становится исходник')
CALLS.clear(); S['fail'] = {'clean'}
record()
check('сказка всё равно собрана', cur() == 'story', cur())
starts = [b for b in calls('stories') if b.get('act') == 'start']
aud = (starts[-1].get('story') or {}).get('audio') or {} if starts else {}
check('голос сказки — исходник, с пометкой «не очищен»', aud.get('url') == ORIG and aud.get('cleaned') is False, aud)
S['fail'] = set()
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(200)

print('\nчтение с суфлёра: ни очистки, ни хранилища — запись не пропадает молча')
CALLS.clear(); S['fail'] = {'clean'}; S['upload_ok'] = False
page.click('#goLibrary'); page.wait_for_timeout(400)
page.click('#libGrid .book >> nth=0'); page.wait_for_timeout(300)
page.click('#tpRecordBtn'); page.wait_for_timeout(900)
page.click('#tpFinish'); page.wait_for_timeout(1500)
check('книжка не собралась без голоса молча — осталась на суфлёре', cur() == 'telep', cur())
check('видна ошибка и сказано, что запись цела', 'Запись цела' in page.inner_text('#tpErr'), page.inner_text('#tpErr'))
S['fail'] = set()
page.click('#tpFinish'); page.wait_for_timeout(2000)
check('второе нажатие собрало книжку с той же записью', cur() == 'story', cur())
check('у книжки есть голос', page.evaluate("()=>!!(CURRENT_STORY.audio && CURRENT_STORY.audio.full)"))
starts = [b for b in calls('stories') if b.get('act') == 'start']
check('картинки библиотеки ушли на полку готовыми ссылками', starts and LIBIMG in ((starts[-1].get('story') or {}).get('art') or []), starts[-1].get('story', {}).get('art') if starts else None)
S['upload_ok'] = True
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(200)

print('\nненужную запись можно удалить с развилки')
page.click('#goRecord'); page.wait_for_timeout(200)
page.click('.stylecard >> nth=0'); page.wait_for_timeout(150)
page.click('#recStart'); page.wait_for_timeout(3500)
to_hub()
check('карточка появилась', page.is_visible('#pendingTake'))
DIALOG['accept'] = True
page.click('#pendingDrop'); page.wait_for_timeout(400)
check('после «Удалить» карточка пропала', page.is_hidden('#pendingTake'))
check('и память телефона пуста', takes() == 0, takes())

check('\nза весь прогон ни одной ошибки в консоли', not errs, errs)
print(f'\n{sum(results)} прошло, {len(results) - sum(results)} провалено')
br.close(); pw.stop(); httpd.shutdown()
