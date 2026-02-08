import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Github, Eye, EyeOff, X } from 'lucide-react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import {
  setGithubOwner,
  setGithubRepo,
  setGithubToken,
} from '../store/slices/packageSourceSlice';

export function GitHubConfigForm() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const githubOwner = useSelector((state: RootState) => state.packageSource.githubOwner);
  const githubRepo = useSelector((state: RootState) => state.packageSource.githubRepo);
  const githubToken = useSelector((state: RootState) => state.packageSource.githubToken);

  const [showToken, setShowToken] = useState(false);

  const handleClearToken = () => {
    dispatch(setGithubToken(''));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="github-owner">
          {t('packageSource.github.owner.label')}
        </Label>
        <Input
          id="github-owner"
          type="text"
          value={githubOwner}
          onChange={(e) => dispatch(setGithubOwner(e.target.value))}
          placeholder={t('packageSource.github.owner.placeholder')}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="github-repo">
          {t('packageSource.github.repository.label')}
        </Label>
        <Input
          id="github-repo"
          type="text"
          value={githubRepo}
          onChange={(e) => dispatch(setGithubRepo(e.target.value))}
          placeholder={t('packageSource.github.repository.placeholder')}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="github-token" className="flex items-center gap-2">
          {t('packageSource.github.token.label')}
          <Github className="h-4 w-4 text-muted-foreground" />
        </Label>
        <div className="relative">
          <Input
            id="github-token"
            type={showToken ? 'text' : 'password'}
            value={githubToken}
            onChange={(e) => dispatch(setGithubToken(e.target.value))}
            placeholder={t('packageSource.github.token.placeholder')}
            className="font-mono text-sm pr-20"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            {githubToken && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleClearToken}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('packageSource.github.token.hint')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('packageSource.github.token.rateLimitHint')}
        </p>
      </div>
    </div>
  );
}
