import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderOpen } from 'lucide-react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import type { RootState } from '../store';
import {
  setFolderPath,
  setSelectedSourceType,
} from '../store/slices/packageSourceSlice';
import { useDispatch, useSelector } from 'react-redux';

export function FolderConfigForm() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const folderPath = useSelector((state: RootState) => state.packageSource.folderPath);

  const [browsing, setBrowsing] = useState(false);

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      // Open folder selection dialog
      const result = await window.electronAPI.openDirectoryPicker?.() ||
        await window.electronAPI.showOpenDialog?.({
          properties: ['openDirectory'],
        });

      if (result && !result.canceled && result.filePaths && result.filePaths[0]) {
        dispatch(setFolderPath(result.filePaths[0]));
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="folder-path">
          {t('packageSource.folder.path.label')}
        </Label>
        <div className="flex gap-2">
          <Input
            id="folder-path"
            type="text"
            value={folderPath}
            onChange={(e) => dispatch(setFolderPath(e.target.value))}
            placeholder={t('packageSource.folder.path.placeholder')}
            className="flex-1 font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleBrowse}
            disabled={browsing}
            className="shrink-0"
          >
            {browsing ? (
              <>
                <FolderOpen className="mr-2 h-4 w-4 animate-spin" />
                {t('packageSource.folder.scanning')}
              </>
            ) : (
              <>
                <Folder className="mr-2 h-4 w-4" />
                {t('packageSource.folder.browseButton')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
