import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/util';

const press = 'bevel-out active:bevel-in active:translate-y-px';

const VARIANTS = {
  primary: cn(press, 'bg-accent-face text-accent-ink hover:brightness-110'),
  secondary: cn(press, 'bg-raised text-fg hover:bg-raised-hover'),
  ghost: 'border border-transparent text-muted hover:bevel-out hover:bg-raised hover:text-fg active:bevel-in',
  danger: cn(press, 'bg-bad-fill text-white hover:brightness-110'),
} as const;

const SIZES = {
  xs: 'h-5 gap-1 px-1.5 text-xs',
  sm: 'h-6 gap-1 px-2 text-xs',
  md: 'h-7 gap-1.5 px-2.5 text-sm',
  icon: 'size-7 justify-center',
  iconSm: 'size-6 justify-center',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('inline-flex shrink-0 items-center whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-45', VARIANTS[variant], SIZES[size], className)}
      {...rest}
    />
  );
});

export const fieldBase = 'w-full bevel-in bg-inset px-2 text-sm text-fg placeholder:text-subtle disabled:opacity-50';
const fieldNoWidth = 'bevel-in bg-inset px-2 text-sm text-fg placeholder:text-subtle disabled:opacity-50';
/** Field classes; a plain `w-*` in `className` replaces the default full width. */
const field = (className?: string) => cn(/(^|\s)w-/.test(className ?? '') ? fieldNoWidth : fieldBase, className);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field(className), !/(^|\s)h-/.test(className ?? '') && 'h-7')} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field(className), 'min-h-20 resize-y py-1.5 leading-relaxed')} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn('pr-6', !/(^|\s)h-/.test(className ?? '') && 'h-7', field(className))} {...rest} />;
});

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="font-mono text-2xs tracking-wider text-muted uppercase">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-subtle">{hint}</p>
      )}
    </div>
  );
}

/** A square, classic checkbox. */
export function Check({ checked, onChange, label, className, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn('grid size-4 shrink-0 place-items-center bevel-in bg-inset text-accent disabled:opacity-50', className)}
    >
      {checked && (
        <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
          <path d="M1.5 5.2 4 7.6 8.6 2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )}
    </button>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-default items-start gap-2 py-1">
      <Check checked={checked} onChange={onChange} label={label} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {description && <span className="block text-xs text-subtle">{description}</span>}
      </span>
    </label>
  );
}
