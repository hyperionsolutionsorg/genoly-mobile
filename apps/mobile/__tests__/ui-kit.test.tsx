/**
 * ui-kit.test.tsx — C1 foundation coverage for the shared UI kit.
 *
 * These components deliberately avoid expo-router imports so they render
 * under jest-expo without the TurboModule gaps that keep the screen
 * suites (login/settings/auth-gate/activity) skipped.
 */

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  };
});

import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import { EmptyState } from '../components/ui/EmptyState';
import { TextField } from '../components/ui/TextField';
import { Section } from '../components/ui/Section';
import { Card } from '../components/ui/Card';
import { toast, ToastHost } from '../components/ui/Toast';

afterEach(() => {
  toast.__reset();
  jest.useRealTimers();
});

describe('Button', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByRole } = render(<Button label="Save" onPress={onPress} />);
    expect(getByText('Save')).toBeTruthy();
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner instead of the label and blocks presses while loading', () => {
    const onPress = jest.fn();
    const { queryByText, getByRole } = render(
      <Button label="Save" onPress={onPress} loading testID="save" />,
    );
    expect(queryByText('Save')).toBeNull();
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes accessibilityState when disabled', () => {
    const { getByRole } = render(<Button label="Go" onPress={() => {}} disabled />);
    expect(getByRole('button').props.accessibilityState.disabled).toBe(true);
  });
});

describe('Banner', () => {
  it('renders the message with an alert role for errors', () => {
    const { getByText, getByTestId } = render(
      <Banner variant="error" message="Sync failed." testID="sync-banner" />,
    );
    expect(getByText('Sync failed.')).toBeTruthy();
    expect(getByTestId('sync-banner').props.accessibilityRole).toBe('alert');
  });

  it('fires the inline action', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <Banner variant="warning" message="3 entries failed." actionLabel="Clear" onAction={onAction} />,
    );
    fireEvent.press(getByText('Clear'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  it('renders title, body, and CTA', () => {
    const onCta = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="🌳"
        title="No people yet"
        body="Add your first relative to get started."
        ctaLabel="Add person"
        onCtaPress={onCta}
      />,
    );
    expect(getByText('No people yet')).toBeTruthy();
    fireEvent.press(getByText('Add person'));
    expect(onCta).toHaveBeenCalledTimes(1);
  });
});

describe('TextField', () => {
  it('renders label and uses it as the accessibility label', () => {
    const { getByLabelText } = render(<TextField label="Email" value="" onChangeText={() => {}} />);
    expect(getByLabelText('Email')).toBeTruthy();
  });

  it('shows the error under the field', () => {
    const { getByText } = render(
      <TextField label="Email" value="x" onChangeText={() => {}} error="Invalid email address" />,
    );
    expect(getByText('Invalid email address')).toBeTruthy();
  });

  it('falls back to helper text when there is no error', () => {
    const { getByText } = render(
      <TextField label="Name" value="" onChangeText={() => {}} helper="Shown on your profile" />,
    );
    expect(getByText('Shown on your profile')).toBeTruthy();
  });
});

describe('Section + Card', () => {
  it('renders the uppercase section label and children', () => {
    const { getByText } = render(
      <Section label="Account">
        <Card title="Email" description="you@example.com" />
      </Section>,
    );
    expect(getByText('Account')).toBeTruthy();
    expect(getByText('you@example.com')).toBeTruthy();
  });

  it('pressable cards fire onPress and show the chevron affordance', () => {
    const onPress = jest.fn();
    const { getByRole, getByText } = render(<Card title="Tree" onPress={onPress} />);
    expect(getByText('›')).toBeTruthy();
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  it('renders pushed toasts in the host and dismisses on tap', async () => {
    const { getByText, queryByText } = render(<ToastHost />);
    act(() => {
      toast.error('Could not save your change.');
    });
    expect(getByText('Could not save your change.')).toBeTruthy();
    fireEvent.press(getByText('Could not save your change.'));
    await waitFor(() => expect(queryByText('Could not save your change.')).toBeNull());
  });

  it('auto-dismisses success toasts after 4s but keeps errors', () => {
    jest.useFakeTimers();
    const { queryByText } = render(<ToastHost />);
    act(() => {
      toast.success('Saved.');
      toast.error('Broken.');
    });
    expect(queryByText('Saved.')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(4100);
    });
    expect(queryByText('Saved.')).toBeNull();
    expect(queryByText('Broken.')).toBeTruthy();
  });

  it('caps visible toasts at three (FIFO)', () => {
    const { queryByText } = render(<ToastHost />);
    act(() => {
      toast.info('one');
      toast.info('two');
      toast.info('three');
      toast.info('four');
    });
    expect(queryByText('one')).toBeNull();
    expect(queryByText('two')).toBeTruthy();
    expect(queryByText('four')).toBeTruthy();
  });
});
