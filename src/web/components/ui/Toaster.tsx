import { Toaster as Sonner, toast as sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        className: '!bg-primary !text-primary-fg !border-0 !rounded-[10px] !shadow-[var(--shadow)] !font-sans',
        actionButtonStyle: { background: 'transparent', color: 'inherit', fontWeight: 600, textDecoration: 'underline' },
      }}
    />
  );
}

export const toast = {
  message: (text: string) => sonner(text),
  success: (text: string) => sonner.success(text),
  error: (text: string) => sonner.error(text),
  /** Five-second notice with an undo action. */
  undo: (text: string, onUndo: () => void, undoLabel: string) =>
    sonner(text, { duration: 5000, action: { label: undoLabel, onClick: onUndo } }),
};
