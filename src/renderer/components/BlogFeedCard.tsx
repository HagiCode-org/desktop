import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  selectRSSFeedItems,
  selectRSSFeedLoading,
  selectRSSFeedError,
  selectRSSFeedLastUpdate,
} from '../store/slices/rssFeedSlice';
import {
  fetchFeedItems,
  refreshFeed,
  refreshFeedForLanguageChange,
} from '../store/thunks/rssFeedThunks';
import { RootState, AppDispatch } from '../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Newspaper, ExternalLink, Clock, Rss } from 'lucide-react';
import { resolveDesktopLanguageCode } from '../../shared/desktop-languages';
import { resolveRSSFeedUrl } from '../../shared/rss-feed-url';

const BlogFeedCard: React.FC = () => {
  const { t, i18n } = useTranslation(['components', 'common']);
  const dispatch = useDispatch<AppDispatch>();
  const activeLanguage = resolveDesktopLanguageCode(i18n.resolvedLanguage ?? i18n.language);
  const previousLanguageRef = useRef<string | null>(null);

  const items = useSelector((state: RootState) => selectRSSFeedItems(state));
  const loading = useSelector(selectRSSFeedLoading);
  const error = useSelector(selectRSSFeedError);
  const lastUpdate = useSelector(selectRSSFeedLastUpdate);

  // Load feed items on first mount.
  useEffect(() => {
    if (items.length === 0) {
      dispatch(fetchFeedItems());
    }
  }, [dispatch, items.length]);

  useEffect(() => {
    if (!activeLanguage) {
      return;
    }

    if (previousLanguageRef.current === null) {
      previousLanguageRef.current = activeLanguage;
      return;
    }

    if (previousLanguageRef.current !== activeLanguage) {
      previousLanguageRef.current = activeLanguage;
      dispatch(refreshFeedForLanguageChange(activeLanguage));
    }
  }, [activeLanguage, dispatch]);

  // Handle refresh button click
  const handleRefresh = () => {
    dispatch(refreshFeed());
  };

  const handleOpenRss = async () => {
    const result = await window.electronAPI.openExternal(resolveRSSFeedUrl(activeLanguage));
    if (!result.success) {
      toast.error(result.error || t('blogFeed.openRssFailed', '无法打开 RSS 链接'));
    }
  };

  // Handle article click - open in browser
  const handleArticleClick = async (link: string) => {
    const result = await window.electronAPI.openExternal(link);
    if (!result.success) {
      toast.error(result.error || t('blogFeed.openRssFailed', '无法打开 RSS 链接'));
    }
  };

  // Format date based on current language
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(activeLanguage, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Format last update time
  const formatLastUpdate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleString(activeLanguage, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
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
  const featuredItem = displayItems[0] ?? null;
  const secondaryItems = displayItems.slice(1, 5);

  const getItemLabel = (index: number) => {
    if (index === 0) {
      return t('blogFeed.labels.recommended', 'Recommended');
    }

    if (index === 1) {
      return t('blogFeed.labels.updates', 'Updates');
    }

    return t('blogFeed.labels.news', 'News');
  };

  return (
    <div>
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/35 text-primary">
                <Newspaper className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base leading-6">
                  {t('blogFeed.title', 'Hagicode Recommendations & Updates')}
                </CardTitle>
                <CardDescription className="mt-1 max-w-md text-sm leading-6">
                  {t('blogFeed.description', 'Review official recommendations and update notes without leaving the control console.')}
                </CardDescription>
                {lastUpdate && (
                  <CardDescription className="mt-2 flex items-center gap-1.5 text-xs">
                    <Clock className="h-3 w-3" />
                    {t('blogFeed.lastUpdate', '最后更新：{{date}}', {
                      date: formatLastUpdate(lastUpdate),
                    })}
                  </CardDescription>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleOpenRss()}
                className="h-8 gap-1.5"
              >
                <Rss className="h-3.5 w-3.5" />
                <span>{t('blogFeed.openRss', 'RSS')}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                className="h-8 gap-1.5 px-2 text-muted-foreground"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {t('blogFeed.refresh', '刷新')}
                </span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                {t('blogFeed.error', '加载失败，请稍后重试')}
              </p>
              <p className="mt-1 text-xs text-destructive/70">{error}</p>
            </div>
          )}

          {!loading && !error && displayItems.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <Newspaper className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p className="text-sm">
                {t('blogFeed.noArticles', '暂无文章')}
              </p>
            </div>
          )}

          {loading && displayItems.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">
                {t('blogFeed.loading', '加载中...')}
              </span>
            </div>
          )}

          {featuredItem ? (
            <section className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                  {getItemLabel(0)}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(featuredItem.pubDate)}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold leading-6 text-foreground sm:text-base">
                {featuredItem.title}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {getTruncatedDescription(featuredItem.description, 180)}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="text-xs text-muted-foreground">{t('blogFeed.actions.openFeed', 'Open feed')}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleArticleClick(featuredItem.link)} className="gap-1.5">
                  {t('blogFeed.actions.readArticle', 'Read article')}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </section>
          ) : null}

          {secondaryItems.length > 0 ? (
            <div className="space-y-3">
              {secondaryItems.map((item, index) => (
                <article
                  key={item.guid || item.link}
                  className="group rounded-xl border border-border/70 bg-background/70 p-3 transition-colors hover:border-border hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getItemLabel(index + 1)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(item.pubDate)}</span>
                      </div>
                      <h4 className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-foreground">
                        {item.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {getTruncatedDescription(item.description, 110)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleArticleClick(item.link)}
                      className="mt-0.5 h-8 px-2 text-muted-foreground group-hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default BlogFeedCard;
