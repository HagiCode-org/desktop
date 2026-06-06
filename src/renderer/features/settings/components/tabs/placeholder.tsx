import { LayoutTemplate } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SettingsTabComponentProps } from '../../types';

interface SettingsPlaceholderTabProps extends SettingsTabComponentProps {
  titleKey: string;
  descriptionKey: string;
}

function SettingsPlaceholderTab({ titleKey, descriptionKey }: SettingsPlaceholderTabProps) {
  const { t } = useTranslation('pages');

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5" />
          <CardTitle>{t(titleKey)}</CardTitle>
        </div>
        <CardDescription>{t(descriptionKey)}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {t('settings.placeholders.comingSoon')}
      </CardContent>
    </Card>
  );
}

export function ThemeSettingsPlaceholderTab({ distributionState }: SettingsTabComponentProps) {
  return (
    <SettingsPlaceholderTab
      distributionState={distributionState}
      titleKey="settings.themeSettings.title"
      descriptionKey="settings.themeSettings.description"
    />
  );
}

export function AdvancedSettingsPlaceholderTab({ distributionState }: SettingsTabComponentProps) {
  return (
    <SettingsPlaceholderTab
      distributionState={distributionState}
      titleKey="settings.advancedSettings.title"
      descriptionKey="settings.advancedSettings.description"
    />
  );
}
