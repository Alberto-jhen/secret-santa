import { useTranslation } from '../../i18n/useTranslation'
import { AuthPageLayout } from '../auth/AuthPageLayout'
import { RegisterForm } from '../auth/RegisterForm'


export function RegisterPage() {
  const { t } = useTranslation()

  return (
    <AuthPageLayout
      description={t('registerDescription')}
      eyebrow={t('registerEyebrow')}
      title={t('registerTitle')}
    >
      <RegisterForm />
    </AuthPageLayout>
  )
}