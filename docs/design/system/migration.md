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

### Кнопки карты

```html
<div class="pd-mapctl">
  <button class="pd-mapbtn hero" aria-label="К герою"></button>   <!-- только когда карту сдвинули -->
  <button class="pd-mapbtn in" aria-label="Приблизить"></button>
  <button class="pd-mapbtn out" aria-label="Отдалить" disabled></button> <!-- на пределе масштаба -->
  <button class="pd-mapbtn all" aria-label="Вся карта"></button>
</div>
```

Блок кладётся внутрь игрового экрана рядом с `.pd-log`. Отступ снизу считается от `--tool-h` и `--log-h`. Если лог в вашей вёрстке выше 120px, задайте `--log-h`. Значки берутся из `--spr-map-in/out/all/hero` в `bundle.css` (это `ui-map.png`, строка `map-buttons`). `.pressed` — то же, что `:active`, для нажатия с клавиатуры.

### Тосты находок

```html
<div class="pd-finds"></div>
```

```js
PD.find(box, 'gold', '<i class="pd-item" data-i="14"></i><span>Золото</span>');
PD.find(box, 'potion-heal', '<i class="pd-item" data-i="57"></i><span>Зелье исцеления</span>');
PD.find(box, 'ring-' + id, '<i class="pd-item" data-i="72"></i><span>Кольцо ясности</span>', { type: 'good' });
```

Ключ склеивает повторы: если та же вещь пришла снова, пока тост виден, он показывает «×N» и не уходит. Параметры: `ttl` (2400 мс), `max` (3), `type: 'good'` — для опознанной или редкой вещи. Полное название и количество по-прежнему пишутся в лог.

### Новые классы — живой мир

| Класс | Что это |
| --- | --- |
| `.pd-mapctl` | столбик кнопок карты справа над логом |
| `.pd-mapbtn.in` / `.out` / `.all` / `.hero` | кнопка 44×44 со значком 12×12 ×2; `.pressed`, `:disabled` |
| `.pd-finds` | стопка тостов находок справа под HUD |
| `.pd-find`, `.pd-find.good`, `[data-age]`, `.gone` | тост «+ иконка + название», `<b>` — счётчик «×N» |


### Кнопка настроек на титуле

```html
<div class="pd-corner"><button class="pd-iconbtn prefs" aria-label="Настройки"></button></div>
```

Блок кладётся внутрь `.pd-title-screen`, сразу перед `.pd-logo`. Кнопка «Испытания» встаёт в ряд к «Новой игре»:

```html
<div class="pd-row">
  <button class="pd-button">Новая игра</button>
  <button class="pd-button"><i class="pd-icon" style="width:24px;height:24px;background-image:var(--spr-challenge-on)"></i>Испытания<b class="pd-ch-n">2</b></button>
</div>
```

Если не включено ни одного испытания — `--spr-challenge-off` и без `.pd-ch-n`. До первой победы кнопка тоже есть: она открывает окно с замком.

### Настройки

```html
<section class="pd-window settings" role="dialog" aria-label="Настройки">
  <div class="pd-window-head"><div class="pd-titles"><h2 class="pd-heading">Настройки</h2></div><button class="pd-close" aria-label="Закрыть"></button></div>
  <div class="pd-scroll pd-settings">
    <div class="pd-col">
      <section class="pd-set-group"><h3 class="pd-set-head">Звук</h3>
        <div class="pd-set-row">
          <span class="pd-set-label"><span class="pd-info">Музыка</span><span class="pd-set-value">60%</span></span>
          <div class="pd-steps" role="slider" aria-label="Музыка" aria-valuemin="0" aria-valuemax="100" aria-valuenow="60">
            <button class="pd-step on" aria-label="Музыка 20%"></button> … пять кнопок
          </div>
        </div>
        … «Звуки» так же
        <button class="pd-switch" role="switch" aria-checked="true"><span class="pd-set-label"><span class="pd-info">Вибрация</span><span class="pd-set-value">При ударах и находках</span></span><span class="pd-switch-box"></span></button>
      </section>
      <section class="pd-set-group"><h3 class="pd-set-head">Игра</h3>
        <div class="pd-set-row stack"><span class="pd-info">Эффекты</span>
          <div class="pd-seg" role="radiogroup"><button class="pd-seg-opt" role="radio" data-v="auto" aria-checked="true">Авто</button><button class="pd-seg-opt" role="radio" data-v="full" aria-checked="false">Полные</button><button class="pd-seg-opt" role="radio" data-v="light" aria-checked="false">Лёгкие</button></div>
          <p class="pd-note">Полные, пока телефон успевает.</p>
        </div>
        <button class="pd-switch" role="switch" aria-checked="false"><span class="pd-set-label"><span class="pd-info">Во весь экран</span></span><span class="pd-switch-box"></span></button>
        <div class="pd-set-row"><span class="pd-info">Язык</span><div class="pd-seg inline" role="radiogroup"><button class="pd-seg-opt" data-v="ru" aria-checked="true">Русский</button><button class="pd-seg-opt" data-v="en" aria-checked="false">English</button></div></div>
      </section>
    </div>
    <div class="pd-col">
      <section class="pd-set-group"><h3 class="pd-set-head">Ещё</h3>
        <button class="pd-linkrow"><span>Об игре</span></button>
        <button class="pd-linkrow ext"><span>Конфиденциальность</span></button>
        <button class="pd-linkrow ext"><span>Условия</span></button>
      </section>
      <section class="pd-set-group danger"><button class="pd-button danger">Сбросить данные</button></section>
    </div>
  </div>
</section>
```

```js
PD.steps(musicRow, () => audio.musicVolume, (v) => audio.setMusicVolume(v));   // вернёт paint() для обновления извне
PD.seg(fxSeg, quality.mode, (v) => quality.set(v));                            // 'auto' | 'full' | 'light'
PD.seg(langSeg, lang, (v) => setLanguage(v));
```

Что поменять в `screens.ts`:

- `volumeRow` с `.pd-volume`/`.pd-volume-step` (шаги 12×20 px) замените на `.pd-steps`/`.pd-step` — у каждого шага цель 44×44.
- Выключатель «Звук» больше не нужен: ноль громкости — это касание единственной горящей первой ступени.
- Переключатель «Эффекты» вкл/выкл замените на `.pd-seg` с тремя вариантами из `quality.ts`.
- `.pd-col` на телефоне — `display: contents`, колонки появляются только на широком экране.

Язык по умолчанию берётся из Telegram (как сейчас в `i18n.ts`), выбор в настройках его перекрывает. Пояснение под эффектами меняется вместе с выбором: «Полные, пока телефон успевает» / «Частицы, свет, виньетка, тряска» / «Меньше частиц, без света и виньетки».

### Сброс данных

```html
<section class="pd-window narrow" role="alertdialog" aria-labelledby="rq">
  <h2 class="pd-heading center" id="rq">Сбросить данные?</h2>
  <p class="pd-info center">С этого устройства сотрутся сохранённый забег, герои, значки, рекорды и настройки. Вернуть их нельзя.</p>
  <p class="pd-note center">Покупки Пиксель-Марта и подписка хранятся на сервере и останутся.</p>
  <div class="pd-actions"><button class="pd-button danger">Стереть всё</button><button class="pd-button quiet">Отмена</button></div>
</section>
```

Фокус при открытии — на «Отмене».

### Об игре

```html
<section class="pd-window" role="dialog" aria-label="Об игре">
  …шапка с крестиком…
  <div class="pd-scroll pd-about">
    <div class="pd-about-logo"><img src="assets/banner-title.png" alt="Pixel Dungeon"><span class="pd-logo-sub">кооперативное издание</span><span class="pd-set-value">по Pixel Dungeon 1.9.2a</span><span class="pd-build">Сборка b3882db · 12.10.2026</span></div>
    <dl class="pd-credits">
      <div class="pd-credit"><dt>Оригинальная игра, графика и звуки</dt><dd>Watabou<small>Олег Доля</small></dd></div>
      <div class="pd-credit"><dt>Музыка оригинала</dt><dd>Cube_Code</dd></div>
      <div class="pd-credit"><dt>Шрифт Galmuri</dt><dd>Minseo Lee<small>SIL OFL 1.1</small></dd></div>
      <div class="pd-credit"><dt>Порт для Telegram, кооператив, музыка регионов</dt><dd>…</dd></div>
    </dl>
    <div><a class="pd-linkrow ext" href="https://github.com/shiba-vibecoding/pixel-dungeon-telegram"><span>Исходный код (GPL-3.0)<small>github.com/shiba-vibecoding/pixel-dungeon-telegram</small></span></a>
         <a class="pd-linkrow ext" href="http://pixeldungeon.watabou.ru"><span>Сайт оригинала<small>pixeldungeon.watabou.ru</small></span></a></div>
    <p class="pd-legal">Неофициальный порт. Pixel Dungeon © Watabou, распространяется по GPL-3.0; этот порт — тоже.</p>
  </div>
</section>
```

Строку сборки задайте при сборке, например `define: { __BUILD__: … }` в Vite с хешем коммита и датой. Ссылки открывайте через `Telegram.WebApp.openLink`. Имя в строке «Порт» впишите своё.

### Испытания

```html
<div class="pd-challenges">            <!-- .locked до первой победы, тогда сверху <p class="pd-lockplate"><span>Откроются после <b>первой победы</b> …</span></p> -->
  <button class="pd-challenge" role="switch" aria-checked="true">
    <i class="pd-ch-icon" style="--c:0"></i>
    <span class="pd-ch-text"><span class="pd-ch-name">На диете</span><span class="pd-ch-desc">Еда не встречается — на её месте золото.</span></span>
    <span class="pd-switch-box"></span>
  </button>
  …
</div>
```

`--c` — номер в `challenges.png`: 0 NO_FOOD, 1 NO_ARMOR, 2 NO_HEALING, 3 NO_HERBALISM, 4 SWARM_INTELLIGENCE, 5 DARKNESS, 6 NO_SCROLLS (маски 1, 2, 4, …, 64, как в оригинале). В закрытом списке поставьте кнопкам `aria-disabled="true"`, переключатель сам заменится замком. Число включённых пишется в подзаголовке окна: «Включено: 2 из 7».

### Журнал и каталог

```html
<section class="pd-window wide" role="dialog" aria-label="Журнал">
  …шапка…
  <div class="pd-tabs" role="tablist"><button class="pd-tab" role="tab" aria-selected="true">Отметки</button><button class="pd-tab" role="tab" aria-selected="false">Каталог</button></div>
  <div class="pd-scroll">
    <div class="pd-journal">
      <button class="pd-jrow here"><i class="pd-jicon" style="--j:5"></i><span class="pd-jname">Сад</span><span class="pd-jdepth">6</span></button>
      …
    </div>
  </div>
</section>
```

Номер `--j` в `journal.png` совпадает с порядком `Journal.Feature` оригинала:

| `--j` | Отметка |
| --- | --- |
| 0 | WELL_OF_HEALTH |
| 1 | WELL_OF_AWARENESS |
| 2 | WELL_OF_TRANSMUTATION |
| 3 | SACRIFICIAL_FIRE |
| 4 | ALCHEMY |
| 5 | GARDEN |
| 6 | STATUE |
| 7 | GHOST |
| 8 | WANDMAKER |
| 9 | TROLL |
| 10 | IMP |

`.here` — отметка текущей глубины (в оригинале она тоже подсвечена), `.done` — квест выполнен. Пустой журнал — `.pd-empty`.

Каталог:

```html
<div class="pd-tabs compact" role="tablist"><button class="pd-tab" role="tab" aria-selected="true">Зелья</button>…Свитки, Кольца, Палочки</div>
<div class="pd-cat-count">Известно 6 из 12</div>
<div class="pd-grid pd-catalog" role="listbox">
  <button class="pd-slot" role="option" aria-label="Зелье Исцеления"><i class="pd-item" data-i="57"></i></button>
  <button class="pd-slot unknown" role="option" aria-label="Зелье Холода"><i class="pd-item silhouette" data-i="56"></i></button>
</div>
<div class="pd-cat-detail unknown"><i class="pd-item silhouette" data-i="56"></i><span><b>Зелье Холода</b><small>Ещё не опознано</small></span></div>
```

Опознанная вещь показана своим спрайтом из этого забега. Неопознанная — силуэтом общей формы вида (зелье — 56, свиток — 40, кольцо — 72, палочка — 68), без цвета, ведь цвет ещё ничего не значит. Касание опознанной вещи открывает окно вещи; касание неопознанной только показывает имя. Журнал открывается из меню в игре, кнопкой «Журнал» рядом со «Справкой».

### Новые классы — меню и титул

| Класс | Что это |
| --- | --- |
| `.pd-corner`, `.pd-iconbtn.prefs` | угол титула и кнопка-иконка 44×44 без подложки |
| `.pd-window.settings`, `.pd-settings`, `.pd-col` | окно настроек; две колонки от 880 px |
| `.pd-set-group`, `.pd-set-head`, `.pd-set-row(.stack)`, `.pd-set-label`, `.pd-set-value` | группы и строки настроек |
| `.pd-steps`, `.pd-step.on` | громкость пятью шагами 44×44 |
| `.pd-seg(.inline)`, `.pd-seg-opt[aria-checked]` | выбор одного из вариантов |
| `.pd-linkrow(.ext)` | строка-ссылка на всю ширину |
| `.pd-about`, `.pd-about-logo`, `.pd-build`, `.pd-credits`, `.pd-credit`, `.pd-legal` | «Об игре» |
| `.pd-challenges(.locked)`, `.pd-challenge`, `.pd-ch-icon`, `.pd-lockplate`, `.pd-ch-n` | «Испытания» |
| `.pd-window.wide`, `.pd-journal`, `.pd-jrow(.here/.done)`, `.pd-jicon`, `.pd-empty` | «Журнал» |
| `.pd-catalog`, `.pd-slot.unknown`, `.pd-item.silhouette`, `.pd-cat-detail`, `.pd-cat-count` | «Каталог» |

### Рюкзак одним окном

```html
<section class="pd-window bag" role="dialog" aria-labelledby="bag-t">          <!-- .targeting в режиме выбора цели -->
  <header class="pd-bag-head"><h2 class="pd-heading" id="bag-t">Рюкзак</h2><span class="pd-stat gold">…132</span><span class="pd-stat"><span class="pd-stat-label">Сила</span>11</span><button class="pd-close" aria-label="Закрыть"></button></header>
  <div class="pd-tabs compact pd-bag-filter" role="tablist">
    <button class="pd-tab" role="tab" aria-selected="true">Всё</button><button class="pd-tab" role="tab" aria-selected="false">Зелья</button>
    <button class="pd-tab" role="tab" aria-selected="false">Свитки</button><button class="pd-tab" role="tab" aria-selected="false">Снаряжение</button>
  </div>
  <!-- режим цели вместо фильтров: <div class="pd-bag-target" role="status"><i class="pd-item" data-i="44"></i><span>Что улучшить?</span><button class="pd-button quiet">Отмена</button></div> -->
  <div class="pd-bag-body">
    <div class="pd-bag-side">
      <div class="pd-bag-equip">
        <button class="pd-slot equipped" aria-label="Короткий меч +1"><i class="pd-item" data-i="2"></i><span class="pd-lvl up">+1</span></button>
        <button class="pd-slot equipped">…броня</button><button class="pd-slot equipped">…кольцо</button>
        <div class="pd-slot placeholder"><i class="pd-item" data-i="7"></i></div>
        <button class="pd-slot keys" aria-label="Ключи: 2"><i class="pd-icon" style="background-image:var(--spr-keyring)"></i><span class="pd-qty">2</span></button>
      </div>
      <div class="pd-bag-grid">
        <button class="pd-slot selected"><i class="pd-item" data-i="57"></i><span class="pd-qty">2</span></button>
        <button class="pd-slot dim">…</button>      <!-- не подходит под фильтр или цель -->
        <div class="pd-slot empty"></div>            <!-- всего 20 -->
      </div>
    </div>
    <div class="pd-pick" aria-live="polite">
      <div class="pd-pick-head">
        <div class="pd-slot"><i class="pd-item" data-i="57"></i></div>
        <div class="pd-titles"><h3 class="pd-heading">Зелье Исцеления</h3><!-- <span class="pd-chip">надето</span> --></div>
        <button class="pd-button danger pd-pick-dropbtn">Выбросить</button>
      </div>
      <p class="pd-info">Полностью восстанавливает здоровье и смывает слизь.</p>
      <!-- <p class="pd-callout cursed">…</p> / <p class="pd-callout bad">…</p> -->
      <div class="pd-pick-actions">
        <button class="pd-button primary stacked">Выпить<span class="pd-btn-sub">или удерживайте ячейку</span></button>
        <button class="pd-button">Метнуть</button><button class="pd-button">Быстрый слот</button>
      </div>
    </div>
  </div>
</section>
```

- **Ничего не выбрано:**

  ```html
  <div class="pd-pick empty">
    <p class="pd-info">Коснитесь предмета…</p>
    <div class="pd-hold-hint"><span class="pd-hold-demo"><span class="pd-hold-label">Выпить</span><span class="pd-slot holding"><i class="pd-item" data-i="57"></i></span></span><span><b>Удерживайте ячейку</b> — быстрое действие…</span></div>
  </div>
  ```

- **Удержание:** через 400 мс ячейка получает `.holding`, над ней появляется `.pd-hold-label` с названием действия. Отпустили — действие выполняется и окно закрывается. Если увели палец с ячейки, действие отменяется. Короткое касание только выбирает.
- **Кнопки по числу действий.** Главное действие — `.primary` на всю ширину. Остальные идут по две в ряд; если их нечётное число, последняя получает `.wide`. У известного проклятого предмета `.primary` нет.
- **Фильтр** ставит `.dim` на ячейки других типов; сетка не перестраивается. «Снаряжение» — оружие, броня, кольца, палочки, метательное. Еда, бомбы, семена и фляга видны только во «Всём».
- **Цель:** окну ставится `.targeting`, полоса `.pd-bag-target` встаёт вместо фильтров, подходящим ячейкам — `.can`, остальным — `.dim` (они не нажимаются). «Отмена» по правилам оригинала спрашивает подтверждение: свиток всё равно сгорит.
- **Подписи кнопок.** «В быстрый слот» в ряду по две на 360 px не помещается, в рюкзаке пишите «Быстрый слот». Для английского — «Quickslot».

| Класс | Что это |
| --- | --- |
| `.pd-window.bag(.targeting)` | рюкзак одним окном |
| `.pd-bag-filter`, `.pd-bag-target` | фильтры; полоса выбора цели |
| `.pd-bag-body`, `.pd-bag-side`, `.pd-bag-equip`, `.pd-bag-grid` | раскладка; ряд надетого и сетка с ячейками `--cell` |
| `.pd-slot.dim`, `.pd-slot.can`, `.pd-slot.holding`, `.pd-slot.keys` | тусклая, подходящая для цели, удерживаемая, связка ключей |
| `.pd-pick(.empty)`, `.pd-pick-head`, `.pd-pick-dropbtn`, `.pd-pick-actions` (`.wide`) | панель выбранного предмета |
| `.pd-hold-hint`, `.pd-hold-demo`, `.pd-hold-label` | подсказка и подпись удержания |

## Игровой экран на мониторе

### Когда включать

```ts
const W = innerWidth, H = innerHeight;               // CSS px
const wide = W >= 900;                                // ниже — телефонная раскладка без изменений
const ui = Math.max(1, Math.min(4, Math.floor(H / 720), Math.floor(W / 1100)));
const baseZoom = Math.max(2, Math.min(Math.round(W / 448), Math.floor(H / 208)));   // масштаб тайла
root.classList.toggle('pd-wide', wide);
layer.style.setProperty('--ui', String(wide ? ui : 1));
```

Масштаб карты, который выбрал игрок, храните как сдвиг от `baseZoom` (+1, −1), а не как число. Так при смене монитора или окна карта останется «чуть ближе обычного», а не станет крошечной или огромной. В `main.ts` это уже сделано (коммит e4c3a28), здесь только формула для базы.

### Разметка

Весь интерфейс лежит в одном слое поверх canvas. Слой рисуется в размере `W/ui × H/ui` и увеличивается `transform: scale(ui)`. Координаты мыши для подсказки делите на `ui`.

```html
<canvas id="game"></canvas>
<div class="pd-ui pd-wide" style="--ui:1">
  <div class="pd-dcol">
    <header class="pd-dpanel pd-dhud">
      <div class="pd-hud-main">
        <div class="pd-avatar-wrap"><button class="pd-avatar" aria-label="Герой"><i style="--av:0"></i></button><span class="pd-hero-lvl">3</span></div>
        <div class="pd-hud-bars">
          <div class="pd-bar" style="--v:.75"><span class="pd-bar-text">18/24</span></div>
          <div class="pd-bars-small">…опыт и сытость, как в HUD телефона…</div>
        </div>
        <div class="pd-hud-side"><span class="pd-stat">…глубина</span><span class="pd-stat">…ключи</span></div>
      </div>
      <div class="pd-buffs">…</div>
    </header>
    <section class="pd-party" aria-label="Отряд">
      <button class="pd-pcard turn"><i class="pd-mate-face" style="--av:1"></i><span class="pd-mate-name">Лиса</span><span class="pd-mate-depth">3</span><div class="pd-bar" style="--v:.8"></div><span class="pd-pstate">ходит…</span></button>
      <button class="pd-pcard away">…<span class="pd-pstate">на глубине 4</span></button>
    </section>
    <p class="pd-status waiting"><span class="pd-status-text">Ждём: <span class="pd-ally">Ёжик</span></span></p>
  </div>
  <div class="pd-dcorner">
    <button class="pd-mapbtn journal" aria-label="Журнал" aria-keyshortcuts="J"></button>
    <button class="pd-mapbtn prefs" aria-label="Настройки"></button>
    <button class="pd-mapbtn menu" aria-label="Меню" aria-keyshortcuts="Escape"></button>
  </div>
  <div class="pd-finds"></div>
  <button class="pd-log" aria-label="История">…строки… <span class="pd-log-more">История</span></button>
  <nav class="pd-dbar left" aria-label="Действия">
    <button class="pd-tool" aria-label="Ждать" aria-keyshortcuts="Space"><span class="pd-key">Space</span><i class="pd-icon" style="--w:12;--h:12;background-image:var(--spr-tool-wait)"></i></button>
    <button class="pd-tool" aria-label="Искать" aria-keyshortcuts="F"><span class="pd-key">F</span>…</button>
    <button class="pd-tool" aria-label="Осмотреть" aria-keyshortcuts="X"><span class="pd-key">X</span>…</button>
  </nav>
  <nav class="pd-dbar right" aria-label="Вещи">
    <button class="pd-tool quick" aria-keyshortcuts="1"><span class="pd-key">1</span><i class="pd-item" data-i="57"></i><span class="pd-qty">2</span></button>
    <button class="pd-tool quick" aria-keyshortcuts="2"><span class="pd-key">2</span>…</button>
    <button class="pd-tool" aria-label="Рюкзак" aria-keyshortcuts="I"><span class="pd-key">I</span>…</button>
  </nav>
  <div class="pd-mapctl">…attack, resume, hero, in, out, all — как на телефоне…</div>
  <div class="pd-tooltip" style="left:…;top:…">
    <span class="pd-tooltip-name foe">Сумчатая крыса</span>
    <div class="pd-bar" style="--v:.75"></div>
    <span class="pd-tooltip-text">Агрессивная, но слабая. Здоровье 6 из 8.</span>
    <div class="pd-tooltip-keys"><span><b>ЛКМ</b> атаковать</span><span><b>ПКМ</b> подробнее</span></div>
  </div>
</div>
<div class="pd-hover foe" style="left:…;top:…;width:48px;height:48px"></div>  <!-- в координатах карты, под слоем -->
```

На мониторе те же узлы, что на телефоне: `.pd-log`, `.pd-mapctl`, `.pd-finds`, `.pd-toast`, `.pd-status`, `.pd-bar`, `.pd-buff`. Меняется только раскладка, по `.pd-ui`/`.pd-wide`. Если удобнее держать одну разметку для обоих экранов:

- `.pd-hud` превращается в `.pd-dcol > .pd-dhud`;
- `.pd-mates` — в `.pd-party` с `.pd-pcard`;
- `.pd-toolbar` делится на два `.pd-dbar`;
- кнопка меню уходит из HUD в `.pd-dcorner`.

### Подсказки при наведении

- **Когда показывать.** Через 300 мс неподвижного курсора над клеткой; над кнопкой — через 500 мс. Прячется при движении на другую клетку, при нажатии и при открытии окна. На сенсорном экране подсказок нет.
- **Что внутри:**
  - монстр — `.foe`, его имя, полоска здоровья, одна строка из описания, ЛКМ атаковать / ПКМ подробнее;
  - предмет на полу — `.item`, имя (неопознанное — как в рюкзаке), «Лежит на полу», ЛКМ подойти и взять;
  - товарищ — `.ally`, класс, уровень, здоровье, ЛКМ поменяться местами;
  - клетка — название места из `examine.ts`, одна строка, ЛКМ идти сюда / ПКМ осмотреть;
  - туман и неисследованное — подсказки нет.
- **ПКМ** по клетке — то же, что «Осмотреть» и касание: открывает окно, как на телефоне. Режим «Осмотреть» с кнопки панели остаётся.
- **Положение:** справа снизу от курсора; если курсор левее середины экрана — слева. У края подсказка переворачивается. Ширина не больше 300 px.
- **Кнопки:** `.pd-tooltip.small` или тот же `.pd-tooltip` с названием и `<b>клавиша</b>` в имени и одной строкой пояснения, например «Ждать **Space** — удерживайте или нажмите R: отдых».

### Клавиши

| Клавиша | Действие | В коде сейчас |
| --- | --- | --- |
| стрелки, WASD, Q/E/Z/C, цифровой блок | шаг и диагонали; удержание — идти дальше | есть |
| Space, Num5, «.» | ждать | есть |
| R | отдых | есть |
| F | искать | есть |
| I | рюкзак | есть |
| G | взять с пола | есть |
| T | быстрый слот 1 | есть |
| Enter | действие на своей клетке | есть |
| Esc | закрыть окно / отменить цель / меню | есть |
| + / − | масштаб | есть |
| **1, 2** | быстрые слоты 1 и 2 (T оставить как 1) | новое |
| **X** | осмотреть: режим, как кнопка | новое |
| **Tab** | атаковать врага с кнопки атаки | новое |
| **V** | идти дальше, если путь прервали | новое |
| **H** | к герою | новое |
| **M** | весь уровень | новое |
| **J** | журнал | новое |

В задании «S — искать», но S уже шаг вниз в WASD. Поэтому на кнопке подписано F — так в коде сейчас. Если WASD не нужен, верните S и поправьте подпись в одном месте.

### Новые классы — монитор

| Класс | Что это |
| --- | --- |
| `.pd-ui`, `.pd-wide`, `--ui` | слой интерфейса и его целый масштаб |
| `.pd-dcol`, `.pd-dpanel`, `.pd-dhud` | колонка сверху слева и панель героя |
| `.pd-party`, `.pd-pcard(.turn/.away/.dead)`, `.pd-pstate` | отряд |
| `.pd-dcorner`, `.pd-mapbtn.journal/.prefs/.menu` | угол справа сверху |
| `.pd-dbar.left/.right`, `.pd-key` | острова нижней панели и подпись клавиши |
| `.pd-mapbtn.attack`, `.pd-mapbtn.resume` | атака по врагу и «идти дальше» |
| `.pd-tooltip(.small)`, `.pd-tooltip-name(.foe/.item/.ally)`, `.pd-tooltip-text`, `.pd-tooltip-keys` | подсказка при наведении |
| `.pd-hover(.foe)`, `.pd-cursor`, `--spr-cursor` | уголки клетки под курсором и пиксельный курсор |
