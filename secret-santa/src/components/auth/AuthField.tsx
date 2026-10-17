import type { InputHTMLAttributes, ReactNode } from 'react'

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string
  label: string
  error?: string
  hint?: string
  labelAction?: ReactNode
}

export function AuthField({
  error,
  hint,
  id,
  label,
  labelAction,
  className: inputClassName,
  ...inputProps
}: AuthFieldProps) {
  const describedBy = [
    hint ? `${id}-hint` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="grid gap-2">
      <label
        className="flex items-center justify-between gap-3 text-sm font-semibold text-[#243d32]"
        htmlFor={id}
      >
        <span>{label}</span>
        {labelAction}
      </label>
      <input
        {...inputProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={Boolean(error)}
        className={`min-h-12 w-full rounded-xl border bg-white px-4 text-sm text-[#18352c] outline-none transition placeholder:text-[#879289] focus:ring-4 ${
          error
            ? 'border-[#b64235] focus:border-[#b64235] focus:ring-[#b64235]/10'
            : 'border-[#cdd8ce] focus:border-[#1b674a] focus:ring-[#1b674a]/10'
        } ${inputClassName ?? ''}`}
        id={id}
      />
      {hint && (
        <p className="m-0 text-xs leading-5 text-[#52655a]" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p
          className="m-0 text-xs font-medium leading-5 text-[#a23228]"
          id={`${id}-error`}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
