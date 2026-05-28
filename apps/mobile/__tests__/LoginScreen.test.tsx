// apps/mobile/__tests__/LoginScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '@/app/(auth)/login';

jest.mock('../../utils/api', () => ({
  apiClient: {
    issueToken: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

describe('LoginScreen', () => {
  it('renders and can submit', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(getByText('Sign In'));
    await waitFor(() => {
      expect(require('../../utils/api').apiClient.issueToken).toHaveBeenCalled();
    });
  });
});
