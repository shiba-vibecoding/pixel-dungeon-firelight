import { describe, expect, it } from 'vitest';
import { guestId, validGuestSecret } from '../src/guest';
import { sameSecret } from '../src/secret';

describe('guest ids', () => {
  it('derives a public id from the secret, the same every time', async () => {
    const secret = 'b3f1c0de-1234-4abc-9def-0123456789ab';
    const id = await guestId(secret);
    expect(id).toMatch(/^guest-[0-9a-f]{16}$/);
    expect(await guestId(secret)).toBe(id);
    expect(await guestId(`${secret}-b`)).not.toBe(id);
  });

  it('cannot be turned back into a secret: the public id is not one that leads to itself', async () => {
    const id = (await guestId('a-secret-only-my-browser-has'))!;
    // Someone who saw the id and sends it as their secret gets a different hero.
    expect(await guestId(id)).not.toBe(id);
    expect(await guestId(id.slice('guest-'.length).padEnd(16, '0'))).not.toBe(id);
  });

  it('refuses secrets too short to be secret, or not URL-safe', async () => {
    expect(validGuestSecret('short')).toBe(false);
    expect(await guestId('')).toBeNull();
    expect(await guestId('x'.repeat(129))).toBeNull();
    expect(await guestId('has spaces in it, sixteen+')).toBeNull();
  });
});

describe('secret comparison', () => {
  it('matches only the very secret', async () => {
    expect(await sameSecret('Bearer k3y', 'Bearer k3y')).toBe(true);
    expect(await sameSecret('Bearer k3', 'Bearer k3y')).toBe(false);
    expect(await sameSecret('', 'Bearer k3y')).toBe(false);
    expect(await sameSecret(null, 'Bearer k3y')).toBe(false);
    // With no secret set, nothing matches, not even nothing.
    expect(await sameSecret('', '')).toBe(false);
    expect(await sameSecret(undefined, undefined)).toBe(false);
  });
});
