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

  // Simplified language label mapping for display
  const getSimplifiedLabel = (code: string) => {
    return code === 'zh-CN' ? '中' : 'EN';
  };

  const currentLabel = getSimplifiedLabel(currentLanguage);

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
          <span className="font-medium">{currentLabel}</span>
        </SelectTrigger>
        <SelectContent>
          {availableLanguages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span>{lang.nativeName}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
