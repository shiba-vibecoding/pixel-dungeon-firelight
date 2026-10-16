# Firelight · part 7: compete.json, the competitions in one file: the boards (tabs, slices), the leagues (tiers, the room,
# zones), circles, the season (Heat, the hall of fame, its honours), the honour titles, the share cards and the bot's
# notifications, with every string in EN and RU. Honour only: nothing here is sold, no place is bought.
import json
import c7
from c7 import out, OUT

TIERS = json.load(open(OUT + 'league/tiers.json'))
SEASONS = json.load(open(OUT + 'season/seasons.json'))
TITLES = json.load(open(OUT + 'titles/titles.json'))
BEACON = json.load(open(OUT + 'fires/beacon.json'))

S = {
    'en': dict(
        boards='Boards', tabs=dict(day='Day', week='Week', all='All time', season='Season'),
        tabInfo=dict(day='One dungeon for all, one try counts. The top 3 get the day\'s cup.', week='The best run of the week. Your league is ranked by it.',
                     all='The best runs ever.', season='Heat earned this season: days, places, leagues, circles.'),
        metric=dict(score='Score', speed='Speed', depth='Depth'), metricInfo=dict(score='gold + level × depth × 100, doubled for a win', speed='fewest turns per depth, runs from depth 5',
                                                                                  depth='deepest depth; a tie goes to fewer turns'),
        classAll='All', classes=dict(warrior='Warrior', mage='Mage', rogue='Rogue', huntress='Huntress'),
        players=['{n} player went down today', '{n} players went down today'], playersWeek=['{n} player this week', '{n} players this week'], playersSeason=['{n} player this season', '{n} players this season'],
        closes='Closes in {t}', you='You', placeOf='Your place: {n} of {m}', notYet='You are not on this board yet.', friend='friend',
        turns=['{n} turn', '{n} turns'], perDepth=['{n} turn a depth', '{n} turns a depth'], depthN='depth {n}', depthShort='depth {n}', perTurn='turns a depth', heat='heat {n}', lv='lv.', noLook='no look worn: the class as it is',
        league='League', leagueOf='League «{t}»', week='Week {n}', endsIn='Ends in {t}', room='A room of {n} players by this week\'s best run',
        promote='Promotion zone', demote='Demotion zone', promoteTo='Top {n} go up to «{t}»', demoteTo='The last {n} go down to «{t}»',
        topTier='The highest league: no one goes up, the top 5 get the week\'s Beacon mark', bottomTier='The first league: no one goes down',
        safe='Safe', resultsTitle='The week is over', up='Up to «{t}»!', stay='You stay in «{t}»', down='Down to «{t}»', place='Place {n} of {m}',
        upText='Top {n} of your room. A new room is waiting, with stronger players.', stayText='A strong week. Next week, top {n} goes up.',
        downText='It happens to everyone. The top {n} of «{t}» go back up next week.', newWeek='To the new week', share='Share',
        circles='Circles', friends='Friends', group='Group', members='{n} in the circle', circleWeek='Circle of the week', invite='Invite',
        inviteTitle='Invite to the circle', inviteText='The link opens the game and adds them to this circle. Groups: add the bot to the chat, the whole chat is one circle.',
        copy='Copy link', copied='Copied', sendChat='Send to a chat', inviteFriends='Friends who play', addCircle='New circle', yourCircles='Your circles',
        weekCard='Card for the chat', champion='Circle champion', seasonN='Season {n}', daysLeft='{n} days left', heatRating='Heat', heatHow='How Heat is earned',
        heatRules=['the daily dungeon played: +10', 'the day\'s top 50 %: +10, top 10 %: +25, top 1 %: +50', 'league: up +60, stayed +20, in the Beacon +100',
                   'circle champion of the week: +30'],
        honours='Honours of the season', cup='Season cup', cupFor='top 3 by Heat', seasonFrame='Season frame', seasonFrameFor='top 100 by Heat',
        beaconFire='Beacon campfire', beaconFireFor='finish the season in the Beacon league', titleFor='title', hall='Hall of fame', hallOf='Hall of fame · season {n}',
        honourOnly='Honour only: nothing in competitions is sold, no place can be bought.', profile='Profile', bestPlace='Best place', streak=['{n} day in a row', '{n} days in a row'],
        trophies='Trophies', duelSoon='Duel on one seed: soon', story='Story', chat='Chat', descend='Descend', deeperQ='Will you go deeper?',
        storyPlace='#{n} of the day', storyStreak='{n}-day streak', storyDepth='Depth {n}', circleCardTitle='Circle of the week', circleCardSub='{c} · week {n}',
        notify='Notifications', notifyNote='From the bot, at most once a day; switched off in the settings.',
        n_overtaken=dict(title='You were overtaken', text='{who} passed you on today\'s board: you are #{n} now. The day closes in {t}; tomorrow brings a new dungeon.',
                         button='See the board'),
        n_league=dict(title='League results', text='Week {w} is over: place {n} of {m} in «{t}». {res} The new week has begun.', button='My league',
                      up='You go up to «{t2}»!', stay='You stay.', down='You go down to «{t2}».'),
        n_streak=dict(title='Streak in danger', text='Your {n}-day streak breaks at midnight UTC. Today\'s dungeon is waiting!', button='Descend'),
        cardStates=dict(me='me', friend='friend', top1='top 1', top2='top 2', top3='top 3', plain='others', bare='no look'),
    ),
    'ru': dict(
        boards='Доски', tabs=dict(day='День', week='Неделя', all='Всё время', season='Сезон'),
        tabInfo=dict(day='У всех одно подземелье, засчитывается одна попытка. Тройка лучших получает кубок дня.', week='Лучший забег недели. По нему считается ваша лига.',
                     all='Лучшие забеги за всё время.', season='Жар этого сезона: дни, места, лиги, круги.'),
        metric=dict(score='Очки', speed='Скорость', depth='Глубина'), metricInfo=dict(score='золото + уровень × глубина × 100, за победу вдвое', speed='меньше ходов на глубину, забеги от 5-й глубины',
                                                                                     depth='самая большая глубина; при равной — меньше ходов'),
        classAll='Все', classes=dict(warrior='Воин', mage='Маг', rogue='Разбойник', huntress='Охотница'),
        players=['Сегодня спустился {n} игрок', 'Сегодня спустились {n} игрока', 'Сегодня спустились {n} игроков'], playersWeek=['{n} игрок за неделю', '{n} игрока за неделю', '{n} игроков за неделю'], playersSeason=['{n} игрок в сезоне', '{n} игрока в сезоне', '{n} игроков в сезоне'],
        closes='До конца {t}', you='Вы', placeOf='Ваше место: {n} из {m}', notYet='Вас пока нет на этой доске.', friend='друг',
        turns=['{n} ход', '{n} хода', '{n} ходов'], perDepth=['{n} ход на глубину', '{n} хода на глубину', '{n} ходов на глубину'], depthN='глубина {n}', depthShort='гл. {n}', perTurn='ходов на гл.', heat='жар {n}', lv='ур.', noLook='облика нет: класс как есть',
        league='Лига', leagueOf='Лига «{t}»', week='Неделя {n}', endsIn='До конца {t}', room='Комната из {n} игроков по лучшему забегу недели',
        promote='Зона повышения', demote='Зона понижения', promoteTo='Первые {n} поднимутся в «{t}»', demoteTo='Последние {n} спустятся в «{t}»',
        topTier='Высшая лига: выше некуда, пятёрка лучших получает знак Маяка недели', bottomTier='Первая лига: ниже не спускаются',
        safe='Без изменений', resultsTitle='Неделя закрылась', up='Вы поднялись в «{t}»!', stay='Вы остаётесь в «{t}»', down='Вы спустились в «{t}»', place='Место {n} из {m}',
        upText='Первые {n} в комнате. Новая комната ждёт — там игроки сильнее.', stayText='Хорошая неделя. В следующей первые {n} поднимутся.',
        downText='Так бывает у всех. Первые {n} в «{t}» поднимутся уже через неделю.', newWeek='К новой неделе', share='Поделиться',
        circles='Круги', friends='Друзья', group='Группа', members='{n} в круге', circleWeek='Круг недели', invite='Пригласить',
        inviteTitle='Позвать в круг', inviteText='Ссылка откроет игру и добавит в этот круг. Группа: добавьте бота в чат — весь чат станет одним кругом.',
        copy='Скопировать ссылку', copied='Скопировано', sendChat='Отправить в чат', inviteFriends='Друзья, которые играют', addCircle='Новый круг', yourCircles='Ваши круги',
        weekCard='Карточка для чата', champion='Чемпион круга', seasonN='Сезон {n}', daysLeft='Осталось {n} дн.', heatRating='Жар', heatHow='Как набирается жар',
        heatRules=['сыграно подземелье дня: +10', 'лучшие 50 % дня: +10, 10 %: +25, 1 %: +50', 'лига: повышение +60, остались +20, в Маяке +100',
                   'чемпион круга за неделю: +30'],
        honours='Награды сезона', cup='Кубок сезона', cupFor='тройка лучших по жару', seasonFrame='Рамка сезона', seasonFrameFor='первые 100 по жару',
        beaconFire='Костёр «Маяк»', beaconFireFor='закончить сезон в лиге «Маяк»', titleFor='титул', hall='Зал славы', hallOf='Зал славы · сезон {n}',
        honourOnly='Только честь: в соревнованиях ничего не продаётся, место не купить.', profile='Профиль', bestPlace='Лучшее место', streak=['{n} день подряд', '{n} дня подряд', '{n} дней подряд'],
        trophies='Трофеи', duelSoon='Дуэль на одном сиде: скоро', story='Сторис', chat='Чат', descend='Спуститься', deeperQ='Спустишься глубже?',
        storyPlace='#{n} дня', storyStreak='Серия {n} дн.', storyDepth='Глубина {n}', circleCardTitle='Круг недели', circleCardSub='{c} · неделя {n}',
        notify='Уведомления', notifyNote='От бота, не чаще раза в день; отключаются в настройках.',
        n_overtaken=dict(title='Вас обогнали', text='{who} обогнал(а) вас на доске дня: теперь вы #{n}. День закроется через {t} — завтра новое подземелье.',
                         button='К доске'),
        n_league=dict(title='Итоги лиги', text='Неделя {w} закрылась: место {n} из {m} в «{t}». {res} Новая неделя уже идёт.', button='Моя лига',
                      up='Вы поднимаетесь в «{t2}»!', stay='Вы остаётесь.', down='Вы спускаетесь в «{t2}».'),
        n_streak=dict(title='Серия под угрозой', text='Ваша серия — {n} {days} подряд — сгорит в полночь по UTC. Подземелье дня ждёт!', button='Спуститься'),
        cardStates=dict(me='я', friend='друг', top1='топ-1', top2='топ-2', top3='топ-3', plain='остальные', bare='без облика'),
    ),
}

DATA = dict(
    version=1,
    honourOnly=True,
    note='Competitions are looks and honour only (MONETIZATION.md): nothing here has a price, a place or a tier cannot be bought, and paid looks give no advantage.',
    card=dict(anchors='compete/anchors.json', animate=['top1', 'top2', 'top3', 'me'], states=['me', 'friend', 'top1', 'top2', 'top3', 'plain', 'bare'],
              worn=dict(skin='sk', hat='ht', pet='pt', fire='fi', frame='fr', name='nc', title='tt', tier='ar', league='lg'),
              fallback=dict(skin=None, hat=None, pet=None, fire='classic', frame='league', note='nothing worn: the class sheet, no hat or pet, the classic fire, the league frame')),
    boards=dict(tabs=['day', 'week', 'all', 'season'], metrics=['score', 'speed', 'depth'], classes=['all', 'warrior', 'mage', 'rogue', 'huntress'],
                speed=dict(minDepth=5, value='turns / depth', order='asc'), depth=dict(value='depth', tie='turns asc'),
                top=3, rows=50, pinMe=True, counter=dict(day='players', week='playersWeek', all=None, season='playersSeason')),
    leagues=dict(tiers=TIERS, room=30, promote=5, demote=5, week='weekOf (UTC, Monday 00:00)', start='spark',
                 rules=['a room is 30 players of one tier who played this week, by the week\'s best run', 'the first 5 go up, the last 5 go down; no one leaves the Beacon upwards or the Spark downwards',
                        'a week not played: the tier stays; two in a row: one tier down', 'the top 5 of the Beacon get the week\'s Beacon mark on their profile'],
                 beaconWeekMark='compete/league/badge-beacon.png'),
    circles=dict(kinds=['friends', 'group'], size=dict(friends=50, group=200), board='week', invite='https://t.me/pixel_dungeon_gamebot?startapp=c_<code>',
                 group='the bot added to a Telegram group: the chat is one circle; members join by opening the game from it', champion='title.circle_champion'),
    season=dict(template=SEASONS['template'], seasons=SEASONS['seasons'], current='s1', weeks=8, heat=dict(daily=10, dayTop50=10, dayTop10=25, dayTop1=50, leagueUp=60, leagueStay=20, leagueBeacon=100, circleChampion=30),
                honours=[dict(kind='cup', who='top 3 by heat', art='season.cup'), dict(kind='frame', who='top 100 by heat', art='season.frame'),
                         dict(kind='fire', who='the Beacon league at the season\'s end', art='fire.beacon'), dict(kind='title', who='the Beacon league at the end, or the top 10 by heat', art='title.season_beacon')],
                hallOfFame=dict(top=10, keep='for ever, one page a season')),
    fire=dict(beacon=dict(sku='fire.beacon', kind='fire', fire='beacon', name=dict(en='Beacon', ru='Маяк'), **BEACON)),
    titles=TITLES,
    share=dict(story=dict(size=[1080, 1920]), chat=dict(size=[1280, 640]), circle=dict(size=[1280, 640]), noSeed=True,
               note='the hero by his own fire, the place, the streak, the class and the depth; never the seed (it would spoil the daily dungeon)'),
    notify=dict(image=[640, 360], kinds=['overtaken', 'league', 'streak'], once='at most one message a day from the bot in all; «overtaken» only while the player is in the day\'s top 50',
                when=dict(overtaken='when someone passes the player on the day\'s board and the player is in the top 50', league='Monday 08:00 UTC', streak='17:00 UTC when the streak would break')),
    plural=dict(en='[one, other]: n == 1 ? one : other', ru='[one, few, many] by the Russian rule (n % 10 == 1 && n % 100 != 11: one; 2-4 but not 12-14: few; else many)'),
    strings=S,
)


def main():
    json.dump(DATA, open(out('compete.json'), 'w'), ensure_ascii=False, indent=1)
    print('compete.json ok')


if __name__ == '__main__':
    main()
