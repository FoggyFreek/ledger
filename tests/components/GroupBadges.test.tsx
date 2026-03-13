// @vitest-environment jsdom
/**
 * Tests for src/components/groups/GroupBadges.tsx
 *
 * Covers:
 *  - 0 memberships: renders nothing
 *  - 1 membership: renders a single pill badge
 *  - 2 memberships: renders both pill badges inline
 *  - 3+ memberships: renders collapsed count button (Layers icon + count)
 *  - Clicking the count button expands to show all individual badges
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupBadges } from '../../src/components/groups/GroupBadges';

const memberships = (names: string[]) =>
  names.map((name, i) => ({ id: i + 1, name }));

describe('GroupBadges', () => {
  it('renders nothing for 0 memberships', () => {
    const { container } = render(<GroupBadges memberships={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a badge for a single membership', () => {
    render(<GroupBadges memberships={memberships(['Tax 2024'])} />);
    expect(screen.getByText('Tax 2024')).toBeTruthy();
  });

  it('renders both badges inline for 2 memberships', () => {
    render(<GroupBadges memberships={memberships(['Alpha', 'Beta'])} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('shows count button (not individual badges) for 3 memberships', () => {
    render(<GroupBadges memberships={memberships(['A', 'B', 'C'])} />);
    // Individual badge text should not be visible initially
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.queryByText('B')).toBeNull();
    expect(screen.queryByText('C')).toBeNull();
    // Count button shows the number
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('shows count button for 5 memberships', () => {
    render(<GroupBadges memberships={memberships(['A', 'B', 'C', 'D', 'E'])} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('expands to all badges when count button is clicked', () => {
    render(<GroupBadges memberships={memberships(['Alpha', 'Beta', 'Gamma'])} />);

    const button = screen.getByText('3').closest('button')!;
    fireEvent.click(button);

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
    // Count button should be gone after expansion
    expect(screen.queryByText('3')).toBeNull();
  });

  it('badges have the expected purple styling class', () => {
    render(<GroupBadges memberships={memberships(['MyGroup'])} />);
    const badge = screen.getByText('MyGroup');
    expect(badge.className).toContain('bg-purple-800');
    expect(badge.className).toContain('text-purple-200');
  });
});
