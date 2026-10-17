import { AuthPageLayout } from '../auth/AuthPageLayout'
import { LoginForm } from '../auth/LoginForm'
import { useTranslation } from '../../i18n/useTranslation'

export function LoginPage() {
  const { t } = useTranslation()

  return (
    <AuthPageLayout
      description={t('loginDescription')}
      eyebrow={t('loginEyebrow')}
      title={t('loginTitle')}
    >
      <LoginForm />
    </AuthPageLayout>
  )
}
