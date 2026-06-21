'use client';

import React from 'react';

interface State {
  hasError: boolean;
  retryKey: number;
}

/**
 * Catches React render errors (including #329 wallet adapter race conditions)
 * and re-mounts the page tree after a short delay so blank pages recover
 * automatically without requiring a manual refresh.
 */
export default class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, retryKey: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Log but don't surface to user — we auto-recover below.
    console.warn('[PageErrorBoundary] caught render error, auto-recovering:', error.message);
  }

  componentDidUpdate(_: unknown, prev: State) {
    // When we enter error state, schedule a re-mount after one frame so the
    // Solana wallet adapter finishes its state update and the re-render succeeds.
    if (this.state.hasError && !prev.hasError) {
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false, retryKey: this.state.retryKey + 1 });
      }, 80);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      // Render nothing while waiting for the 80ms retry — page stays blank
      // for one frame only, which is imperceptible to users.
      return null;
    }
    return (
      // key forces a full re-mount after recovery so stale React fiber state
      // from the failed render cycle is discarded.
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
