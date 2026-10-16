# Firelight · part 5: the whole Pixel-Mart pack in one catalogue (catalog.json) with its categories, bundles and the season,
# and the shop's interface strings (strings.json, EN and RU). Run after the art scripts.
import json, glob
from common import *

items = []
for f in ['looks', 'fires', 'hats', 'pets', 'fx', 'quips', 'decor', 'profile']:
    items += json.load(open(OUT + f'catalog-{f}.json'))
# the price bands of the brief: small items 25-50, looks 100-250, legendary 500+ (nothing in between)
SMALL = {'hat', 'trail', 'kill', 'digits', 'quips', 'frame', 'title', 'name', 'photoframe', 'stickers', 'decor'}
for i in items:
    if i['kind'] == 'fire' and i['stars'] == 100: i['stars'] = 150      # the signature fires: rainbow and golden
    elif i['stars'] == 75: i['stars'] = 50 if i['kind'] in SMALL else 100
by = {i['sku']: i for i in items}
CATS = [
    dict(id='looks', kinds=['skin'], en='Looks', ru='Облики', icon='mart/fl/looks/icons/warrior-ember.png'),
    dict(id='fires', kinds=['fire'], en='Campfires', ru='Костры', icon='mart/fl/fires/icons/blue.png', signature=True),
    dict(id='hats', kinds=['hat'], en='Hats', ru='Шапки', icon='mart/fl/hats/icons/tricorn.png'),
    dict(id='pets', kinds=['pet'], en='Pets', ru='Питомцы', icon='mart/fl/pets/icons/ember.png'),
    dict(id='effects', kinds=['trail', 'kill', 'death', 'digits'], en='Effects', ru='Эффекты', icon='mart/fl/fx/icons/kill-stars.png'),
    dict(id='quips', kinds=['quips'], en='Quips', ru='Реплики', icon='mart/fl/quips/pirate.png'),
    dict(id='camp', kinds=['decor'], en='Camp', ru='Привал', icon='mart/fl/decor/icons/tent.png'),
    dict(id='profile', kinds=['frame', 'title', 'name'], en='Profile', ru='Профиль', icon='mart/fl/profile/frame-ember.png'),
    dict(id='photo', kinds=['photoframe', 'stickers'], en='Photo', ru='Фото', icon='mart/fl/photo/sticker-fire.png'),
]
BUNDLES = [
    dict(sku='bundle.forge', kind='bundle', en='Forge Kit', ru='Набор кузнеца', items=['skin.warrior.forgeborn', 'hat.crown', 'pet.ember', 'fire.golden'], stars=690, art='forge'),
    dict(sku='bundle.night', kind='bundle', en='Night Watch', ru='Ночной дозор', items=['skin.rogue.dusk', 'hat.tricorn', 'pet.bat', 'trail.shadow', 'fire.cursed'], stars=359, art='night'),
    dict(sku='bundle.camp', kind='bundle', en='First Camp', ru='Первый привал', items=['decor.tent', 'decor.lantern', 'decor.bench', 'fire.blue', 'frame.ember'], stars=249, art='camp'),
]
for b in BUNDLES:
    b['name'] = dict(en=b.pop('en'), ru=b.pop('ru')); b['full'] = sum(by[s]['stars'] for s in b['items']); b['save'] = round(100 * (1 - b['stars'] / b['full']))
SEASON = dict(id='s1', name=dict(en='Embers of the Deep', ru='Угли глубин'), number=1, days=56, levels=30, xpPerLevel=1000, pass_stars=300, banner='mart/fl/season/banner.png',
              how=dict(en='Season XP comes from runs: depth, bosses, the daily dungeon. Nothing in the pass changes a run.',
                       ru='Опыт сезона дают забеги: глубина, боссы, подземелье дня. Ничто в пропуске не меняет забег.'),
              free=[[1, 'sticker.fire'], [2, 'name.ember'], [4, 'trail.embers'], [6, 'sticker.skull'], [8, 'fire.green'], [10, 'title.kindler'], [12, 'quips.robot'],
                    [15, 'frame.moss'], [18, 'kill.smoke_ring'], [20, 'decor.woodpile'], [24, 'digits.toxic'], [28, 'hat.wreath'], [30, 'title.ghost']],
              paid=[[1, 'frame.sunforge'], [3, 'hat.pompom'], [5, 'pet.firefly'], [7, 'fire.ghost'], [9, 'photo.embers'], [11, 'skin.mage.frost'], [13, 'kill.pillar'],
                    [16, 'decor.musicbox'], [19, 'death.ascend'], [22, 'name.flame'], [25, 'title.ember'], [27, 'pet.skull'], [30, 'title.first']])
cat = dict(version=1, currency='stars', priceBands=dict(small=[25, 50], looks=[100, 250], legendary=[500, None]),
           categories=CATS, items=items, bundles=BUNDLES, season=SEASON,
           gift=dict(allowed=['skin', 'fire', 'hat', 'pet', 'trail', 'kill', 'death', 'digits', 'quips', 'decor', 'frame', 'title', 'name', 'photoframe', 'stickers', 'bundle'], note='gifts go to a Telegram friend who has played; the receiver gets a mail at the camp'))
json.dump(cat, open(out('catalog.json'), 'w'), ensure_ascii=False, indent=1)
for f in glob.glob(OUT + 'catalog-*.json'): os.remove(f)

STR = {
 'title': ('Pixel-Mart', 'Пиксель-Март'), 'motto': ('A safer life in dungeon.', 'Жизнь в подземелье — безопаснее.'),
 'balance': ('Your Stars', 'Ваши звёзды'), 'buy': ('Buy', 'Купить'), 'tryOn': ('Try on', 'Примерить'), 'wear': ('Wear', 'Надеть'), 'worn': ('Worn', 'Надето'),
 'owned': ('Owned', 'Есть'), 'gift': ('Gift', 'Подарить'), 'free': ('Free', 'Бесплатно'), 'season': ('Season', 'Сезон'), 'pass': ('Season Pass', 'Пропуск сезона'),
 'featured': ('Bundle of the week', 'Набор недели'), 'bundles': ('Bundles', 'Наборы'), 'save': ('Save {n}%', 'Выгода {n}%'), 'inBundle': ('In the bundle', 'В наборе'),
 'allClasses': ('All', 'Все'), 'legendary': ('Legendary', 'Легендарный'), 'animated': ('Animated: sparks and glow', 'Анимированный: искры и свечение'),
 'tryHint': ('Tap a look to see it on your hero by the fire.', 'Нажмите на облик — он появится на герое у костра.'),
 'lookTiers': ('Every armour tier, every move', 'Все уровни брони, все движения'),
 'giftTitle': ('Gift to a friend', 'Подарок другу'), 'giftTo': ('Who gets it', 'Кому'), 'giftNote': ('A note by the fire', 'Записка у костра'),
 'giftNotePh': ('Stay warm down there!', 'Не замёрзни там!'), 'giftSend': ('Gift for', 'Подарить за'), 'giftMail': ('It comes as a mail at their camp.', 'Придёт письмом на их Привал.'),
 'friendsPlayed': ('Friends who play', 'Друзья, которые играют'), 'search': ('Search friends', 'Найти друга'),
 'level': ('Level', 'Уровень'), 'freeLine': ('Free', 'Бесплатно'), 'paidLine': ('Pass', 'Пропуск'), 'claim': ('Claim', 'Забрать'), 'claimed': ('Claimed', 'Получено'),
 'locked': ('Locked', 'Закрыто'), 'daysLeft': ('{n} days left', 'Осталось {n} дн.'), 'getPass': ('Get the pass', 'Купить пропуск'), 'xp': ('{a} / {b} season XP', '{a} / {b} опыта сезона'),
 'profileTitle': ('Profile', 'Профиль'), 'frame': ('Frame', 'Рамка'), 'titleL': ('Title', 'Титул'), 'nameColour': ('Name colour', 'Цвет имени'), 'preview': ('Preview', 'Так увидят другие'),
 'photoTitle': ('Photo mode', 'Фото-режим'), 'photoFrames': ('Frames', 'Рамки'), 'stickers': ('Stickers', 'Наклейки'), 'stickerHint': ('Drag a sticker onto the photo', 'Перетащите наклейку на снимок'),
 'trails': ('Footstep trails', 'Следы'), 'kills': ('Kill effects', 'Эффекты победы'), 'deaths': ('Death effects', 'Эффекты гибели'), 'digits': ('Damage numbers', 'Цифры урона'),
 'decorHint': ('Decorations stand at your camp; friends see them when they visit.', 'Украшения стоят на вашем Привале; друзья видят их в гостях.'),
 'fireHint': ('The fire of your camp: flame, logs, sparks and its light.', 'Костёр вашего Привала: пламя, поленья, искры и его свет.'),
 'quipHint': ('Your hero speaks in this voice. The words stay the game\'s.', 'Герой говорит этим голосом. Слова — из игры.'),
 'cosmetic': ('Looks only: nothing here changes a run.', 'Только облик: ничто здесь не меняет забег.'),
 'confirm': ('Pay with Telegram Stars', 'Оплата звёздами Telegram'), 'close': ('Close', 'Закрыть'), 'back': ('Back', 'Назад'), 'seeAll': ('See all', 'Все'),
 'new': ('New', 'Новое'), 'season1': ('Season 1', 'Сезон 1'), 'byFire': ('By the fire', 'У костра'), 'slots': ('On the hero', 'На герое'),
 'hat': ('Hat', 'Шапка'), 'pet': ('Pet', 'Питомец'), 'look': ('Look', 'Облик'), 'fire': ('Fire', 'Костёр'), 'trail': ('Trail', 'След'), 'none': ('None', 'Нет'),
 'patronFree': ('Patrons get 10% off', 'Покровителям скидка 10%'), 'total': ('Total', 'Итого'),
}
json.dump({'en': {k: v[0] for k, v in STR.items()}, 'ru': {k: v[1] for k, v in STR.items()}}, open(out('strings.json'), 'w'), ensure_ascii=False, indent=1)
print('catalog', len(items), 'items', len(BUNDLES), 'bundles')
from collections import Counter
print(Counter(i['kind'] for i in items))
