import { useTranslation } from 'react-i18next'

export const DashboardLoading = () => {
  const { t } = useTranslation('dashboard')

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-600">{t('loading.dashboard')}</div>
      </div>
    </div>
  )
}
