from lib import *
with sync_playwright() as p:
    b, pg = launch(p)
    god(pg)
    goto(pg, 5)
    goo = [x for x in mobs(pg, 5) if x['kind']=='goo'][0]
    cell = near(pg, 5, goo['pos'], 4)
    goto(pg, 5, cell, 600)
    settle_view(pg)
    for i in range(30):
        pg.evaluate("__pd.session.send({type:'wait'})")
        adv(pg, 400)
        m = [x for x in mobs(pg, 5) if x['kind']=='goo'][0]
        if m['state'] != 'sleeping':
            print('awake after', i, m); break
    for k in range(6):
        adv(pg, 400)
        snap(pg, f'goo-a{k}.png')
    print(errors(pg))
    b.close()
