import { Button } from './ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from './ui/Dialog';
import { t } from '../i18n';

/** Yes/no question before something that cannot be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} size="sm">
        {body && (
          <DialogBody>
            <p className="text-sm text-text-2">{body}</p>
          </DialogBody>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
