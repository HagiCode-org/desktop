import { useDispatch } from 'react-redux';
import { switchView } from '../store/slices/viewSlice';
import type { ViewType } from '../store/slices/viewSlice';

/**
 * useNavigate Hook
 *
 * 提供页面导航功能的自定义 Hook，
 * 用于在不同视图之间切换。
 */
export function useNavigate() {
  const dispatch = useDispatch();

  const navigateTo = (view: ViewType) => {
    dispatch(switchView(view));
  };

  return {
    navigateTo,
  };
}
