import { Link, type LinkProps } from 'react-router-dom'
import { Icon } from './Icon'

type ButtonVariant = 'primary' | 'outline' | 'quiet' | 'light'
type ButtonSize = 'default' | 'small'
type ArrowDirection = 'right' | 'up-right'

interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  arrow?: ArrowDirection
  className?: string
  size?: ButtonSize
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-forest text-paper shadow-[0_7px_18px_rgba(23,75,58,0.14)] hover:bg-forest-dark',
  outline:
    'border-[#d8ded5] bg-transparent text-forest hover:border-forest hover:bg-[#eef2e8]',
  quiet: 'bg-transparent text-ink hover:bg-forest/5 hover:text-forest',
  light: 'bg-lime text-forest-dark hover:bg-[#e8f5bd]',
}

const sizeClasses: Record<ButtonSize, string> = {
  default: 'min-h-[52px] px-[22px] text-[13px]',
  small: 'min-h-[43px] px-[17px] text-xs',
}

export function ButtonLink({
  arrow,
  children,
  className = '',
  size = 'default',
  variant = 'primary',
  ...linkProps
}: ButtonLinkProps) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-3 rounded-full border border-transparent font-semibold no-underline transition duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...linkProps}
    >
      {children}
      {arrow && (
        <Icon
          className="size-[17px] shrink-0"
          name={arrow === 'right' ? 'arrow-right' : 'arrow-up-right'}
        />
      )}
    </Link>
  )
}
