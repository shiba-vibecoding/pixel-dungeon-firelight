import { describe, expect, it } from 'vitest';
import { scrub } from '../src/report';

describe('the client report', () => {
  it('takes the query and hash out of anything it sends', () => {
    expect(scrub('oops @ https://a.b/c/?lang=ru#tgWebAppData=user%3D%7B%22id%22%3A1%7D:3:4')).toBe('oops @ https://a.b/c/:3:4'.replace(':3:4', ''));
    expect(scrub('plain message')).toBe('plain message');
  });
});
