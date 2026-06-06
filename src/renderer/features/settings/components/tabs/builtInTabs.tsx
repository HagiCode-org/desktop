import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSelector } from '@/components/settings';
import { DependencyManagementModeSettings } from '@/components/settings/DependencyManagementModeSettings';
import { DebugOptionsSettings } from '@/components/settings/DebugOptionsSettings';
import { OnboardingSettings } from '@/components/settings/OnboardingSettings';
import { RuntimeDataPathSettings } from '@/components/settings/RuntimeDataPathSettings';
import { SharingAccelerationSettings } from '@/components/settings/SharingAccelerationSettings';
import { VersionUpdateSettings } from '@/components/settings/VersionUpdateSettings';
import type { SettingsTabComponentProps } from '../../types';

export function OnboardingSettingsTab() {
  return <OnboardingSettings />;
}

export function DependencyManagementSettingsTab() {
  return <DependencyManagementModeSettings />;
}

export function VersionUpdateSettingsTab({ distributionState }: SettingsTabComponentProps) {
  return <VersionUpdateSettings distributionState={distributionState} />;
}

export function RuntimeDataSettingsTab() {
  return <RuntimeDataPathSettings />;
}

export function DebugOptionsSettingsTab() {
  return <DebugOptionsSettings />;
}

export function SharingAccelerationSettingsTab({ distributionState }: SettingsTabComponentProps) {
  return <SharingAccelerationSettings distributionState={distributionState} />;
}

export function LanguageSettingsTab() {
  const { t } = useTranslation('pages');

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          <CardTitle>{t('settings.languageSettings.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.languageSettings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LanguageSelector />
        <p className="text-sm text-muted-foreground">{t('settings.languageSettings.helper')}</p>
      </CardContent>
    </Card>
  );
}
