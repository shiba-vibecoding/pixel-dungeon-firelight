from lib import *
with sync_playwright() as p:
    b, pg = launch(p)
    god(pg)
    goto(pg, 5)
    goo = [x for x in mobs(pg, 5) if x['kind']=='goo'][0]
    gid = goo['id']
    cell = near(pg, 5, goo['pos'], 3)
    goto(pg, 5, cell, 600)
    settle_view(pg)
    zoom(pg, 2)
    pg.evaluate("__pd.session.send({type:'wait'})")
    adv(pg, 3000)
    print(mobs(pg,5))
    # walk next to the goo
    pos = [x for x in mobs(pg, 5) if x['kind']=='goo'][0]['pos']
    print('goo', pos, 'hero', pg.evaluate("__pd.session.world.heroes[0].pos"))
    for i in range(8):
        pg.evaluate("(id) => __pd.session.send({type:'attack', target:id})", gid)
        adv(pg, 700)
        print(mobs(pg,5)[0])
        if i == 1:
            strip(pg, gid, [0, 60, 120, 180, 240, 320, 420], 'goo-jiggle.png', folder=os.environ['TEMP'], w=150, h=150, scale=0.8)
    snap(pg, 'goo-fight.png')
    print(errors(pg))
    b.close()
