import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type FieldProps = HTMLAttributes<HTMLDivElement> & {
  hint?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
};

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
export type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "type">;
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;
export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

const fieldClasses = ["grid", "gap-(--space-2)"].join(" ");

const labelClasses = [
  "vc-type-eyebrow",
  "text-(--text-3)",
].join(" ");

const hintClasses = [
  "vc-type-caption",
  "text-(--text-3)",
].join(" ");

const controlShellClasses = [
  "vc-type-body",
  "h-(--space-10)",
  "w-full",
  "rounded-(--r)",
  "border",
  "border-(--line)",
  "bg-(--bg-1)",
  "px-(--space-3)",
  "text-(--text)",
  "transition-colors",
  "placeholder:text-(--text-3)",
  "hover:bg-(--bg-2)",
  "focus:border-(--blue)",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-(--blue)",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
].join(" ");

const checkboxClasses = [
  "h-(--space-4)",
  "w-(--space-4)",
  "rounded-(--r-sm)",
  "border",
  "border-(--line)",
  "bg-(--bg-1)",
  "accent-(--blue)",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-(--blue)",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
].join(" ");

export function Field({ children, className, hint, htmlFor, label, ...fieldProps }: FieldProps) {
  return (
    <div className={twMerge(clsx(fieldClasses, className))} {...fieldProps}>
      <label className={labelClasses} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className={hintClasses}>{hint}</p> : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, ...inputProps },
  ref,
) {
  return <input className={twMerge(clsx(controlShellClasses, className))} ref={ref} type="text" {...inputProps} />;
});

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, ...inputProps },
  ref,
) {
  return (
    <span className="relative block w-full">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-(--space-3) top-1/2 h-(--space-4) w-(--space-4) -translate-y-1/2 text-(--text-3)"
        data-testid="search-input-icon"
      />
      <input
        className={twMerge(clsx(controlShellClasses, "pl-(--space-9)", className))}
        ref={ref}
        type="search"
        {...inputProps}
      />
    </span>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...selectProps },
  ref,
) {
  return (
    <select
      className={twMerge(clsx(controlShellClasses, "appearance-none pr-(--space-10)", className))}
      ref={ref}
      {...selectProps}
    />
  );
});

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { className, ...inputProps },
  ref,
) {
  return (
    <input
      className={twMerge(clsx(controlShellClasses, className))}
      inputMode="decimal"
      ref={ref}
      type="number"
      {...inputProps}
    />
  );
});

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...inputProps },
  ref,
) {
  return <input className={twMerge(clsx(checkboxClasses, className))} ref={ref} type="checkbox" {...inputProps} />;
});
