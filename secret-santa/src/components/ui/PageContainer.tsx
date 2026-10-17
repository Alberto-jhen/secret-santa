import type { HTMLAttributes } from 'react'

type PageContainerProps = HTMLAttributes<HTMLDivElement>

export function PageContainer({ className = '', ...props }: PageContainerProps) {
  return (
    <div
      className={`mx-auto w-full max-w-[1224px] px-8 max-[720px]:max-w-[600px] max-[720px]:px-5 max-[420px]:px-3 ${className}`}
      {...props}
    />
  )
}
