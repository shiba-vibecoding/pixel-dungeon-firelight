import type { QuestWords } from './quest-words';

/*
 * The quest givers in person, and the quest card (English). Each pair is [clean, foul]: the foul one is only said when the quip
 * setting is «foul-mouthed» (quips.ts). Every fact of the original is kept: what is wanted, where, and what is given. The numbers
 * come from the core ({n}, {have}). The swearing is aimed at monsters, at the situation and at the speaker's own sorry lot, never
 * at a people or a person.
 */
export const QUEST_EN: QuestWords = {
  lines: {
    // --- The sad ghost ---
    'ghost.intro.rose': [
      'Hello, traveller... Don\'t be afraid, I don\'t bite: nothing to bite with. Once I was like you, strong and sure of myself, in good boots. Now I\'m dead, and I can\'t leave this place until my dried rose comes back to me. Some monster dragged it off my body. A small thing, but my soul is restless without it... Find it for me, would you?',
      'Hey, traveller... Don\'t shit yourself, I don\'t bite: nothing to bite with. Once I was like you, strong, cocky, in good boots. Now I\'m dead as fuck, and I can\'t leave this place until my dried rose comes back to me. Some monster dragged it off my corpse. A small thing, but my soul feels like shit without it... Find it for me, would you?',
    ],
    'ghost.intro.rat': [
      'Hello, traveller... Once I was like you, hale and hearty. Now I\'m dead, and one grudge keeps me here: the fetid rat that took my life. Yes, a rat. Don\'t laugh: its intentions were most unclean. Slay it, and I can finally rest.',
      'Hello, traveller... Once I was like you, hale and hearty. Now I\'m dead, and one grudge keeps me here: the fetid rat that took my life. Yes, a fucking rat. Don\'t laugh: its intentions were foul as shit. Slay the little bastard, and I can finally rest.',
    ],
    'ghost.intro.curse': [
      'Hello, traveller... Once I was like you, strong and confident... Now I\'m dead and bound by a horrid curse: that is why I\'m stuck here. Please... help me. Destroy the curse. A fair warning, though: it won\'t be pleased.',
      'Hello, traveller... Once I was like you, strong and confident... Now I\'m dead and bound by a horrid curse: that is why I\'m stuck in this shithole. Please... help me. Destroy the damn thing. A fair warning, though: it won\'t be fucking pleased.',
    ],
    'ghost.remind.rose': [
      'How\'s my rose coming along? I\'d go myself, but, you know: walls, drafts, being dead... Please, find it.',
      'How\'s my rose coming along? I\'d go myself, but, you know: walls, drafts, being dead, what the fuck can I do... Please, find it.',
    ],
    'ghost.remind.rat': [
      'It\'s still alive, that rat... Do something, would you? There hasn\'t been any entertainment here for ages.',
      'That rat is still alive, the little shit... Do something, would you? There hasn\'t been any entertainment here for ages.',
    ],
    'ghost.remind.curse': [
      'The curse is still with me... Tell me when you\'re ready. I\'m in no hurry: nowhere to be.',
      'The curse is still with me, damn it... Tell me when you\'re ready. I\'m in no hurry: nowhere to be.',
    ],
    'ghost.reward.rose': [
      'The rose! My rose! Give it here! I\'d weep if I had anything to weep with... Thank you, traveller. Take one of my things: I have no use for them now, and you might.',
      'The rose! My fucking rose! Give it here! I\'d weep if I had anything to weep with... Thank you, traveller. Take one of my things: I have no fucking use for them now, and you might.',
    ],
    'ghost.reward.rat': [
      'It\'s dead! At last... Now I can find peace. Take one of these things before I melt with happiness.',
      'It\'s dead! At last, the little shit... Now I can find peace. Take one of these things before I melt with happiness.',
    ],
    'ghost.reward.curse': [
      'Thank you, {cls}! The curse is broken, and I can finally rest... Take one of these things: they may be of use.',
      'Thank you, {cls}! The curse is fucked, and I can finally rest... Take one of these things: they may be of use.',
    ],
    'ghost.farewell': [
      'Farewell, adventurer! Look after your boots: good boots are nearly all you need in life. And in death, too.',
      'Farewell, adventurer! Look after your ass and your boots, in that order. I have to go: they say there\'s a light at the end.',
    ],
    'ghost.ask': [
      'What do I have? Alas, I\'m dead, I only have my old things. Do what I ask, and choose one of two: a weapon or an armour.',
      'What do I have? I\'m dead, for fuck\'s sake, I only have my old gear. Do what I ask, and choose one of two: a weapon or an armour.',
    ],
    'ghost.where.rose': [
      'How would I know where it is? Some monster dragged it off, and I\'m tied to this spot. Try the creatures that live here.',
      'How would I know where it is, I\'m tied to this spot like a dog. Some monster dragged it off. Try the creatures that live here.',
    ],
    'ghost.where.rat': [
      'How would I know? I\'m tied to this place... But a stench like that is hard to miss: it\'s somewhere down here in the sewers.',
      'How would I know? I\'m tied to this place... But a stench like that is hard to miss: it\'s somewhere down here in this cesspit.',
    ],

    // --- The old wandmaker ---
    'wand.intro.dust': [
      'Oh, what a pleasant surprise, to meet a decent person in such a place! I came here for a rare ingredient: corpse dust. It is gathered from skeletal remains, and there is no shortage of bones here. I am a perfectly capable magic user, I fear no local monsters, but I lose my way within five steps. So embarrassing! Perhaps you could help? I would be happy to pay for your service with one of my best wands.',
      'Oh, a decent person, in a shithole like this! I came here for a rare ingredient: corpse dust. It is gathered from skeletal remains, and there are bones here by the fucking ton. I am a damn capable magic user, I fear no local monsters, but I lose my way within five steps, it is utter bullshit and I am ashamed. Perhaps you could help? I would be happy to pay for your service with one of my best wands.',
    ],
    'wand.intro.berry': [
      'Oh, what a pleasant surprise, to meet a decent person in such a place! I came here for a rare ingredient: a rotberry seed. The shrub grows somewhere on this level. I am a perfectly capable magic user, I fear no local monsters, but I lose my way within five steps. So embarrassing! Perhaps you could help? I would be happy to pay for your service with one of my best wands.',
      'Oh, a decent person, in a shithole like this! I came here for a rare ingredient: a rotberry seed. The shrub grows somewhere on this level. I am a damn capable magic user, I fear no local monsters, but I lose my way within five steps, it is utter bullshit and I am ashamed. Perhaps you could help? I would be happy to pay for your service with one of my best wands.',
    ],
    'wand.intro.fish': [
      'Oh, what a pleasant surprise, to meet a decent person in such a place! I came here for a rare ingredient: a phantom fish. You can catch it with your bare hands, but it is nearly invisible in the water. I am a perfectly capable magic user, I fear no local monsters, but I lose my way within five steps. So embarrassing! Perhaps you could help? I would be happy to pay for your service with one of my best wands.',
      'Oh, a decent person, in a shithole like this! I came here for a rare ingredient: a phantom fish. You can catch it with your bare hands, but you can\'t see the fucker in the water. I am a damn capable magic user, I fear no local monsters, but I lose my way within five steps, it is utter bullshit and I am ashamed. Perhaps you could help? I would be happy to pay for your service with one of my best wands.',
    ],
    'wand.remind.dust': [
      'Any luck with the corpse dust? Piles of bones are the most obvious place to look. I\'d go myself, but... the way.',
      'Any luck with the corpse dust? Piles of bones are the most obvious place to look. I\'d go myself, but this shitty way...',
    ],
    'wand.remind.berry': [
      'Any luck with the rotberry seed? No? Don\'t worry, I\'m in no hurry. The shrub is somewhere on this level.',
      'Any luck with the rotberry seed? No? Don\'t sweat it, I\'m in no fucking hurry. The shrub is somewhere on this level.',
    ],
    'wand.remind.fish': [
      'Any luck with the phantom fish? Try the local pools: it is there, you just can\'t see it.',
      'Any luck with the phantom fish? Poke around the local pools: it is there, you just can\'t see the fucker.',
    ],
    'wand.reward': [
      'Oh, you have succeeded! I do hope it has not troubled you too much. As I promised, choose one of my high quality wands.',
      'Oh, you have succeeded! Pardon my language, but you are a bloody fucking marvel. I do hope it has not worn you out. As I promised, choose one of my high quality wands.',
    ],
    'wand.farewell': [
      'Good luck in your quest! And I shall go... somewhere. If I find the way.',
      'Good luck in your quest! And I shall go... somewhere the fuck away from here. If I find the way.',
    ],
    'wand.ask': [
      'One of my best wands, my dear friend! When you bring it, the choice will be yours.',
      'One of my best wands, my dear friend, not some piece of shit! When you bring it, the choice will be yours.',
    ],
    'wand.where.dust': [
      'Bones, my dear friend, bones! Look for piles of bones: the dust lies in one of them.',
      'Bones, my dear friend, bones! Look for piles of bones: the dust lies in one of those bastards.',
    ],
    'wand.where.berry': [
      'The shrub grows somewhere on this level. The seed is tiny, you understand: look carefully.',
      'The shrub grows somewhere on this level. The seed is tiny as shit, you understand: look carefully.',
    ],
    'wand.where.fish': [
      'It swims in the local water, but it is nearly invisible. Go right up to the water and search: you will not notice it otherwise.',
      'It swims in the local water, but you can\'t see the fucker. Go right up to the water and search: you will not notice it otherwise.',
    ],

    // --- The troll blacksmith (he drops his h's and his th's) ---
    'smith.intro.gold': [
      'Hey human! Wanna be useful, eh? Take dis pickaxe and mine me some dark gold ore, {n} pieces should be enough. What do you mean, how am I gonna pay? You greedy... Ok, ok, I don\'t have money, but I can do some smithin\' for you. Consider yourself lucky, I\'m the only blacksmith around.',
      'Hey, runt! Wanna be useful, eh? Take dis pickaxe and mine me some dark gold ore, {n} fuckin\' pieces should be enough. What do you mean, how am I gonna pay? You greedy... Ok, ok, I don\'t have any damn money, but I can do some smithin\' for you. Consider yourself lucky, I\'m the only blacksmith around, dammit.',
    ],
    'smith.intro.blood': [
      'Hey human! Wanna be useful, eh? Take dis pickaxe and kill a bat wit\' it, I need its blood on the head. What do you mean, how am I gonna pay? You greedy... Ok, ok, I don\'t have money, but I can do some smithin\' for you. Consider yourself lucky, I\'m the only blacksmith around.',
      'Hey, runt! Wanna be useful, eh? Take dis pickaxe and kill a bat wit\' it, I need its fuckin\' blood on the head. What do you mean, how am I gonna pay? You greedy... Ok, ok, I don\'t have any damn money, but I can do some smithin\' for you. Consider yourself lucky, I\'m the only blacksmith around, dammit.',
    ],
    'smith.noPickaxe': [
      'Are you kiddin\' me?! Where is my pickaxe? I didn\'t lend it for fun!',
      'Are you fuckin\' kiddin\' me?! Where is my pickaxe? I didn\'t lend it for fun, shithead!',
    ],
    'smith.noGold': [
      'Dark gold ore. {n} pieces. You got {have} so far. Seriously, is it dat hard? (Mine the dark veins in the rock: tap one next to you.)',
      'Dark gold ore. {n} fuckin\' pieces. You got {have} so far. Seriously, is it dat fuckin\' hard? (Mine the dark veins in the rock: tap one next to you.)',
    ],
    'smith.noBlood': [
      'I said I need bat blood on the pickaxe. Chop chop!',
      'I said I need bat blood on the pickaxe, damn it. Chop fuckin\' chop!',
    ],
    'smith.completed': [
      'Oh, you have returned... Better late dan never. Gimme two items of the same kind and I\'ll make one, better than both.',
      'Oh, you have returned... Better late dan never, fuck. Gimme two items of the same kind and I\'ll make one, better than both.',
    ],
    'smith.reforge': [
      'Two items of the same kind, and I\'ll make one, better than both. The other one goes into the fire.',
      'Two items of the same kind, and I\'ll make one, better than both. The other piece of crap goes into the fuckin\' fire.',
    ],
    'smith.busy': [
      'I\'m busy. Get lost!',
      'I\'m fuckin\' busy. Get lost!',
    ],
    'smith.ask': [
      'What d\'ya mean, wit\' what? Reforgin\'! Two items of the same kind into one, better than both. The other one goes into the fire. Don\'t like it? Find another blacksmith. Ha! Dere ain\'t one.',
      'What d\'ya mean, wit\' what? Reforgin\', dammit! Two items of the same kind into one, better than both. The other one goes into the fire. Don\'t like it? Find another blacksmith. Ha! Dere ain\'t one.',
    ],
    'smith.where.gold': [
      'Dem dark veins in da rock, see? Walk right up and tap a vein: da pickaxe does da rest.',
      'Dem dark veins in da rock, blind or what? Walk right up and tap a vein: da pickaxe does da fuckin\' rest.',
    ],
    'smith.where.blood': [
      'Bats live in dese caves. But keep da pickaxe in your hand when ya finish it off: no blood sticks otherwise.',
      'Bats live in dese caves, you\'ll see. But keep da pickaxe in your hand when ya finish it off, dammit: no blood sticks otherwise.',
    ],

    // --- The ambitious imp ---
    'imp.intro.golem': [
      'Are you an adventurer? I love adventurers! You can always rely on them if something needs to be killed. Am I right? For a bounty, of course ;) This time it is golems that need to be killed. You see, I am going to start a little business here, but these stupid golems are bad for business! It is very hard to negotiate with wandering lumps of granite, curse them! So please, kill... let us say {n} of them, bring me their tokens, and a reward is yours.',
      'Are you an adventurer? I love adventurers! You can always rely on them if something needs to be killed. Am I right? For a bounty, of course ;) This time it is golems that need to be killed. You see, I am going to start a little business here, but these stupid rock bastards are bad for business! You can\'t fucking negotiate with wandering lumps of granite. So please, kill... let us say {n} of them, bring me their tokens, and a reward is yours.',
    ],
    'imp.intro.monk': [
      'Are you an adventurer? I love adventurers! You can always rely on them if something needs to be killed. Am I right? For a bounty, of course ;) This time it is monks that need to be killed. You see, I am going to start a little business here, but these lunatics do not buy anything themselves and scare away other customers. So please, kill... let us say {n} of them, bring me their tokens, and a reward is yours.',
      'Are you an adventurer? I love adventurers! You can always rely on them if something needs to be killed. Am I right? For a bounty, of course ;) This time it is monks that need to be killed. You see, I am going to start a little business here, but these rabid kung-fu nutjobs do not buy a fucking thing and scare away other customers. So please, kill... let us say {n} of them, bring me their tokens, and a reward is yours.',
    ],
    'imp.remind.golem': [
      'How is your golem safari going? You need {n} tokens. You have {have} so far.',
      'How is your safari on those rock bastards going? You need {n} fucking tokens. You have {have} so far.',
    ],
    'imp.remind.monk': [
      'Oh, you are still alive! I knew that your kung-fu is stronger ;) Just do not forget to grab the monks\' tokens: you need {n}. You have {have} so far.',
      'Oh, you are still alive, holy shit! I knew that your kung-fu is stronger ;) Just do not forget to grab the monks\' tokens: you need {n}. You have {have} so far.',
    ],
    'imp.reward': [
      'Oh yes! You are my hero! Regarding your reward, I do not have cash with me right now, but I have something better for you. This is my family heirloom ring: my granddad took it off a dead paladin\'s finger.',
      'Oh yes! You are my fucking hero! Regarding your reward, I do not have cash with me right now, but I have something better for you. This is my family heirloom ring: my granddad took it off a dead paladin\'s finger.',
    ],
    'imp.farewell': [
      'See you, {cls}! Drop by when my business opens: no discounts, but the smile is free.',
      'See you, {cls}! Drop by when my business opens: no fucking discounts, but the smile is free.',
    ],
    'imp.ask': [
      'A ring! A family heirloom, not some trinket. As for how my granddad got it, better not ask.',
      'A ring, damn it! A family heirloom, not some piece of crap. As for how my granddad got it, better not ask.',
    ],
    'imp.where.golem': [
      'You can\'t mistake a golem: big, stony and not much of a talker. Every one you slay drops a token.',
      'You can\'t mistake a golem: big, stony and not much of a talker, walking piece of shit. Every one you slay drops a token.',
    ],
    'imp.where.monk': [
      'Monks wander these halls and fight with their bare hands. Every one you slay drops a token.',
      'Monks wander these halls and beat everyone senseless with their bare hands, the nutjobs. Every one you slay drops a token.',
    ],
  },
  replies: {
    ghost: {
      ok: ['Alright', 'Alright, don\'t whine'],
      later: ['Later', 'Later, I\'m busy'],
      ask: ['What do I get for it?', 'What the fuck do I get?'],
      where: ['Where do I look?', 'Where do I look for that crap?'],
      bye: ['Farewell', 'Take care'],
    },
    wandmaker: {
      ok: ['Very well', 'Fine, I\'ll help'],
      later: ['Later', 'Later, I\'m busy'],
      ask: ['What will I get?', 'What do I get out of this?'],
      where: ['Where do I look?', 'Where do I look for that crap?'],
      bye: ['Good luck', 'Take care'],
    },
    smith: {
      ok: ['Ok, ok', 'Ok, don\'t growl'],
      later: ['Later', 'Later, hammerhead'],
      ask: ['What do I get for it?', 'And how are you paying, exactly?'],
      where: ['Where do I dig?', 'Where the hell do I dig?'],
      bye: ['I\'m off', 'Go hit something'],
    },
    imp: {
      ok: ['Deal', 'Deal, damn it'],
      later: ['Later', 'Later, I\'m busy'],
      ask: ['What do I get for it?', 'What\'s in it for me, huh?'],
      where: ['Where do I find them?', 'Where do I find the bastards?'],
      bye: ['See you', 'See you, dealer'],
    },
  },
  role: {
    ghost: 'former adventurer',
    wandmaker: 'lost again',
    smith: 'the only blacksmith around',
    imp: 'future entrepreneur',
  },
  card: {
    title: 'Quests',
    depth: (n) => `Depth ${n}`,
    goal: {
      rose: 'Return the ghost\'s dried rose',
      skull: 'Slay the fetid rat that killed the ghost',
      curse: 'Destroy the curse that binds the ghost',
      dust: 'Bring corpse dust',
      berry: 'Bring a rotberry seed',
      fish: 'Catch a phantom fish',
      ore: 'Mine dark gold ore',
      blood: 'Kill a vampire bat with the blacksmith\'s pickaxe',
      monk: 'Bring the tokens of slain monks',
      golem: 'Bring the tokens of slain golems',
    },
    label: {
      rose: 'Rose', skull: 'Rat skull', curse: 'Curse', dust: 'Dust', berry: 'Seed', fish: 'Fish',
      ore: 'Ore', blood: 'Blood on the pickaxe', monk: 'Tokens', golem: 'Tokens',
    },
    state: {
      rose: ['not found', 'found'],
      skull: ['no', 'yes'],
      curse: ['intact', 'broken'],
      dust: ['no', 'yes'],
      berry: ['no', 'yes'],
      fish: ['no', 'caught'],
      blood: ['no', 'yes'],
    },
    reward: {
      gear: 'Your pick: a weapon or an armour',
      wand: 'One of the wandmaker\'s best wands, your pick',
      reforge: 'Reforging: two items of one kind become one, better than both',
      ring: 'A ring, the imp\'s family heirloom',
    },
    rewardTitle: 'Reward',
    spent: ['reforging awaits', 'reforging used'],
    backTo: {
      ghost: 'Goal met: return to the ghost',
      wandmaker: 'Goal met: return to the wandmaker',
      smith: 'Goal met: return to the blacksmith',
      imp: 'Goal met: return to the imp',
    },
    chipBack: { ghost: 'To the ghost', wandmaker: 'To the wandmaker', smith: 'To the smith', imp: 'To the imp' },
    done: 'Done',
    noPickaxe: 'The pickaxe is not with you: the blacksmith wants it back',
    progress: (label, have, need) => `${label}: ${have} / ${need}`,
    flag: (label, state) => `${label}: ${state}`,
  },
  toast: {
    count: (label, have, need) => `${label}: ${have} / ${need}`,
    found: {
      rose: 'Rose found: take it to the ghost',
      skull: 'You have the skull: take it to the ghost',
      dust: 'You have the corpse dust: take it to the wandmaker',
      berry: 'You have the seed: take it to the wandmaker',
      fish: 'Fish caught: take it to the wandmaker',
    },
  },
  talk: {
    skip: 'tap the text to read on',
    done: 'Quest complete',
    rewardIs: 'Reward',
  },
};
