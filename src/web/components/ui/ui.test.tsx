import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Dialog, DialogContent } from './Dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';
import { SegmentedControl } from './SegmentedControl';
import { Toaster, toast } from './Toaster';

describe('ui primitives', () => {
  it('Dialog traps focus and closes on Escape', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title="Edit">
            <input aria-label="first" />
            <Button>Save</Button>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Demo />);
    expect(screen.getByRole('dialog', { name: 'Edit' })).toBeInTheDocument();
    for (let i = 0; i < 6; i++) await user.tab();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('DropdownMenu opens with keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>More</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Skip</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    screen.getByRole('button', { name: 'More' }).focus();
    await user.keyboard('{Enter}');
    const item = await screen.findByRole('menuitem', { name: 'Skip' });
    expect(item).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalled();
  });

  it('SegmentedControl calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl label="View" value="list" onChange={onChange} options={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]} />);
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });

  it('toast.undo calls onUndo when clicked', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<Toaster />);
    toast.undo('Marked as paid', onUndo, 'Undo');
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
