import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityFeed } from '../app/components/ActivityFeed';
import { AppProvider } from '../app/context/AppContext';

describe('ActivityFeed Component', () => {
  it('renders heading, live indicator, and filter buttons', () => {
    render(
      <AppProvider>
        <ActivityFeed />
      </AppProvider>
    );

    // Live indicator
    expect(screen.getByText(/live/i)).toBeInTheDocument();

    // Heading
    expect(screen.getByRole('heading', { level: 3, name: /on-chain activity feed/i })).toBeInTheDocument();

    // Filter pills
    expect(screen.getByRole('button', { name: 'ALL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DEPOSIT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TRADE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FUNDING' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CLAIM' })).toBeInTheDocument();
  });
});
