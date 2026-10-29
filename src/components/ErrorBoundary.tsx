import { Component } from 'react';
import type { ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render crashes in the stage (e.g. a bad frame breaking the canvas
 * overlay) and shows a calm fallback instead of killing the session page.
 * Never colour-alone: the fallback is plain text with role="alert".
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // Logged for debugging; the user only sees the gentle fallback below.
    // eslint-disable-next-line no-console
    console.error('Stage crashed:', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <p role="alert">
          Something went wrong with the picture. Take your time — the rest of the session still works.
        </p>
      );
    }
    return this.props.children;
  }
}
