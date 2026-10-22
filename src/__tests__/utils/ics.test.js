import { describe, it, expect } from 'vitest';
import { buildEventIcs, subscribeUrl } from '../../utils/ics';

const event = {
  id: 'abc@google.com',
  title: 'vs Mandeville FC, U12',
  timestamp: Date.UTC(2026, 10, 7, 15, 0) / 1000,
  location: 'City Park; Field 4',
};

describe('buildEventIcs', () => {
  const ics = buildEventIcs(event, { teamName: 'U12 Girls', now: new Date(Date.UTC(2026, 9, 22)) });

  it('wraps one event in a calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);
  });

  it('starts at the event time in UTC and runs ninety minutes', () => {
    expect(ics).toContain('DTSTART:20261107T150000Z');
    expect(ics).toContain('DTEND:20261107T163000Z');
  });

  it('names the team and escapes commas and semicolons', () => {
    expect(ics).toContain('SUMMARY:U12 Girls: vs Mandeville FC\\, U12');
    expect(ics).toContain('LOCATION:City Park\\; Field 4');
  });

  it('leaves out a location the feed did not know', () => {
    expect(buildEventIcs({ ...event, location: 'TBD' })).not.toContain('LOCATION');
  });
});

describe('subscribeUrl', () => {
  it('turns a web feed into a subscription link', () => {
    expect(subscribeUrl('https://calendar.google.com/x/basic.ics')).toBe('webcal://calendar.google.com/x/basic.ics');
  });

  it('declines anything that is not a web address', () => {
    expect(subscribeUrl('')).toBeNull();
    expect(subscribeUrl('webcal://already')).toBeNull();
  });
});
