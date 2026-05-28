// apps/mobile/__tests__/login.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../app/(auth)/login';
import { apiClient } from '../utils/api';

jest.mock('../utils/api', () => ({
  apiClient: {
    issueToken: jest.fn(),
  },
}));

describe('LoginScreen', () => {
  it('renders form fields and validates input', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<LoginScreen />);
    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const loginButton = getByText('Log In');

    // Submit empty -> show validation errors
    fireEvent.press(loginButton);
    await waitFor(() => {
      expect(getByText('Invalid email address')).toBeTruthy();
      expect(getByText('Password must be at least 8 characters')).toBeTruthy();
    });

    // Fill valid data
    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    (apiClient.issueToken as jest.Mock).mockResolvedValueOnce({});

    fireEvent.press(loginButton);
    await waitFor(() => {
      expect(apiClient.issueToken).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        device: { platform: 'mobile' },
      });
      // No error alert should be shown
      expect(queryByText('Login error')).toBeNull();
    });
  });
});
