import { createElement, isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

describe('ErrorBoundary', () => {
  it('maps a thrown error to fallback state', () => {
   expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });  });

  it('renders the fallback instead of the crashed children', () => {
    const boundary = new ErrorBoundary({ children: 'stage' });
    boundary.state = { hasError: true };
    const el = boundary.render();
    expect(isValidElement(el)).toBe(true);
    expect(JSON.stringify(el)).toContain('Something went wrong with the picture');
  });

  it('renders children untouched when there is no error', () => {
    const child = createElement('span', null, 'stage');
    const boundary = new ErrorBoundary({ children: child });
    expect(boundary.render()).toBe(child);
  });
});
