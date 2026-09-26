import threading, http.server, socketserver, functools, sys
from playwright.sync_api import sync_playwright

PORT = 8934
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory='site/site'))
httpd.allow_reuse_address = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 430, 'height': 900})
    pg.route('https://favola-radio.vercel.app/**', lambda r: r.fulfill(status=404, body='{}'))
    pg.on('dialog', lambda d: d.dismiss())
    pg.goto(f'http://localhost:{PORT}/app.html')
    pg.wait_for_timeout(600)
    pg.click('.langpick button:has-text("Русский")')
    pg.wait_for_timeout(400)
    # пропускаем вход, если он открылся (нет ключей Google/почты — приложение пускает дальше)
    pg.evaluate("()=>{ if (typeof ME==='undefined' || !ME) { try{ show('hub'); }catch(e){} } }")
    pg.wait_for_timeout(500)
    pg.evaluate("()=>show('hub')")
    pg.wait_for_timeout(500)
    pg.screenshot(path='shots/3-hub-v2.png')
    print(pg.evaluate("()=>document.querySelector('section.screen[data-active]').dataset.screen"))
    b.close()
httpd.shutdown()
