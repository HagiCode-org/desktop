import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DebugSettings() {
  const { t } = useTranslation('pages');

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.debug.title')}</CardTitle>
        <CardDescription>
          {t('settings.debug.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t('settings.debug.deprecatedNotice')}
        </p>
      </CardContent>
    </Card>
  );
}
