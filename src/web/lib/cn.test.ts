import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('lets a later width win and keeps token colour next to a size', () => {
    expect(cn('w-full h-10', 'w-auto')).toBe('h-10 w-auto');
    expect(cn('text-[13px] text-text-2')).toBe('text-[13px] text-text-2');
    expect(cn('bg-card', 'bg-primary')).toBe('bg-primary');
    expect(cn('rounded-ctl', 'rounded-card')).toBe('rounded-card');
  });
});
