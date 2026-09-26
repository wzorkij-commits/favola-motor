# Дымовой прогон сайта Favola Radio: настоящий Chromium, поддельный мотор.
# Проверяет путь по всем трём опциям и полку/кабинет — без настоящей записи
# голоса (там нужен микрофон, это отдельная более тяжёлая проверка).
import json, threading, http.server, socketserver, functools, os, sys
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'site')
PORT = 8471
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='

STATE = {'email': None}
STORY_STORE = {}
results=[]
def check(name, cond, extra=''):
    results.append(bool(cond)); print(('  ok   ' if cond else '  FAIL ')+name+(('  -> '+str(extra)) if (extra and not cond) else ''))

def api(route):
    req = route.request; u = urlparse(req.url); path = u.path.split('/api/')[1]; qs = parse_qs(u.query); m = req.method
    J = lambda o, c=200: route.fulfill(status=c, content_type='application/json', body=json.dumps(o), headers={'access-control-allow-origin':'*'})
    if m == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST,GET,OPTIONS'})
    body = {}
    if m == 'POST':
        try: body = json.loads(req.post_data or '{}')
        except Exception: body = {}

    if path == 'auth' and m == 'GET': return J({'enabled': False})
    if path == 'otp' and m == 'GET': return J({'enabled': True})
    if path == 'otp' and m == 'POST':
        if body.get('code'):
            STATE['email'] = body.get('email')
            return J({'outcome':'ok', 'email': STATE['email'], 'made':0, 'canMake':True})
        return J({'outcome':'sent', 'minutes':15})
    if path == 'account': return J({'email': STATE['email'],'made':0,'canMake':True,'canRecord':True,'freeLeft':2,'radioShelf':[]})
    if path == 'spend': return J({'ok': STATE.get('spend_ok', True), 'made': 1, 'canMake': STATE.get('spend_ok', True), 'canRecord': STATE.get('spend_ok', True), 'why': 'free' if STATE.get('spend_ok', True) else 'empty'})
    if path == 'align':
        n = len(body.get('weights') or [])
        return J({'scenes': [{'from': i, 'to': i, 'start': i, 'end': i+1} for i in range(n)]})
    if path == 'pay':
        return J({'outcome': 'ok', 'url': 'http://127.0.0.1:%d/paid.html?ref=x' % PORT, 'ref': 'x', 'checkout': 'c1', 'amount': 9.99, 'currency': 'EUR'})
    if path == 'pay-status': return J({'paid': True, 'made': 0, 'canMake': True})
    if path == 'auth' and m == 'POST': return J({'вошёл': False})
    if path == 'library' and m == 'GET':
        if qs.get('id'):
            return J({'id':'ru-repka','lang':'ru','title':'Репка','text':'Абзац один.\n\nАбзац два.\n\nАбзац три.',
                       'world':'', 'cast':[], 'heroSheet': None,
                       'scenes':[{'text':'Абзац один.','image':None},{'text':'Абзац два.','image':JPG},{'text':'Абзац три.','image':None}]})
        return J({'stories':[{'id':'ru-repka','lang':'ru','title':'Репка','estMinutes':2}]})
    if path == 'library' and m == 'POST':
        return J({'image': JPG, 'cached': False})
    if path == 'wizard':
        return J({'title':'Проверочная сказка','panels':['Раз.','Два.','Три.'],
                   'cast':[{'name':'Ася','look':'девочка с косичками'}], 'world':'лес',
                   'scenes':[{'brief':'a','shows':[]},{'brief':'b','shows':[]},{'brief':'c','shows':[]}],
                   'questions':['Вопрос один?','Вопрос два?','Вопрос три?']})
    if path == 'hero': return J({'look':'x','sheet': JPG})
    if path == 'image': return J({'image': JPG})
    if path == 'clean': return J({'audio': 'data:audio/webm;base64,AAAA', 'mime':'audio/webm', 'bytes':4})
    if path == 'transcribe':
        return J({'language':'ru','text':'Раз. Два. Три.',
                   'sentences':[{'i':0,'text':'Раз.','start':0,'end':1},{'i':1,'text':'Два.','start':1,'end':2},{'i':2,'text':'Три.','start':2,'end':3}],
                   'words':[{'t':'Раз.','s':0,'e':0.9},{'t':'Два.','s':1,'e':1.9},{'t':'Три.','s':2,'e':2.9}],
                   'pauses':[], 'duration':3})
    if path == 'polish': return J({'sentences': ['Раз, чистый.','Два, чистый.','Три, чистый.'], 'source':'llm'})
    if path == 'scenes':
        return J({'title':'Записанная сказка','world':'дом','castText':'Ася: девочка',
                   'scenes':[{'from':0,'to':0,'text':'Раз.','brief':'a','shows':[],'start':0,'end':1},
                             {'from':1,'to':1,'text':'Два.','brief':'b','shows':[],'start':1,'end':2},
                             {'from':2,'to':2,'text':'Три.','brief':'c','shows':[],'start':2,'end':3}],
                   'questions':['Вопрос раз?','Вопрос два?','Вопрос три?'], 'source':'llm'})
    if path == 'stories' and m == 'GET':
        if qs.get('id'):
            rec = STORY_STORE.get(qs.get('id')[0])
            if not rec: return J({'error': 'не найдено'}, 404)
            return J(rec)
        stories = [{'id': sid, 'title': r.get('title',''), 'kind': r.get('kind'), 'lang': r.get('lang'),
                    'cover': (r.get('art') or [None])[0]} for sid, r in STORY_STORE.items()]
        return J({'stories': stories, 'файловое_хранилище': True})
    if path == 'stories' and m == 'POST':
        if body.get('act') == 'start':
            sid = 'rd' + str(len(STORY_STORE) + 1)
            story = body.get('story') or {}
            audio = story.get('audio') or {}
            STORY_STORE[sid] = {
                'id': sid, 'kind': story.get('kind'), 'title': story.get('title'), 'lang': story.get('lang'),
                'panels': story.get('panels') or [], 'questions': story.get('questions') or [], 'art': [],
                'audio': ({'voice': audio.get('url')} if audio.get('url') else {}),
                'meta': ({'audioTimeline': audio.get('timeline')} if audio.get('timeline') else None),
            }
            return J({'id': sid, 'файловое_хранилище': True})
        if body.get('act') == 'asset':
            if not STATE.get('blob_ready', True):
                # Как настоящий сервер без включённого файлового хранилища (Blob) —
                # явная ошибка, а не тихий «ok», который на деле терял картинку/голос.
                return J({'error': 'файловое хранилище (Blob) не подключено на сервере', 'outcome': 'no-storage'})
            rec = STORY_STORE.get(body.get('id'))
            if rec is not None:
                name = body.get('name','')
                if name.startswith('panel-'):
                    n = int(name.split('-')[1]) - 1
                    while len(rec['art']) <= n: rec['art'].append(None)
                    rec['art'][n] = JPG
                else:
                    rec.setdefault('audio', {})[name] = 'data:audio/webm;base64,AAAA'
            return J({'ok': True, 'url': JPG})
        return J({'ok': True})
    if path == 'forget': return J({'ok': True, 'удалено_сказок':0, 'удалено_файлов':0})
    return J({'error': 'unexpected ' + path}, 404)

# Поддельный микрофон: настоящее аудио в песочнице недоступно и не нужно —
# проверяем не запись звука (это умеет браузер сам), а то, что после неё
# приложение правильно проходит очистку/расшифровку/разбор/сборку картинок.
FAKE_MEDIA = """
navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop(){} }] });
class FakeRecorder {
  constructor(){ this.mimeType = 'audio/webm'; this._h = {}; }
  addEventListener(ev, fn, opts){ this._h[ev] = fn; }
  start(){}
  stop(){ if (this.ondataavailable) this.ondataavailable({ data: new Blob(['x'], {type:'audio/webm'}) });
          const done = this._h['stop']; if (done) setTimeout(done, 0); }
}
window.MediaRecorder = FakeRecorder;
"""

pw = sync_playwright().start()
_exe = '/opt/pw-browsers/chromium'
b = pw.chromium.launch(**({'executable_path': _exe} if os.path.isfile(_exe) else {}), args=['--no-sandbox'])
ctx = b.new_context(viewport={'width':390,'height':844})
page = ctx.new_page(); errs = []
page.on('pageerror', lambda e: errs.append(str(e)[:200]))
page.on('dialog', lambda d: d.dismiss())  # на случай alert() — не даём тесту зависнуть
page.add_init_script(FAKE_MEDIA)
page.route('https://favola-radio.vercel.app/**', api)
page.route('https://accounts.google.com/**', lambda r: r.abort())
page.goto(f'http://localhost:{PORT}/app.html'); page.wait_for_timeout(600)

cur = lambda: page.evaluate("()=>{const s=document.querySelector('.screen[data-active]');return s?s.dataset.screen:null}")

print('заставка и вход')
check('заставка активна при загрузке', cur() == 'intro', cur())
check('на заставке видны звёзды', page.locator('.sky .star').count() > 0)
check('кнопка ночного режима на месте', page.is_visible('#themeToggle'))
page.click('#themeToggle'); page.wait_for_timeout(100)
check('ночной режим включился', page.evaluate("()=>document.documentElement.getAttribute('data-theme')") == 'night')
page.click('#themeToggle'); page.wait_for_timeout(100)
check('ночной режим выключился обратно', page.evaluate("()=>document.documentElement.getAttribute('data-theme')") == 'day')
page.click('.langpick button[data-lang=ru]'); page.wait_for_timeout(400)
check('после выбора языка — экран входа (почта настроена, аккаунт без email)', cur() == 'signin', cur())
page.fill('#email', 'roditel@example.com'); page.click('#sendCode'); page.wait_for_timeout(300)
check('после отправки кода показано поле кода', page.is_visible('#codeWrap'))
page.fill('#code', '123456'); page.click('#checkCode'); page.wait_for_timeout(400)
check('после верного кода — развилка', cur() == 'hub', cur())
check('на развилке видна кликабельная надпись Favola Radio', page.is_visible('.screen[data-active] .brandbar img'))
page.click('.screen[data-active] .brandbar'); page.wait_for_timeout(150)
check('нажатие на надпись ведёт на развилку', cur() == 'hub', cur())

print('запись голосом')
page.click('#goRecord'); page.wait_for_timeout(200)
check('сначала — выбор стиля картинок', cur() == 'style', cur())
check('в списке стилей четыре варианта', page.locator('.stylecard').count() == 4)
page.click('.stylecard >> nth=0'); page.wait_for_timeout(150)
check('экран записи открылся', cur() == 'record', cur())
page.click('#recStart'); page.wait_for_timeout(200)
check('пошла запись — идёт таймер', page.is_visible('#recLive'))
page.click('#recStop'); page.wait_for_timeout(2000)
check('после записи — собранная сказка', cur() == 'story', cur())
check('название сказки из разбора на сцены', 'Записанная' in page.inner_text('#storyTitle'))
check('подпись под картинкой — очищенный текст, а не сырая расшифровка', 'чистый' in page.inner_text('#storyTxt'))
check('у записанной своим голосом сказки видна кнопка воспроизведения',
      page.evaluate("()=>getComputedStyle(document.getElementById('playBtn')).visibility") == 'visible')
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(150)

print('библиотека и телесуфлёр')
page.click('#goLibrary'); page.wait_for_timeout(400)
check('список библиотеки открылся', cur() == 'library', cur())
check('в списке есть хотя бы одна сказка', page.locator('#libGrid .book').count() >= 1)
page.click('#libGrid .book >> nth=0'); page.wait_for_timeout(300)
check('открылся телесуфлёр', cur() == 'telep', cur())
check('текст сказки показан', 'Абзац один' in page.inner_text('#tpText'))
check('запись не идёт сама — видна кнопка «Записать»', page.is_visible('#tpRecordBtn') and page.is_hidden('#tpRecIndicator'))
page.click('#tpRecordBtn'); page.wait_for_timeout(200)
check('после нажатия «Записать» — пошла запись', page.is_hidden('#tpRecordBtn') and not page.is_hidden('#tpRecIndicator'))
before = page.inner_text('#tpText')
page.click('#tpSizeUp'); page.wait_for_timeout(100)
check('кнопка размера меняет размер шрифта', page.evaluate("()=>document.getElementById('tpText').style.fontSize") == '24px')
page.click('#tpSpeedUp'); page.wait_for_timeout(100)
check('кнопка скорости меняет метку скорости', page.inner_text('#tpSpeedLbl') != '1.0×')
page.click('#tpFinish'); page.wait_for_timeout(2000)
check('после сборки книжки — экран сказки', cur() == 'story', cur())
check('картинка первой страницы на месте', page.get_attribute('#storyArt', 'src') not in (None, ''))
check('запись голоса приложена — кнопка воспроизведения видна',
      page.evaluate("()=>getComputedStyle(document.getElementById('playBtn')).visibility") == 'visible')
page.click('#pgNext'); page.wait_for_timeout(150)
page.click('#pgNext'); page.wait_for_timeout(150)
check('дошли до конца книги, следующая — вопросы для взрослого', cur() == 'story', cur())
page.click('#pgNext'); page.wait_for_timeout(150)
check('экран вопросов открылся', cur() == 'parent', cur())
check('вопрос показан один за раз, как игра', page.is_visible('#qCard') and page.inner_text('#qCard') != '')
for i in range(8):
    if page.is_visible('#saveStory'): break
    page.click('#qNext'); page.wait_for_timeout(100)
check('после всех вопросов — закрывающая строка и кнопка сохранения', page.is_visible('#saveStory'))
check('закрывающая строка на месте', 'спроси у того' in page.inner_text('#closingLine'))
page.click('#saveStory'); page.wait_for_timeout(900)
check('кнопка сохранения сработала без ошибок', 'Сохранено' in page.inner_text('#saveStory'))
check('после сохранения приложение само открывает полку, а не молчит', cur() == 'shelf', cur())
check('только что сохранённая сказка сразу видна на полке', page.locator('#shelfGrid .book').count() >= 1)

print('конструктор «Придумать вместе»')
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(200)
check('«Меню» вернуло на развилку', cur() == 'hub', cur())
page.click('#goWizard'); page.wait_for_timeout(200)
check('сначала — выбор стиля картинок (конструктор)', cur() == 'style', cur())
page.click('.stylecard >> nth=1'); page.wait_for_timeout(150)
check('конструктор открылся на первом вопросе', cur() == 'wizard', cur())
page.fill('.wizstep input', 'Ася'); page.wait_for_timeout(100)
page.click('#wizNext'); page.wait_for_timeout(200)
check('шаг 2 — выбор кто герой', page.locator('.wizchoice button').count() == 3)
page.click('.wizchoice button >> nth=1'); page.wait_for_timeout(100)
page.click('#wizNext'); page.wait_for_timeout(200)
for i in range(5):
    page.fill('.wizstep input', f'ответ {i+3}'); page.wait_for_timeout(80)
    page.click('#wizNext'); page.wait_for_timeout(150)
check('дошли до восьмого вопроса', page.evaluate("()=>document.querySelectorAll('.wizprog i.on').length") == 8)
page.fill('.wizstep input', 'справился'); page.wait_for_timeout(100)
page.click('#wizNext'); page.wait_for_timeout(1200)
check('после восьми ответов и рисования — телесуфлёр, чтобы прочитать вслух и записать',
      cur() == 'telep', cur())
check('в телесуфлёре — текст только что собранной сказки', page.inner_text('#tpText') != '')
check('запись и тут не идёт сама — видна кнопка «Записать»',
      page.is_visible('#tpRecordBtn') and page.is_hidden('#tpRecIndicator'))
page.click('#tpRecordBtn'); page.wait_for_timeout(150)
page.click('#tpFinish'); page.wait_for_timeout(1000)
check('после записи — собранная сказка «Придумать вместе»', cur() == 'story', cur())
check('название сказки из ответа модели', 'Проверочная' in page.inner_text('#storyTitle'))
check('сказку «Придумать вместе» тоже можно было записать голосом — кнопка воспроизведения видна',
      page.evaluate("()=>getComputedStyle(document.getElementById('playBtn')).visibility") == 'visible')

print('полка и кабинет')
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(200)
page.click('#goShelf'); page.wait_for_timeout(300)
check('полка открылась', cur() == 'shelf', cur())
check('сказка, прочитанная и сохранённая ранее, попала на полку', page.locator('#shelfGrid .book').count() >= 1)
page.click('#shelfGrid .book >> nth=0'); page.wait_for_timeout(400)
check('сказка с полки открылась заново', cur() == 'story', cur())
check('у переоткрытой сказки со звуком видна кнопка воспроизведения',
      page.evaluate("()=>getComputedStyle(document.getElementById('playBtn')).visibility") == 'visible')
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(150)
page.click('#hubCab'); page.wait_for_timeout(300)
check('кабинет открылся', cur() == 'cabinet', cur())
check('почта показана', 'roditel@example.com' in page.inner_text('#cabWho'))

print('тарифы: после бесплатной сказки — оплата')
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(150)
STATE['spend_ok'] = False
page.click('#goWizard'); page.wait_for_timeout(300)
check('без права на бесплатную сказку — экран тарифов, а не конструктор', cur() == 'paywall', cur())
check('на экране тарифов виден пакет из 10 сказок', '10' in page.inner_text('.screen[data-active]'))
STATE['spend_ok'] = True

print('сохранение, когда на сервере не включено файловое хранилище (Blob)')
# Раньше в этом случае сервер отвечал "ok", картинка и голос никуда не сохранялись,
# а кнопка всё равно писала «Сохранено» — человек думал, что всё получилось.
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(150)
STATE['blob_ready'] = False
page.click('#goRecord'); page.wait_for_timeout(200)
page.click('.stylecard >> nth=0'); page.wait_for_timeout(150)
page.click('#recStart'); page.wait_for_timeout(150)
page.click('#recStop'); page.wait_for_timeout(2000)
check('вторая запись тоже дошла до собранной сказки', cur() == 'story', cur())
for i in range(6):
    if cur() == 'parent': break
    page.click('#pgNext'); page.wait_for_timeout(120)
check('долистали до экрана вопросов взрослому', cur() == 'parent', cur())
for i in range(8):
    if page.is_visible('#saveStory'): break
    page.click('#qNext'); page.wait_for_timeout(100)
before_shelf_click = cur()
page.click('#saveStory'); page.wait_for_timeout(900)
check('без файлового хранилища кнопка не врёт "Сохранено"', 'Сохранено' not in page.inner_text('#saveStory'))
check('без файлового хранилища видна понятная ошибка, а не тишина', page.is_visible('#saveErr') and page.inner_text('#saveErr') != '')
check('без файлового хранилища приложение не уводит на полку молча', cur() == before_shelf_click, cur())
STATE['blob_ready'] = True
page.click('.screen[data-active] [data-home]'); page.wait_for_timeout(150)

check('за весь прогон ни одной ошибки в консоли', not errs, errs)

b.close()
print('\n%d прошло, %d провалено' % (sum(results), len(results) - sum(results)))
httpd.shutdown()
sys.exit(0 if all(results) else 1)
