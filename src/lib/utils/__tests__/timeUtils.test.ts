/**
 * timeUtils tests — session detection and market holiday calendar.
 *
 * Focus: regressions for Sunday-evening session handling and
 * year-wrap observed holidays (New Year's Day on a Saturday).
 */
import { describe, it, expect } from '@jest/globals';
import { detectSession, isMarketHoliday } from '../timeUtils';

describe('detectSession', () => {
  it('returns closed for Saturday any time of day', () => {
    const saturdayNoon = new Date('2025-01-18T12:00:00-05:00'); // Saturday noon ET
    expect(detectSession(saturdayNoon)).toBe('closed');
  });

  it('returns closed for Sunday morning', () => {
    const sundayMorning = new Date('2025-01-19T08:00:00-05:00'); // Sunday 08:00 ET
    expect(detectSession(sundayMorning)).toBe('closed');
  });

  it('returns closed for Sunday evening 18:00-20:00 ET (was incorrectly "after")', () => {
    const sundayEvening = new Date('2025-01-19T19:00:00-05:00'); // Sunday 19:00 ET
    expect(detectSession(sundayEvening)).toBe('closed');
  });

  it('returns closed for Sunday night after 20:00 ET', () => {
    const sundayNight = new Date('2025-01-19T21:00:00-05:00'); // Sunday 21:00 ET
    expect(detectSession(sundayNight)).toBe('closed');
  });

  it('returns pre during weekday pre-market hours', () => {
    const wednesdayPre = new Date('2025-01-15T05:00:00-05:00'); // Wednesday 05:00 ET
    expect(detectSession(wednesdayPre)).toBe('pre');
  });

  it('returns live during weekday market hours', () => {
    const wednesdayLive = new Date('2025-01-15T10:00:00-05:00'); // Wednesday
    expect(detectSession(wednesdayLive)).toBe('live');
  });

  it('returns after during weekday after-hours', () => {
    const wednesdayAfter = new Date('2025-01-15T17:00:00-05:00'); // Wednesday 17:00 ET
    expect(detectSession(wednesdayAfter)).toBe('after');
  });

  it('returns closed overnight on a weekday (20:00-04:00 ET)', () => {
    const wednesdayNight = new Date('2025-01-15T23:00:00-05:00'); // Wednesday 23:00 ET
    expect(detectSession(wednesdayNight)).toBe('closed');
  });
});

describe('isMarketHoliday — year-wrap observed holidays', () => {
  it('detects New Year observed on Friday Dec 31 when Jan 1 falls on Saturday (2027-12-31 for 2028-01-01)', () => {
    const dec31Friday = new Date('2027-12-31T12:00:00-05:00'); // Friday
    expect(isMarketHoliday(dec31Friday)).toBe(true);
  });

  it('does not treat a regular Friday Dec 31 as a holiday (2025-12-31 is Wednesday)', () => {
    const dec31Wednesday = new Date('2025-12-31T12:00:00-05:00'); // Wednesday
    expect(isMarketHoliday(dec31Wednesday)).toBe(false);
  });

  it('detects New Year observed on Monday Jan 2 when Jan 1 falls on Sunday (2023-01-02)', () => {
    const jan2Monday = new Date('2023-01-02T12:00:00-05:00'); // Monday
    expect(isMarketHoliday(jan2Monday)).toBe(true);
  });

  it('detects July 4 observed on Friday July 3 when July 4 falls on Saturday (2020-07-03)', () => {
    const jul3Friday = new Date('2020-07-03T12:00:00-04:00'); // Friday
    expect(isMarketHoliday(jul3Friday)).toBe(true);
  });

  it('detects Christmas observed on Friday Dec 24 when Dec 25 falls on Saturday (2021-12-24)', () => {
    const dec24Friday = new Date('2021-12-24T12:00:00-05:00'); // Friday
    expect(isMarketHoliday(dec24Friday)).toBe(true);
  });

  it('detects the actual fixed holidays themselves', () => {
    expect(isMarketHoliday(new Date('2025-01-01T12:00:00-05:00'))).toBe(true); // New Year
    expect(isMarketHoliday(new Date('2025-07-04T12:00:00-04:00'))).toBe(true); // Independence Day
    expect(isMarketHoliday(new Date('2025-12-25T12:00:00-05:00'))).toBe(true); // Christmas
  });

  it('detects floating holidays', () => {
    expect(isMarketHoliday(new Date('2025-01-20T12:00:00-05:00'))).toBe(true); // MLK (3rd Mon Jan)
    expect(isMarketHoliday(new Date('2025-02-17T12:00:00-05:00'))).toBe(true); // Presidents (3rd Mon Feb)
    expect(isMarketHoliday(new Date('2025-05-26T12:00:00-04:00'))).toBe(true); // Memorial (last Mon May)
    expect(isMarketHoliday(new Date('2025-09-01T12:00:00-04:00'))).toBe(true); // Labor (1st Mon Sep)
    expect(isMarketHoliday(new Date('2025-11-27T12:00:00-05:00'))).toBe(true); // Thanksgiving (4th Thu Nov)
    expect(isMarketHoliday(new Date('2025-04-18T12:00:00-04:00'))).toBe(true); // Good Friday 2025
  });

  it('does not flag regular trading days', () => {
    expect(isMarketHoliday(new Date('2025-01-15T12:00:00-05:00'))).toBe(false); // Wednesday
    expect(isMarketHoliday(new Date('2025-06-11T12:00:00-04:00'))).toBe(false); // Wednesday
  });
});
