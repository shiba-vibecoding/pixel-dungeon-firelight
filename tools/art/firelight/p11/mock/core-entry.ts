// The mock screens of part 11 compute every figure with the game's own code: the core's rules and the client's texts.
export * from '@pd/core';
export * from '../../../../../packages/client/src/growth';
export { itemName, itemInfo, chargesOf, strengthOf, spriteOffset, plainName } from '../../../../../packages/client/src/itemtext';
export { t } from '../../../../../packages/client/src/i18n';
export { mobDescription } from '../../../../../packages/client/src/examine';
export { familiarity } from '../../../../../packages/client/src/familiar';
export { hungerReport } from '../../../../../packages/client/src/hungerinfo';
export { brewOdds } from '../../../../../packages/client/src/brewodds';
