import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DisclaimerFooter } from './disclaimer-footer';

describe('DisclaimerFooter', () => {
  it('renders the legal disclaimer text', () => {
    render(<DisclaimerFooter />);
    expect(screen.getByText(/educational information only/i)).toBeInTheDocument();
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument();
  });

  it('has role="contentinfo" for accessibility', () => {
    render(<DisclaimerFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
