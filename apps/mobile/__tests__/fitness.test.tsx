/**
 * fitness.test.tsx — Step 7 Dashboard screen coverage.
 *
 * The hook's logic is tested in useDashboardData.test.ts. This file
 * tests the SCREEN's rendering of the hook output:
 *
 *   1. Initial loading shows a spinner
 *   2. Empty state when there's no data + no error
 *   3. Renders today's big numbers from data.today
 *   4. Renders "—" placeholders when data.today is null but historical exists
 *   5. Renders 7-day bars when data.last7Days is non-empty
 *   6. Refresh button calls data.refresh()
 *   7. Dead-letter banner appears only when deadLetterDepth > 0
 *   8. Dead-letter "Clear" tap shows Alert + calls data.clearDeadLetters() on confirm
 *   9. Error banner displays + "Retry" calls data.refresh()
 *
 * We mock the hook directly so we can drive each state independently.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────

// utils/api.ts throws at module top-level if convexBaseUrl is missing
// from app.json's `extra`. In the jest-expo environment that field is
// undefined, so we mock the whole module to keep it loadable. The
// hook is also mocked below; we never actually call apiClient here.
jest.mock('../utils/api', () => ({
  apiClient: {
    getDailyAggregates: jest.fn(),
  },
  tokenStore: {},
}));

const mockRefresh = jest.fn();
const mockClearDeadLetters = jest.fn();

jest.mock('../hooks/useDashboardData', () => {
  // We keep the real computeDashboardRange so we don't have to re-export it.
  const actual = jest.requireActual('../hooks/useDashboardData');
  return {
    ...actual,
    useDashboardData: jest.fn(),
  };
});

import FitnessScreen from '../app/(tabs)/fitness';
import { useDashboardData } from '../hooks/useDashboardData';

// ── Test helpers ─────────────────────────────────────────────────────

interface MockData {
  today?: object | null;
  last7Days?: object[];
  range?: { from: string; to: string };
  queueDepth?: number;
  deadLetterDepth?: number;
  lastSyncedAt?: number | null;
  refreshing?: boolean;
  initialLoading?: boolean;
  error?: string | null;
}

function setHook(state: MockData) {
  (useDashboardData as jest.Mock).mockReturnValue({
    today: state.today ?? null,
    last7Days: state.last7Days ?? [],
    range: state.range ?? { from: '2026-05-23', to: '2026-05-29' },
    queueDepth: state.queueDepth ?? 0,
    deadLetterDepth: state.deadLetterDepth ?? 0,
    lastSyncedAt: state.lastSyncedAt ?? null,
    refreshing: state.refreshing ?? false,
    initialLoading: state.initialLoading ?? false,
    error: state.error ?? null,
    refresh: mockRefresh,
    clearDeadLetters: mockClearDeadLetters,
  });
}

function makeEntry(date: string, steps: number) {
  return {
    date,
    dateUtcStart: 0,
    steps,
    caloriesActive: 200,
    caloriesBasal: null,
    distanceMeters: 2500,
    source: 'healthkit',
    lastSyncedAt: Date.now(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('FitnessScreen — Dashboard', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockClearDeadLetters.mockReset();
    (useDashboardData as jest.Mock).mockReset();
  });

  it('shows loading spinner when initialLoading is true', () => {
    setHook({ initialLoading: true });
    const { getByText } = render(<FitnessScreen />);
    expect(getByText(/Loading your activity/)).toBeTruthy();
  });

  it('shows empty state when there is no data and no error', () => {
    setHook({ last7Days: [], lastSyncedAt: Date.now() });
    const { getByText } = render(<FitnessScreen />);
    expect(getByText('No activity yet')).toBeTruthy();
  });

  it('renders today big numbers from data.today', () => {
    const today = makeEntry('2026-05-29', 8765);
    setHook({
      today,
      // Use distinct values for the 7-day list so the today-card values
      // appear in only ONE place. The big number "8,765" and the bar
      // value "8,765" both render — getAllByText returns the array of
      // matches; we assert the right count.
      last7Days: [today],
      lastSyncedAt: Date.now(),
    });
    const { getByText, getAllByText } = render(<FitnessScreen />);
    expect(getByText('Steps')).toBeTruthy();
    // Two matches expected: 1) the big-number card, 2) the 7-day bar value.
    expect(getAllByText('8,765')).toHaveLength(2);
    expect(getByText('Active calories')).toBeTruthy();
    expect(getByText(/200 kcal/)).toBeTruthy();
    expect(getByText('Distance')).toBeTruthy();
    expect(getByText(/2\.50 km/)).toBeTruthy();
  });

  it('renders dash placeholders when data.today is null but historical exists', () => {
    setHook({
      today: null,
      last7Days: [makeEntry('2026-05-28', 5000)],
      lastSyncedAt: Date.now(),
    });
    const { getAllByText } = render(<FitnessScreen />);
    // Three rows, each renders '—' for value when empty.
    expect(getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('renders 7-day bars when last7Days is non-empty', () => {
    setHook({
      today: makeEntry('2026-05-29', 1000),
      last7Days: [
        makeEntry('2026-05-25', 2000),
        makeEntry('2026-05-27', 3000),
        makeEntry('2026-05-29', 1000),
      ],
      range: { from: '2026-05-23', to: '2026-05-29' },
      lastSyncedAt: Date.now(),
    });
    const { getByText, getAllByText } = render(<FitnessScreen />);
    expect(getByText('Last 7 days')).toBeTruthy();
    // "Today" appears twice: the screen title at the top + the bar's
    // date label for today. Both renders are correct.
    expect(getAllByText('Today')).toHaveLength(2);
    // Bar values: the today-bar value "1,000" also appears in the big
    // number card, so it shows twice. The historical-day values are
    // single-occurrence.
    expect(getAllByText('1,000')).toHaveLength(2);
    expect(getByText('2,000')).toBeTruthy();
    expect(getByText('3,000')).toBeTruthy();
  });

  it('refresh button triggers data.refresh()', () => {
    setHook({ today: makeEntry('2026-05-29', 100), lastSyncedAt: Date.now() });
    const { getByLabelText } = render(<FitnessScreen />);

    fireEvent.press(getByLabelText('Refresh dashboard'));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('hides dead-letter banner when deadLetterDepth is 0', () => {
    setHook({ today: makeEntry('2026-05-29', 100), deadLetterDepth: 0, lastSyncedAt: Date.now() });
    const { queryByText } = render(<FitnessScreen />);
    expect(queryByText(/failed to sync/)).toBeNull();
  });

  it('shows dead-letter banner when deadLetterDepth > 0', () => {
    setHook({
      today: makeEntry('2026-05-29', 100),
      deadLetterDepth: 3,
      lastSyncedAt: Date.now(),
    });
    const { getByText } = render(<FitnessScreen />);
    expect(getByText(/3 entries failed to sync/)).toBeTruthy();
  });

  it('uses singular "entry" in the banner for count of 1', () => {
    setHook({
      today: makeEntry('2026-05-29', 100),
      deadLetterDepth: 1,
      lastSyncedAt: Date.now(),
    });
    const { getByText } = render(<FitnessScreen />);
    expect(getByText(/1 entry failed to sync/)).toBeTruthy();
  });

  it('Clear tap → Alert → confirm calls clearDeadLetters', async () => {
    setHook({
      today: makeEntry('2026-05-29', 100),
      deadLetterDepth: 5,
      lastSyncedAt: Date.now(),
    });

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_, __, buttons) => {
        const confirm = (buttons ?? []).find((b: { text?: string }) => b.text === 'Clear');
        confirm?.onPress?.();
      });

    const { getByLabelText } = render(<FitnessScreen />);
    fireEvent.press(getByLabelText('Clear failed syncs'));

    await waitFor(() => {
      expect(mockClearDeadLetters).toHaveBeenCalledTimes(1);
    });

    alertSpy.mockRestore();
  });

  it('Cancel on Clear dialog does NOT call clearDeadLetters', () => {
    setHook({
      today: makeEntry('2026-05-29', 100),
      deadLetterDepth: 5,
      lastSyncedAt: Date.now(),
    });

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_, __, buttons) => {
        const cancel = (buttons ?? []).find((b: { text?: string }) => b.text === 'Cancel');
        cancel?.onPress?.();
      });

    const { getByLabelText } = render(<FitnessScreen />);
    fireEvent.press(getByLabelText('Clear failed syncs'));

    expect(mockClearDeadLetters).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('error banner shows error + Retry calls refresh', () => {
    setHook({
      today: makeEntry('2026-05-29', 100),
      error: 'Network down',
      lastSyncedAt: Date.now(),
    });
    const { getByText, getByLabelText } = render(<FitnessScreen />);
    expect(getByText('Network down')).toBeTruthy();

    fireEvent.press(getByLabelText('Retry refresh'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
