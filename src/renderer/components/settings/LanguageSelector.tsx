import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RootState, AppDispatch } from '@/store';
import { selectCurrentLanguage, selectAvailableLanguages } from '@/store/slices/i18nSlice';
import { changeLanguage } from '@/store/thunks/i18nThunks';

export const LanguageSelector: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const dispatch = useDispatch<AppDispatch>();
  const currentLanguage = useSelector(selectCurrentLanguage);
  const availableLanguages = useSelector(selectAvailableLanguages);

  const handleLanguageChange = (languageCode: string) => {
    dispatch(changeLanguage(languageCode));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="language-selector">
        {t('settings.language.label')}
      </Label>
      <Select
        value={currentLanguage}
        onValueChange={handleLanguageChange}
      >
        <SelectTrigger id="language-selector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableLanguages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="mr-2">{lang.flag}</span>
              <span>{lang.nativeName}</span>
              <span className="text-muted-foreground ml-2">
                ({lang.name})
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
