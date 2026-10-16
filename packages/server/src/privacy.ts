/*
 * «Hide me from the boards» (an option in the settings, off by default): the player's name on every board is a plain «Hero» and nothing of
 * them can be told from it but their hero as they dressed him. What they wear stays; the name colour and the title, which say who one is,
 * go with the name. Kept in the profile (a setting, so a season's wipe keeps it) and asked at each run's end.
 */

export interface PrivateProfile {
  name: string;
  hidden?: boolean;
  /** What the player is called on the boards while hidden, in the language they asked in. */
  alias?: string;
}

/** The name a hidden player has on the boards. */
export const hiddenName = (ru?: boolean): string => (ru ? 'Герой' : 'Hero');

/** The name a profile shows on the boards: the real one, or the alias if the player is hidden. */
export function nameOnBoards(profile: PrivateProfile, name: string = profile.name): string {
  return profile.hidden ? (profile.alias ?? hiddenName(false)) : name;
}

/** What a hero wears on the boards: all of it, but a hidden player's name colour and title (they would say who it is). */
export function wornOnBoards<W extends { nc?: string; tt?: string }>(profile: PrivateProfile, worn: W | undefined): W | undefined {
  if (!worn || !profile.hidden) return worn;
  const { nc: _colour, tt: _title, ...rest } = worn;
  return Object.keys(rest).length > 0 ? (rest as unknown as W) : undefined;
}

/** Turns hiding on or off; true if the profile changed. */
export function setHidden(profile: PrivateProfile, hidden: boolean, ru?: boolean): boolean {
  if (hidden) {
    const alias = hiddenName(ru);
    if (profile.hidden && profile.alias === alias) return false;
    profile.hidden = true;
    profile.alias = alias;
    return true;
  }
  if (!profile.hidden) return false;
  delete profile.hidden;
  delete profile.alias;
  return true;
}
