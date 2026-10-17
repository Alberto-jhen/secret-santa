import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from '../../i18n/useTranslation'
import { useAuth } from '../../hooks/useAuth'
import { PageContainer } from '../ui/PageContainer'

interface AuthPageLayoutProps {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

export function AuthPageLayout({
  children,
  description,
  eyebrow,
  title,
}: AuthPageLayoutProps) {
  const { loading, user } = useAuth()
  const { t } = useTranslation()

  if (loading) {
    return (
      <section className="grid min-h-[560px] place-items-center bg-[#f2f5ef] px-4 py-12">
        <p aria-live="polite" className="text-sm font-medium text-[#345246]">
          {t('authCheckingSession')}
        </p>
      </section>
    )
  }

  if (user) {
    return <Navigate replace to="/" />
  }

  return (
    <section className="relative isolate overflow-hidden bg-[#f2f5ef] px-4 py-12 sm:py-16">
      {/* Decorative background shapes for the centered authentication card. */}
      <span
        aria-hidden="true"
        className="absolute -top-40 left-[calc(50%-19rem)] size-80 rounded-full bg-[#dceda0]/35 blur-3xl"
      />
      {/* Single centered card containing the title and active authentication form. */}
      <PageContainer className="relative max-w-[500px] px-0">
        <div className="overflow-hidden rounded-[24px] border border-[#d7e0d7] bg-white shadow-[0_24px_70px_rgba(24,53,44,0.12)]">
          {/* Shared heading for register and login pages. */}
          <header className="border-b border-[#e5ebe5] px-6 pt-8 pb-6 text-center sm:px-9">
            <p className="mb-3 text-[11px] font-bold tracking-[0.16em] text-[#285d43] uppercase">
              {eyebrow}
            </p>
            <h1 className="m-0 font-display text-[clamp(32px,8vw,42px)] leading-[1.05] font-medium tracking-[-0.045em] text-[#18352c]">
              {title}
            </h1>
            <p className="mx-auto mt-3 max-w-[370px] text-sm leading-6 text-[#52655a]">
              {description}
            </p>
          </header>
          {/* Form content stays separate from page layout and shared auth state. */}
          <div className="px-6 py-7 sm:px-9 sm:py-8">{children}</div>
        </div>
      </PageContainer>
    </section>
  )
}
