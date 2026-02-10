import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  selectRSSFeedItems,
  selectRSSFeedLoading,
  selectRSSFeedError,
  selectRSSFeedLastUpdate,
  type RSSFeedItem,
} from '../store/slices/rssFeedSlice';
import {
  fetchFeedItemsAction,
  refreshFeedAction,
} from '../store/sagas/rssFeedSaga';
import { RootState, AppDispatch } from '../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Newspaper, ExternalLink, Clock } from 'lucide-react';

const BlogFeedCard: React.FC = () => {
  const { t, i18n } = useTranslation(['components', 'common']);
  const dispatch = useDispatch<AppDispatch>();

  const items = useSelector((state: RootState) => selectRSSFeedItems(state));
  const loading = useSelector(selectRSSFeedLoading);
  const error = useSelector(selectRSSFeedError);
  const lastUpdate = useSelector(selectRSSFeedLastUpdate);

  // Load feed items on mount
  useEffect(() => {
    if (items.length === 0) {
      dispatch(fetchFeedItemsAction());
    }
  }, [dispatch, items.length]);

  // Handle refresh button click
  const handleRefresh = () => {
    dispatch(refreshFeedAction());
  };

  // Handle article click - open in browser
  const handleArticleClick = (link: string) => {
    window.electronAPI.openExternal(link);
  };

  // Format date based on current language
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const locale = i18n.language === 'zh-CN' ? zhCN : undefined;
      return format(date, 'yyyy-MM-dd', { locale });
    } catch {
      return dateString;
    }
  };

  // Format last update time
  const formatLastUpdate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      const locale = i18n.language === 'zh-CN' ? zhCN : undefined;
      return format(date, 'yyyy-MM-dd HH:mm', { locale });
    } catch {
      return dateString;
    }
  };

  // Strip HTML from description
  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  // Get truncated description
  const getTruncatedDescription = (description: string, maxLength: number = 100) => {
    const text = stripHtml(description);
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  // Display items (max 5)
  const displayItems = items.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Newspaper className="w-5 h-5 text-primary" />
              </motion.div>
              <CardTitle className="text-lg">
                {t('blogFeed.title', 'Hagicode 博客')}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="h-8 gap-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {t('blogFeed.refresh', '刷新')}
              </span>
            </Button>
          </div>
          {lastUpdate && (
            <CardDescription className="flex items-center gap-1 text-xs">
              <Clock className="w-3 h-3" />
              {t('blogFeed.lastUpdate', '最后更新：{{date}}', {
                date: formatLastUpdate(lastUpdate),
              })}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">
                {t('blogFeed.error', '加载失败，请稍后重试')}
              </p>
              <p className="text-xs text-destructive/70 mt-1">{error}</p>
            </motion.div>
          )}

          {!loading && !error && displayItems.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Newspaper className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {t('blogFeed.noArticles', '暂无文章')}
              </p>
            </div>
          )}

          {loading && displayItems.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">
                {t('blogFeed.loading', '加载中...')}
              </span>
            </div>
          )}

          {displayItems.map((item, index) => (
            <motion.article
              key={item.guid || item.link}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group"
            >
              <div
                onClick={() => handleArticleClick(item.link)}
                className="p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/5 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {getTruncatedDescription(item.description)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {formatDate(item.pubDate)}
                      </Badge>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                </div>
              </div>
            </motion.article>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default BlogFeedCard;
