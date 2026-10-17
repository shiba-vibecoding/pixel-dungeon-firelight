"""Headless screenshots of part 11 in the running game (375x812, Russian). Needs the dev server: npm run dev -w @pd/client -- --port 5199."""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

PORT = os.environ.get('PD_PORT', '5199')
BASE = 'http://127.0.0.1:%s/pixel-dungeon-firelight/' % PORT
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'quests')


def launch(p, width=375, height=812, dpr=2, query='lang=ru', gpu=False, reduced=False, quips='clean'):
    args = ['--use-angle=d3d11', '--ignore-gpu-blocklist'] if gpu else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    browser = p.chromium.launch(args=args)
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=dpr, reduced_motion='reduce' if reduced else 'no-preference')
    page = context.new_page()
    # No hints, no tutorial: they would stand in front of the screens.
    page.add_init_script("localStorage.setItem('pd-hints', 'off'); localStorage.setItem('pd-coach-done', '1'); localStorage.setItem('pd-moved', '1'); localStorage.setItem('pd-fx', 'full'); localStorage.setItem('pd-quips', '%s');" % quips)
    page.logs = []
    page.on('console', lambda m: page.logs.append(m.type + ': ' + m.text))
    page.on('pageerror', lambda e: page.logs.append('ERR ' + str(e) + ' ' + str(getattr(e, 'stack', ''))))
    # No server runs beside the dev page: its requests fail at once, and the game offers a run that counts nowhere.
    page.route(re.compile(r'127\.0\.0\.1:8787'), lambda route: route.abort())
    page.goto(BASE + '?' + query)
    time.sleep(2.5)
    page.evaluate("__pd.startSolo('new')")
    time.sleep(2)
    for label in ('Играть без рейтинга', 'Play without ranking'):
        try:
            page.get_by_text(label).click(timeout=4000)
            break
        except Exception:
            pass
    time.sleep(3)
    try:
        page.mouse.click(width - 36, 36)
    except Exception:
        pass
    time.sleep(0.5)
    return browser, page


def shot(page, name, out=OUT):
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, name)
    page.screenshot(path=path)
    return path


def js(page, code, arg=None):
    return page.evaluate(code, arg) if arg is not None else page.evaluate(code)


def advance(page, ms=600):
    page.evaluate('__pd.advance(%d)' % ms)


def settle(page, ms=1000):
    advance(page, ms)
    time.sleep(0.3)


def close_windows(page):
    """Closes whatever window is open (the overlay's close cross), then lets the frame settle."""
    for _ in range(3):
        try:
            btn = page.locator('.pd-window .pd-close').first
            if btn.count():
                btn.click(timeout=800)
                time.sleep(0.2)
        except Exception:
            break
