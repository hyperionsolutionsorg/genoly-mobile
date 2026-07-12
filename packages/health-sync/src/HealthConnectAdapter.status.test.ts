/**
 * Regression guard for the Health Connect SDK-availability mapping.
 *
 * react-native-health-connect's SdkAvailabilityStatus is:
 *   1 = SDK_UNAVAILABLE, 2 = SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED,
 *   3 = SDK_AVAILABLE.
 * The adapter once compared `=== 1` (with an inverted comment), so
 * isAvailable() returned false on EVERY device that actually had Health
 * Connect — the "Health data unavailable" dialog on a real Samsung with
 * data (2026-07-11). These tests pin the correct mapping so it can't invert
 * again.
 *
 * Own file so the native-module mock doesn't disturb HealthAdapter.test.ts,
 * whose HealthConnect cases assume the module is absent.
 */

jest.mock('react-native-health-connect', () => ({
  getSdkStatus: jest.fn(),
}));

import { getSdkStatus } from 'react-native-health-connect';
import { HealthConnectAdapter } from './HealthConnectAdapter';

const mockGetSdkStatus = getSdkStatus as unknown as jest.Mock;

describe('HealthConnectAdapter.isAvailable() SDK-status mapping', () => {
  it('SDK_AVAILABLE (3) → available', async () => {
    mockGetSdkStatus.mockResolvedValue(3);
    expect(await new HealthConnectAdapter().isAvailable()).toBe(true);
  });

  it('SDK_UNAVAILABLE (1) → not available', async () => {
    mockGetSdkStatus.mockResolvedValue(1);
    expect(await new HealthConnectAdapter().isAvailable()).toBe(false);
  });

  it('SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED (2) → not available', async () => {
    mockGetSdkStatus.mockResolvedValue(2);
    expect(await new HealthConnectAdapter().isAvailable()).toBe(false);
  });
});
