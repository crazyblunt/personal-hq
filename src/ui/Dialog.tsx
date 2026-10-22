import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { closeConfirm, useUI } from '../app/ui';
import { cn, errorMessage } from '../lib/util';
import { Button } from './controls';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** When true, closing asks before discarding unsaved edits. */
  dirty?: boolean;
  className?: string;
}

const WIDTH = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** A modal window: title bar with close box, scrolling body, button row. */
export function Dialog({ open, onClose, title, icon, children, footer, size = 'md', dirty = false, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const isOpen = d.hasAttribute('open');
    if (open && !isOpen) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    }
    if (!open && isOpen) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    if (!open) setAsking(false);
  }, [open]);

  const requestClose = () => {
    if (dirty) setAsking(true);
    else onClose();
  };

  // The browser can close a modal dialog on its own (Escape is not always
  // cancelable). Keep React in step: report the close, or reopen and ask
  // first when there are unsaved edits.
  const latest = useRef({ open, dirty, onClose });
  latest.current = { open, dirty, onClose };
  const onNativeClose = () => {
    const { open: shouldBeOpen, dirty: isDirty, onClose: close } = latest.current;
    if (!shouldBeOpen) return;
    if (isDirty) {
      try {
        ref.current?.showModal();
      } catch {
        ref.current?.setAttribute('open', '');
      }
      setAsking(true);
    } else close();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (!dirty && !asking) return; // let Escape close it; onClose below reports it
        e.preventDefault();
        if (asking) setAsking(false);
        else requestClose();
      }}
      onClose={onNativeClose}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      className={cn('m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] overflow-hidden bevel-out bg-panel p-0 text-fg shadow-[4px_4px_0_rgb(0_0_0/0.45)]', WIDTH[size], className)}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <div className="flex h-7 shrink-0 items-center gap-2 bg-accent-face pr-1 pl-2 text-accent-ink">
            {icon && <span className="shrink-0 [&_svg]:size-3.5">{icon}</span>}
            <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-bold">
              {title}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="grid size-5 place-items-center bevel-out bg-raised text-fg hover:bg-raised-hover active:bevel-in"
            >
              <X className="size-3" strokeWidth={3} />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto p-3">{children}</div>
          {asking ? (
            <div role="alertdialog" aria-label="Discard changes?" className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-t border-line bg-bar px-3 py-2">
              <span className="mr-auto text-sm text-warn">You have unsaved changes.</span>
              <Button onClick={() => setAsking(false)} autoFocus>
                Keep editing
              </Button>
              <Button variant="danger" onClick={onClose}>
                Discard changes
              </Button>
            </div>
          ) : (
            footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-t border-line bg-bar px-3 py-2">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}

/** Renders the confirmation requested through `confirmAction()`. */
export function ConfirmHost() {
  const req = useUI((s) => s.confirm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    setBusy(false);
  }, [req]);
  return (
    <Dialog
      open={req !== null}
      onClose={closeConfirm}
      title={req?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button onClick={closeConfirm} autoFocus>
            Cancel
          </Button>
          <Button
            variant={req?.danger === false ? 'primary' : 'danger'}
            disabled={busy}
            onClick={async () => {
              if (!req) return;
              setBusy(true);
              try {
                await req.onConfirm();
                closeConfirm();
              } catch (e) {
                setError(errorMessage(e));
                setBusy(false);
              }
            }}
          >
            {req?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="text-sm whitespace-pre-line text-muted">{req?.body}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </Dialog>
  );
}
