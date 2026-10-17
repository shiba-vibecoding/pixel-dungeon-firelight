from lib import *
with sync_playwright() as p:
    b, pg = launch(p)
    for d, k in ((10,'tengu'),(15,'dm300'),(20,'king'),(25,'yog')):
        print(d, enter(pg, d, k))
        print([l['text'] for l in pg.evaluate('__pd.view.log.slice(-3)')])
    b.close()
