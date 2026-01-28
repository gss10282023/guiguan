'use client';

import type { ReactNode } from 'react';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DEFAULT_TIME_ZONE = 'Australia/Sydney';
const STORAGE_KEY = 'guiguan.teacher.displayTimeZone';

export type TimeZoneOption = { value: string; label: string };

const TIME_ZONE_OPTIONS: TimeZoneOption[] = [
  { value: 'Australia/Sydney', label: '悉尼 (Australia/Sydney)' },
  { value: 'Asia/Shanghai', label: '上海 (Asia/Shanghai)' },
  { value: 'Asia/Singapore', label: '新加坡 (Asia/Singapore)' },
  { value: 'Asia/Tokyo', label: '东京 (Asia/Tokyo)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: '伦敦 (Europe/London)' },
  { value: 'America/New_York', label: '纽约 (America/New_York)' },
  { value: 'America/Los_Angeles', label: '洛杉矶 (America/Los_Angeles)' },
  { value: 'Pacific/Auckland', label: '奥克兰 (Pacific/Auckland)' },
];

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

type DisplayTimeZoneContextValue = {
  timeZone: string;
  setTimeZone: (timeZone: string) => void;
  options: TimeZoneOption[];
};

const DisplayTimeZoneContext = createContext<DisplayTimeZoneContextValue | null>(null);

export function DisplayTimeZoneProvider({ children }: { children: ReactNode }) {
  const [timeZone, setTimeZoneState] = useState(DEFAULT_TIME_ZONE);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidTimeZone(stored)) {
      setTimeZoneState(stored);
    }
  }, []);

  const setTimeZone = useCallback((next: string) => {
    if (!isValidTimeZone(next)) return;
    setTimeZoneState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<DisplayTimeZoneContextValue>(
    () => ({ timeZone, setTimeZone, options: TIME_ZONE_OPTIONS }),
    [setTimeZone, timeZone],
  );

  return <DisplayTimeZoneContext.Provider value={value}>{children}</DisplayTimeZoneContext.Provider>;
}

export function useDisplayTimeZone(): DisplayTimeZoneContextValue {
  const ctx = useContext(DisplayTimeZoneContext);
  if (!ctx) throw new Error('useDisplayTimeZone must be used within DisplayTimeZoneProvider');
  return ctx;
}

