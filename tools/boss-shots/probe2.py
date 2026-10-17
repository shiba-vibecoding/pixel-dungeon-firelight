from lib import *
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for n in range(3):
        pg = browser.new_page(viewport={'width':412,'height':760})
        pg.on('pageerror', lambda e: print('STACK', str(e.stack)[:1200]))
        pg.on('console', lambda m: print('C', m.text[:200]) if m.type=='error' else None)
        pg.route(re.compile(r'127\.0\.0\.1:8787'), lambda route: route.abort())
        pg.goto(BASE + '?lang=en&reveal=1')
        time.sleep(4)
        print(n, pg.evaluate('typeof __pd'))
        pg.close()
    browser.close()
