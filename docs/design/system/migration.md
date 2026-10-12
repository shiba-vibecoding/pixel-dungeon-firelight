# Перенос в код

Что подключить, какие классы поменялись и какая разметка нужна каждому окну. Разметка в макетах этой системы та же — её можно копировать из превью компонентов.

## Подключение

1. `fonts/Galmuri11.woff2`, `fonts/Galmuri9.woff2` — через `@font-face` (он есть в `tokens.css`).
2. `tokens.css` — переменные цветов, отступов, размеров, `--px` и `--text-*`.
3. `components/bundle.css` — все компоненты. В начале файла лежат переменные спрайтов `--atlas-*` и `--spr-*`, встроенные как data: URI. Переопределите их своими файлами:

```css
:root {
  --atlas-items: url("assets/items.png");
  --atlas-buffs: url("assets/buffs.png");
  --atlas-badges: url("assets/badges.png");
  --atlas-avatars: url("assets/avatars.png");
  --spr-window: url("assets/ui-window.png");
}
```

4. Корню игры дайте класс `.pd-root`. Если HUD считается в JS, высоту HUD передайте в `--hud-h`: под ней появится toast.

## Старый класс → новый

| Было | Стало | Что сделать |
| --- | --- | --- |
| `.pd-window` | `.pd-window`, `.pd-window.narrow` | Рамка та же (`ui-window.png`, срез 7). Добавьте шапку `.pd-window-head` и крестик `.pd-close`. |
| кнопка «Назад» / «Закрыть» | `.pd-close` | Уберите кнопку и поставьте крестик первым дочерним элементом окна. Тап по `#overlay` закрывает окно. |
| `.pd-row` | `.pd-row` | Без изменений: кнопки в ряду делят ширину поровну. |
| `.pd-button` (все красные) | `.pd-button` — второстепенная, каменная | Красной теперь будет только `.primary`. Пройдитесь по окнам и пометьте главное действие. |
| `.pd-button.primary` | `.pd-button.primary` | Одна на окно, первой. |
| — | `.pd-button.danger` | «Выбросить», «Продать». Кладите в `.pd-danger-zone` в конце `.pd-actions`. |
| — | `.pd-button.quiet` | «Нет», «Отмена», «Главное меню». |
| — | `.pd-button.ally`, `.small`, `.big`, `.stacked` + `.pd-btn-sub` | Кооператив, компактная кнопка в карточке, крупная «Продолжить» с подписью. |
| столбик кнопок | `.pd-actions` | Основная → второстепенные по две в `.pd-row` → `.pd-danger-zone`. |
| `.pd-heading` | `.pd-heading`, `.center` | 24px, `gold`. |
| `.pd-info` | `.pd-info`, `.center` | 18px, `ink`. Выравнивание влево (было по центру). |
| `.pd-note` | `.pd-note`, `.center` | 15px, `ink-muted`. |
| строка-предупреждение | `.pd-callout.bad` / `.warn` / `.cursed` | Плашка с иконкой «!» или черепом. |
| `.pd-grid` | `.pd-grid`, `.c4`, `.c6` | 5 столбцов по `--slot` (52px), зазор 8px. `.c6` — значки. |
| `.pd-slot`, `.pd-slot.empty` | + `.equipped`, `.placeholder`, `.cursed`, `.selected`, `.pressed`, `.disabled`, `.new` | Подпись «надето» больше не нужна: надетое — в ряду `.pd-equip`. |
| `.pd-item` | `.pd-item` + `--ix`/`--iy` или `data-i` | `PD.sprite()` ставит переменные по `data-i` (номер в `items.png`). |
| `.pd-qty` | `.pd-qty` | Правый нижний угол, 15px, обводка `void`. Заряды тоже сюда: «2/2». |
| `.pd-lvl.up` / `.down` | без изменений | Левый верхний угол, `good` / `bad`. |
| `.pd-tag` | `.pd-tag`, `.bad`, `.unknown` | Правый верхний угол: сила («12»; если не хватает — `.bad`), «?» у неопознанного. |
| — | `.pd-mark.curse`, `.pd-mark.quick` | Значки «проклят» и «в быстром слоте». |
| `.pd-buff` | `.pd-buff > i[data-b]`, `.fading`, `.pd-buff-n` | Иконка 7×7 из `buffs.png` ×3 в квадрате 36px (`.big` — 44px). |
| `.pd-input` | `.pd-input` в `.pd-field` с `<label>` | Впадина `stone-800`, фокус — кольцо `focus`. |
| `.pd-classes` / `.pd-class` | + `.pd-class-face`, `.selected`, `.locked`, `.pd-class-info` | Лицо героя из `avatars.png` вместо иконки оружия. Имя класса — под рядом. |
| `#toast` | `#toast` или `.pd-toast` + `.good` / `.warn` / `.ally` / `.badge` | Рамка `chrome.png` TOAST. Место — под HUD. |
| `#overlay` | `#overlay.open` | Затемнение `scrim`, поля = safe-area + 8px. |
| HUD на canvas | `.pd-hud` | Разметка ниже. |
| панель на canvas | `.pd-toolbar` + `.pd-tool` | Разметка ниже. |
| строка лога на canvas | `.pd-log` + `.pd-log-line` | `PD.log(box, text, type)`. |

## Окна

### Окно предмета

```html
<div id="overlay" class="open">
  <section class="pd-window" role="dialog" aria-labelledby="item-title">
    <header class="pd-window-head">
      <div class="pd-slot"><i class="pd-item" data-i="20"></i><span class="pd-lvl up">+2</span></div>
      <div class="pd-titles"><h2 class="pd-heading" id="item-title">Пылающий меч <span class="pd-good">+2</span></h2></div>
      <button class="pd-close" aria-label="Закрыть"></button>
    </header>
    <p class="pd-info">Урон 9-22. Нужна сила 12.</p>
    <p class="pd-info">Удары этим оружием могут поджечь врага.</p>
    <p class="pd-callout bad">Слишком тяжело для вас: будете неуклюжи.</p>
    <div class="pd-actions">
      <button class="pd-button primary">Надеть</button>
      <div class="pd-row"><button class="pd-button">Бросить</button><button class="pd-button">…</button></div>
      <div class="pd-danger-zone"><button class="pd-button danger">Выбросить</button></div>
    </div>
  </section>
</div>
```

Действия раскладываются так: первое — `.primary`, остальные обычные по два в `.pd-row` (нечётное последнее — одно), «Выбросить» и «Продать» — в `.pd-danger-zone`. Шесть действий укладываются в 360×640.

### Рюкзак

```html
<section class="pd-window" role="dialog" aria-labelledby="bag-title">
  <header class="pd-bag-head">
    <h2 class="pd-heading" id="bag-title">Рюкзак</h2>
    <span class="pd-stat gold"><i class="pd-icon" style="width:16px;height:14px;background-image:var(--spr-coin)"></i>0</span>
    <span class="pd-stat"><span class="pd-stat-label">Сила</span>11</span>
    <button class="pd-close" aria-label="Закрыть"></button>
  </header>
  <div class="pd-equip">
    <button class="pd-slot equipped"><i class="pd-item" data-i="2"></i></button>   <!-- оружие -->
    <button class="pd-slot equipped"><i class="pd-item" data-i="24"></i></button>  <!-- доспех -->
    <div class="pd-slot placeholder"><i class="pd-item" data-i="7"></i></div>        <!-- пустое кольцо -->
    <div class="pd-slot placeholder"><i class="pd-item" data-i="7"></i></div>
  </div>
  <div class="pd-grid">
    <button class="pd-slot"><i class="pd-item" data-i="31"></i><span class="pd-qty">8</span><span class="pd-mark quick"></span></button>
    <!-- … до 20 ячеек; пустые: <div class="pd-slot empty"></div> -->
  </div>
  <div class="pd-bagrow-title"><span class="pd-note">В сумках и на связке ключей:</span></div>
  <div class="pd-bagrow"><button class="pd-slot"><i class="pd-item" data-i="88"></i><span class="pd-qty">2</span></button></div>
</section>
```

Пустые места экипировки показывают силуэт: 5 — оружие, 6 — доспех, 7 — кольцо. В режиме выбора предмета (кузнец, «бросить в…», «прочитать на…») неподходящие ячейки получают `.disabled`.

### Диалог с NPC: награды и ответы

```html
<section class="pd-window" role="dialog" aria-labelledby="npc">
  <header class="pd-npc-head">
    <div class="pd-portrait"><img src="ghost-frame.png" style="--w:14;--h:15" alt=""></div>
    <h2 class="pd-heading" id="npc">Грустный призрак</h2>
    <button class="pd-close" aria-label="Закрыть"></button>
  </header>
  <p class="pd-speech">…реплика…</p>
  <div class="pd-rewards">
    <div class="pd-reward">
      <div class="pd-slot"><i class="pd-item" data-i="21"></i><span class="pd-lvl up">+2</span></div>
      <div class="pd-reward-name">Длинный меч <span class="pd-good">+2</span></div>
      <div class="pd-reward-desc">Урон 9-29. Нужна сила 15.</div>
      <button class="pd-button small">Взять</button>
    </div>
  </div>
</section>
```

Портрет — первый кадр спрайта NPC, увеличенный ×3 (`--w`/`--h` — размер кадра). Если в диалоге нужен ответ «Да / Нет», вместо `.pd-rewards` поставьте `<div class="pd-row"><button class="pd-button quiet">Нет</button><button class="pd-button primary">Да</button></div>` и уберите крестик. В кооперативе карточку, которую забрал товарищ, пометьте `.taken`.

### Торговля

```html
<section class="pd-window" role="dialog">
  <header class="pd-window-head">
    <div class="pd-slot"><i class="pd-item" data-i="26"></i></div>
    <div class="pd-titles"><h2 class="pd-heading">Кольчуга</h2><span class="pd-price">270</span></div>
    <button class="pd-close" aria-label="Закрыть"></button>
  </header>
  <p class="pd-info">…описание…</p>
  <div class="pd-actions"><button class="pd-button primary">Купить</button></div>
  <p class="pd-note center">У вас 312 золота</p>
</section>
```

Если золота не хватает, цене добавьте `.short`, а кнопке — `disabled`. При продаже кнопки «Продать» — `.danger`, без основной.

### Кузнец

```html
<section class="pd-window">
  <header class="pd-npc-head">…портрет, «Тролль-кузнец», крестик…</header>
  <p class="pd-speech">…</p>
  <div class="pd-reforge">
    <button class="pd-slot selected"><i class="pd-item" data-i="20"></i></button>
    <span class="pd-reforge-arrow"></span>
    <button class="pd-slot empty" aria-label="Выбрать второй предмет"></button>
  </div>
  <div class="pd-actions"><button class="pd-button primary" disabled>Перековать</button></div>
</section>
```

Тап по пустой ячейке открывает рюкзак в режиме выбора. Кнопка включается, когда выбраны оба предмета.

### Окно героя

`.pd-window-head` с заголовком «Воин, уровень 1» и крестиком → `<dl class="pd-stats"><div><dt>Сила</dt><dd>11</dd></div>…</dl>` → подзаголовок «Состояние» → строки `<div class="pd-row"><span class="pd-buff"><i data-b="3"></i></span><span class="pd-info">Отравление</span></div>`. Если состояний нет — `<p class="pd-note">Ничего необычного.</p>`.

### Меню

`.pd-window.narrow` → шапка «Меню» + крестик → `.pd-menu-list`: `.pd-button.primary` «Продолжить», `.pd-button` «Справка», переключатели `<button class="pd-switch" role="switch" aria-checked="true"><span class="pd-info">Звук</span><span class="pd-switch-box"></span></button>`, ниже — «Главное меню».

### Справка

Шапка + крестик → вкладки `<div class="pd-tabs" role="tablist"><button class="pd-tab" role="tab" aria-selected="true">…</button>…</div>` → `<div class="pd-scroll" style="max-height:60vh">` с абзацами `.pd-info`. Прокручивается только текст внутри.

### «Осмотреть»

```html
<section class="pd-window">
  <header class="pd-examine-head">
    <div class="pd-portrait"><img src="rat-frame.png" style="--w:16;--h:15" alt=""></div>
    <div class="pd-titles"><h2 class="pd-heading">Крыса-мародёр</h2><div class="pd-bar" style="--v:.58"><span class="pd-bar-text">5/8</span></div></div>
    <button class="pd-close" aria-label="Закрыть"></button>
  </header>
  <p class="pd-info">…описание…</p>
  <div class="pd-buffs">…состояния монстра…</div>
</section>
```

Для места (клетки) полоски здоровья нет: в портрете — тайл, в заголовке — название.

### Табличка

`<div class="pd-sign"><p class="pd-info">…текст таблички…</p></div>` внутри `#overlay`. Без крестика, закрывается тапом в любом месте.

### Подтверждение

```html
<section class="pd-window narrow" role="alertdialog" aria-labelledby="q">
  <h2 class="pd-heading center" id="q">Прыгнуть в пропасть?</h2>
  <p class="pd-info center">…пояснение…</p>
  <div class="pd-row"><button class="pd-button quiet">Нет</button><button class="pd-button primary">Да</button></div>
</section>
```

Если действие необратимо и опасно, сделайте «Да» не `.primary`, а `.danger`.

### Конец забега

```html
<section class="pd-window pd-runend" role="dialog">   <!-- победа: pd-runend win -->
  <h2 class="pd-display">Вы погибли</h2>
  <p class="pd-cause">Убиты крысой-мародёром на глубине 3</p>
  <div class="pd-runend-hero"><div class="pd-avatar"><i style="--av:0"></i></div><div>…имя, класс, уровень…</div></div>
  <dl class="pd-stats">…<div><dt>Подземелье дня</dt><dd class="ally">12 из 214</dd></div></dl>
  <div class="pd-actions">
    <button class="pd-button primary">Поделиться</button>
    <button class="pd-button">Новая игра</button>
    <button class="pd-button quiet">Главное меню</button>
  </div>
</section>
```

### Рекорды дня

Шапка (заголовок, `.pd-note` с датой и числом героев, крестик) → `.pd-scroll` → `.pd-ranks` со строками `<div class="pd-rank"><span class="pd-rank-n">1</span><i class="pd-rank-face" style="--av:3"></i><span class="pd-rank-name">Ёжик<small>Охотница · глубина 9</small></span><span class="pd-rank-score">4 120</span></div>`. Своя строка — `.me`; первые три места выделены `gold-deep` автоматически.

### Значки

```html
<section class="pd-window" role="dialog">
  <header class="pd-window-head"><div class="pd-titles"><h2 class="pd-heading">Значки</h2><span class="pd-note">Получено 14 из 59</span></div><button class="pd-close" aria-label="Закрыть"></button></header>
  <div class="pd-scroll" style="max-height:400px">
    <div class="pd-grid c6">
      <button class="pd-slot selected"><i class="pd-badge" data-i="1"></i></button>
      <button class="pd-slot new"><i class="pd-badge" data-i="48"></i></button>
      <button class="pd-slot"><i class="pd-badge dim" data-i="2"></i></button>
    </div>
  </div>
  <div class="pd-badge-detail"><i class="pd-badge big" data-i="1"></i><span class="pd-badge-name">…название…</span><span class="pd-badge-desc">…описание…</span></div>
</section>
```

`data-i` — номер в `badges.png` (8 в ряд). Если выбран неполученный значок, добавьте `.pd-badge-detail.locked`: название станет приглушённым.

### Титульный экран

```html
<main class="pd-title-screen">
  <div class="pd-logo"><span class="pd-logo-kicker">TELEGRAM</span><img src="logo.png" alt="Pixel Dungeon"><span class="pd-logo-sub">кооперативное издание</span></div>
  <section class="pd-window">
    <div class="pd-classes" role="radiogroup" aria-label="Класс">
      <button class="pd-class selected" role="radio" aria-checked="true" aria-label="Воин"><i class="pd-class-face" style="--av:0"></i></button>
      <!-- Маг --av:1, Разбойник --av:2, Охотница --av:3 -->
    </div>
    <div class="pd-class-info"><span class="pd-class-name">Воин</span><p class="pd-note">…описание класса…</p></div>
    <div class="pd-field"><label for="name">Имя героя</label><input class="pd-input" id="name" placeholder="Имя героя"></div>
    <div class="pd-actions">
      <button class="pd-button primary big stacked">Продолжить<span class="pd-btn-sub">Воин, уровень 3 · глубина 4</span></button>
      <button class="pd-button">Новая игра</button>
      <button class="pd-button ally">Играть с друзьями</button>
    </div>
    <div class="pd-daily">
      <div class="pd-daily-head"><i class="pd-icon" style="background-image:var(--spr-stairs)"></i><h3>Подземелье дня</h3></div>
      <p class="pd-note">Сегодня у всех одно подземелье</p>
      <div class="pd-row"><button class="pd-button">Спуститься</button><button class="pd-button">Рекорды дня</button></div>
    </div>
  </section>
</main>
```

Если сохранения нет, «Продолжить» не показывается, а основной становится «Новая игра». Фон экрана задаётся через `--title-bg`. На экранах ниже 700px логотип уменьшается, а подпись логотипа, подпись поля и подпись блока дня скрываются — экран помещается в 360×640.

### Справка

```html
<section class="pd-window" role="dialog" aria-labelledby="help">
  <header class="pd-window-head"><div class="pd-titles"><h2 class="pd-heading" id="help">Справка</h2></div><button class="pd-close" aria-label="Закрыть"></button></header>
  <div class="pd-tabs" role="tablist">
    <button class="pd-tab" role="tab" aria-selected="true">Управление</button>
    <button class="pd-tab" role="tab" aria-selected="false">Советы</button>
  </div>
  <div class="pd-scroll" style="max-height:min(520px, 60vh)">
    <ul class="pd-tips">   <!-- вкладка «Советы»: class="pd-tips plain", без .pd-tip-ico -->
      <li class="pd-tip">
        <span class="pd-tip-ico"><i class="pd-icon" style="--w:12;--h:12;background-image:var(--spr-tool-wait)"></i></span>
        <p class="pd-info">Касание часов — пропустить ход. Удержание — отдых…</p>
      </li>
    </ul>
  </div>
</section>
```

Иконки строк: `--spr-target` (касание клетки), `--spr-tool-wait/-search/-info/-backpack`, `.pd-item` (быстрый слот), `--spr-menu`. `--w/--h` — размер кадра в пикселях спрайта.

### Строка состояния

```html
<header class="pd-hud">
  …
  <div class="pd-status target" role="status">
    <i class="pd-item" data-i="31" style="width:32px;height:32px"></i>
    <span class="pd-status-text">Выберите цель</span>
    <button class="pd-button small">Отмена</button>
  </div>
</header>
```

Остальные варианты: `.connecting` и `.reconnecting` с `<span class="pd-dots"><i></i><i></i><i></i></span>` вместо иконки; `.waiting` с `--spr-busy` и именами в `<span class="pd-ally">`; `.dead` с `--spr-skull`; `.examine` с `--spr-tool-info`. Когда режима нет — `hidden`. Кнопке «Осмотреть» на панели в этом режиме ставьте `aria-pressed="true"`.

### Выбор пути

```html
<section class="pd-window" role="dialog" aria-labelledby="way">
  <header class="pd-window-head">
    <div class="pd-slot"><i class="pd-item" data-i="82"></i></div>
    <div class="pd-titles"><h2 class="pd-heading" id="way">Какой путь выберете?</h2></div>
  </header>
  <div class="pd-choices">
    <div class="pd-choice">
      <span class="pd-choice-name">Гладиатор</span>
      <p class="pd-choice-desc">…2–3 строки…</p>
      <button class="pd-button small">Выбрать</button>
    </div>
    <div class="pd-choice">…Берсерк…</div>
  </div>
  <button class="pd-button quiet">Решу позже</button>
</section>
```

Крестика нет: закрывает окно «Решу позже». Если выбор надо подтвердить, отметьте карточку `.chosen`, а её кнопку сделайте `.primary`.

### Загрузка и ошибка соединения

```html
<main class="pd-loading" aria-busy="true">
  <div class="pd-logo">…</div>
  <div class="pd-runner" aria-hidden="true"></div>
  <div class="pd-progress" style="--v:.62" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62"></div>
  <p class="pd-loading-text">Загрузка спрайтов… 62%</p>
  <p class="pd-loading-tip"><b>Совет:</b> …</p>
</main>

<div id="overlay" class="open">
  <section class="pd-window narrow" role="alertdialog" aria-labelledby="err">
    <div class="pd-error-icon" aria-hidden="true"></div>
    <h2 class="pd-heading center" id="err">Нет соединения</h2>
    <p class="pd-info center">…</p>
    <button class="pd-button primary">Повторить</button>
    <p class="pd-note center">Повторим сами через 5&nbsp;с · код&nbsp;1006</p>
  </section>
</div>
```

`.pd-runner` берёт кадры из `--atlas-warrior`. Чтобы бежал другой герой, переопределите переменную. Обновляйте `--v` не чаще одного раза за кадр: полоса заполняется сегментами по 8 пикселей сетки.

### Новые классы

| Класс | Что это |
| --- | --- |
| `.pd-tips`, `.pd-tips.plain`, `.pd-tip`, `.pd-tip-ico` | список справки |
| `.pd-status` + `.connecting` / `.reconnecting` / `.waiting` / `.target` / `.dead` / `.examine`, `.pd-status-text`, `.pd-dots` | строка состояния |
| `.pd-tool[aria-pressed="true"]`, `.pd-tool.active` | включённый режим «Осмотреть» |
| `.pd-choices`, `.pd-choice`, `.pd-choice-name`, `.pd-choice-desc`, `.chosen` | выбор пути |
| `.pd-loading`, `.pd-runner`, `.pd-progress`, `.pd-loading-text`, `.pd-loading-tip`, `.pd-error-icon` | загрузка и ошибка |

### Прочность

```html
<!-- ячейка: полоска последним ребёнком; у сломанной — .broken -->
<button class="pd-slot broken">
  <i class="pd-item" data-i="50"></i><span class="pd-lvl up">+1</span><span class="pd-qty">2/5</span>
  <i class="pd-dur broken" style="--v:0"></i>
</button>

<!-- окно предмета: под строкой характеристик -->
<header class="pd-window-head">… <h2 class="pd-heading">Пылающий меч <span class="pd-lvl-broken">+2</span></h2> …</header>
<p class="pd-info">Урон 6-15. Нужна сила 12.</p>
<div class="pd-durability">                    <!-- .low при ≤ 25% -->
  <p class="pd-info">Прочность: 0 из 84</p>
  <i class="pd-dur big broken" style="--v:0"></i>
</div>
<p class="pd-callout broken">Сломано: работает, как будто его не улучшали…</p>
```

`PD.durability(el, cur, max)` ставит `--v` и классы сам. Временную полоску у нижнего края и оранжевый «+2» замените этим: полоска та же по месту, но цифры поднимаются над ней, а уровень сломанной вещи гаснет и перечёркивается.

| Класс | Что это |
| --- | --- |
| `.pd-dur`, `.low`, `.broken`, `.big` | полоска прочности на ячейке и в окне |
| `.pd-slot.broken`, `.pd-tool.broken`, `.has-dur` | сломанная вещь; запасной класс вместо `:has()` |
| `.pd-lvl-broken` | перечёркнутый уровень в заголовке |
| `.pd-durability`, `.low` | строка «Прочность: …» с полоской в окне предмета |
| `.pd-callout.broken` | плашка «Сломано: …» |

### Пиксель-Март

```html
<section class="pd-window" role="dialog" aria-label="Пиксель-Март">
  <header class="pd-window-head">
    <div class="pd-portrait"><i class="keeper" style="--keeper:url(shopkeeper.png)"></i></div>
    <div class="pd-titles"><h2 class="pd-heading">Пиксель-Март</h2><span class="pd-note">Безопасная жизнь в подземелье.</span></div>
    <button class="pd-close" aria-label="Закрыть"></button>
  </header>
  <div class="pd-tabs compact" role="tablist">
    <button class="pd-tab" role="tab" aria-selected="true">Облики</button>
    <button class="pd-tab" role="tab" aria-selected="false">Эффекты</button>
    <button class="pd-tab" role="tab" aria-selected="false">Рамки</button>
    <button class="pd-tab" role="tab" aria-selected="false"><i class="pd-icon" style="background-image:var(--spr-patron)"></i>Покровитель</button>
  </div>
  <div class="pd-scroll" style="max-height:min(560px, 70vh)">
    <div class="pd-shop-grid">
      <article class="pd-offer">                      <!-- .owned / .worn / .badge / .offseason -->
        <div class="pd-offer-art"><canvas></canvas></div>  <!-- превью; чип .pd-chip / .pd-chip.season и замок .pd-offer-lock — тоже сюда -->
        <h3 class="pd-offer-name">Королевский</h3>
        <p class="pd-offer-meta"><span class="pd-stars small">75</span></p>
        <button class="pd-button small">Купить</button>
      </article>
    </div>
  </div>
</section>
```

| Состояние | `.pd-offer-meta` | Кнопка |
| --- | --- | --- |
| можно купить | `<span class="pd-stars small">75</span>` | `.pd-button.small` «Купить» |
| `.owned` | «Куплено» | «Надеть» |
| `.worn` + чип «Надето» | класс героя | `.quiet` «Снять» |
| `.badge` + `.pd-offer-lock` | `<i class="pd-offer-badge" data-i="22"></i>За значок «…»` | нет; вместо неё `<p class="pd-offer-cond">условие</p>` |
| в сезон | цена; чип `<span class="pd-chip season">до 31 дек.</span>` | «Купить» |
| `.offseason` | «Вернётся зимой»; чип `.pd-chip.season` «Зима» | `disabled` «Не в сезон» |

Окно товара: шапка с названием и «Облик воина», `.pd-offer-hero` с canvas бега, `.pd-tiers` — семь canvas уровней брони с подписями, описание, `.pd-actions` с основной «Купить за <span class="pd-stars">75</span>» и `.pd-note` «Оплата звёздами Telegram».

### Покровитель

```html
<section class="pd-window" role="dialog" aria-labelledby="pt">
  <header class="pd-window-head">
    <i class="pd-patron-big"></i>
    <div class="pd-titles"><h2 class="pd-heading" id="pt">Покровитель</h2><span class="pd-note">Подписка на месяц</span></div>   <!-- активна: <span class="pd-chip active">Активна до 12 ноября</span> -->
    <button class="pd-close" aria-label="Закрыть"></button>
  </header>
  <ul class="pd-perks">
    <li class="pd-perk"><span class="pd-perk-ico"><i class="pd-patron-mark"></i></span><p class="pd-info">Звезда у имени…</p></li>
    <li class="pd-perk"><span class="pd-perk-ico"><i class="pd-perk-frame"></i></span><p class="pd-info">Рамка портрета «Покровитель»</p></li>
    <li class="pd-perk"><span class="pd-perk-ico"><i class="pd-offer-badge patron"></i></span><p class="pd-info">Значок «Меценат» в коллекции</p></li>
  </ul>
  <div class="pd-price-row"><span class="pd-stars">99</span><span class="pd-note">в месяц</span></div>
  <div class="pd-actions"><button class="pd-button primary">Оформить за <span class="pd-stars">99</span></button></div>
  <p class="pd-note center">Оплата звёздами Telegram…</p>
</section>
```

В активном состоянии уберите `.pd-price-row` и `.pd-actions`, вместо них — `.pd-note` с датой продления и `.pd-button.quiet` «Управлять подпиской».

### Звезда, рамки, облик

```html
<!-- рекорды -->  <span class="pd-rank-name">Ёжик<i class="pd-patron-mark"></i><small>…</small></span>   <!-- строке — .pd-rank.patron -->
<!-- отряд -->    <span class="pd-mate-name"><i class="pd-patron-mark sm"></i>Лиса</span>
<!-- рамка -->    <div class="pd-avatar framed frame-gold"><i style="--av:0"></i></div>   <!-- frame-bronze | frame-gold | frame-shadow | frame-patron -->
```

Над головой на карте: `PD.fx.nameplate(ctx, 'Лиса', spriteCenterX, spriteTopY, { ally: true, patron: true })` — имя Galmuri9 15px с обводкой, звезда слева. Своему герою имя не рисуйте.

Облик героя: загрузите лист `warrior-royal.png` (и т. п.) вместо `warrior.png`; кадры и уровни брони те же, менять код анимации не нужно.

Ряд «Облик» в окне героя:

```html
<h3 class="pd-subhead">Облик</h3>
<div class="pd-looks">
  <button class="pd-look" aria-expanded="true"><span class="pd-look-art">…</span><span class="pd-look-label">Облик</span><span class="pd-look-value">Королевский</span></button>
  <div class="pd-look-picker">
    <button class="pd-look-opt" aria-label="Обычный">…</button>
    <button class="pd-look-opt on" aria-label="Королевский, надет">…</button>
    <button class="pd-look-opt shop" aria-label="Теневой, купить за 75 звёзд">…<span class="pd-stars small">75</span></button>
  </div>
  <button class="pd-look"><span class="pd-look-art">…</span><span class="pd-look-label">Эффект</span><span class="pd-look-value">Светлячки</span></button>
  <button class="pd-look"><span class="pd-look-art">…</span><span class="pd-look-label">Рамка</span><span class="pd-look-value">Золото</span></button>
</div>
```

| Класс | Что это |
| --- | --- |
| `.pd-tabs.compact` | вкладки с подписями 15px — четыре помещаются на 360 |
| `.pd-shop-grid`, `.pd-offer` + `.owned` / `.worn` / `.badge` / `.offseason`, `.pd-offer-art`, `-name`, `-meta`, `-cond`, `-lock`, `-badge` | карточка товара |
| `.pd-stars`, `.small` | цена в звёздах |
| `.pd-chip.season`, `.pd-chip.active` | сезон, активная подписка |
| `.pd-offer-hero`, `.pd-tiers` | окно товара |
| `.pd-patron-big`, `.pd-patron-mark`, `.sm`, `.pd-perks`, `.pd-perk`, `.pd-perk-ico`, `.pd-perk-frame`, `.pd-price-row` | подписка и звезда |
| `.pd-avatar.framed.frame-*` | рамки портрета |
| `.pd-subhead`, `.pd-looks`, `.pd-look`, `.pd-look-picker`, `.pd-look-opt` + `.on` / `.shop` | ряд «Облик» |
| `.keeper` | портрет лавочника из `shopkeeper.png` |

## Игровой экран

### HUD

```html
<header class="pd-hud">
  <div class="pd-hud-main">
    <div class="pd-avatar-wrap"><button class="pd-avatar" aria-label="Герой"><i style="--av:0"></i></button><span class="pd-hero-lvl">3</span></div>
    <div class="pd-hud-bars">
      <div class="pd-bar" style="--v:.75"><span class="pd-bar-text">18/24</span></div>   <!-- .low при ≤ 25%, .poisoned -->
      <div class="pd-bars-small">
        <div class="pd-bar-pair"><i class="pd-icon" style="background-image:var(--spr-star)"></i><div class="pd-bar thin xp" style="--v:.4"></div></div>
        <div class="pd-bar-pair"><i class="pd-icon" style="background-image:var(--spr-food)"></i><div class="pd-bar thin food" style="--v:.7"></div></div>  <!-- .hungry / .starving -->
      </div>
    </div>
    <div class="pd-hud-side">
      <span class="pd-stat"><i class="pd-icon" style="background-image:var(--spr-depth)"></i>1</span>
      <span class="pd-stat"><i class="pd-icon" style="width:14px;height:18px;background-image:var(--spr-key)"></i>1</span>
    </div>
    <button class="pd-menu" aria-label="Меню"></button>
  </div>
  <div class="pd-buffs"><button class="pd-buff" aria-label="Отравление"><i data-b="3"></i></button></div>
  <div class="pd-mates">   <!-- только в кооперативе -->
    <button class="pd-mate"><i class="pd-mate-face" style="--av:1"></i><span class="pd-mate-name">Лиса</span><div class="pd-bar" style="--v:.8"></div><span class="pd-mate-depth">1</span></button>
    <!-- .away — на другой глубине, .dead — погиб -->
  </div>
</header>
```

`--av` у `.pd-mate-face` и `.pd-rank-face` — номер героя в полосе `heroes` (0 — воин, 1 — маг, 2 — разбойник, 3 — охотница). У `.pd-avatar` и `.pd-class-face` — номер в `avatars.png`.

### Лог

```html
<button class="pd-log" aria-label="История сообщений">
  <div class="pd-log-line" data-age="2">…</div>
  <div class="pd-log-line good" data-age="1">…</div>
  <div class="pd-log-line bad" data-age="0">…<span class="pd-n">×2</span></div>
  <span class="pd-log-more">История</span>
</button>
```

`PD.log(box, text, type)` сам держит 4 строки, проставляет `data-age`, склеивает повторы в «×N» и гасит строку через 8 секунд. Окно истории — `.pd-window` с `.pd-scroll > .pd-history`, разделители глубин — `.pd-depth-mark`.

### Панель инструментов

```html
<nav class="pd-toolbar" aria-label="Действия">
  <button class="pd-tool" aria-label="Ждать"><i class="pd-icon" style="--w:12;--h:12;background-image:var(--spr-tool-wait)"></i></button>
  <button class="pd-tool" aria-label="Искать"><i class="pd-icon" style="--w:12;--h:12;background-image:var(--spr-tool-search)"></i></button>
  <button class="pd-tool" aria-label="Осмотреть"><i class="pd-icon" style="--w:8;--h:12;background-image:var(--spr-tool-info)"></i></button>
  <button class="pd-tool quick" aria-label="Быстрый слот"><i class="pd-item" data-i="31"></i><span class="pd-qty">8</span></button>
  <button class="pd-tool bag" aria-label="Рюкзак"><i class="pd-icon" style="--w:14;--h:15;background-image:var(--spr-tool-backpack)"></i></button>
</nav>
```

`PD.holdToRest(btn, onWait, onRest)` — короткое нажатие «Ждать» тратит ход, удержание 600 мс включает отдых (`.resting`). Состояния быстрого слота: `.empty` — пуст, `.targeting` — выбирается цель. `.bag.alert` — в рюкзаке новый предмет. Когда ходит товарищ, кнопки получают `disabled`.

### Toast

`<div id="toast" class="good"><i class="pd-item" data-i="61"></i>Зелье добавлено в быстрый слот</div>` или `PD.toast(el, html, type)`. Для нового значка — `class="badge"` с `<i class="pd-badge" data-i="…">` и `<b>` с названием.
