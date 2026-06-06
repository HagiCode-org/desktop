import { BellRing, CheckCircle2, ExternalLink, LoaderCircle, MousePointerClick, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppDispatch, RootState } from '@/store';
import {
  buildTestNotificationParams,
  sendTestNotification,
  selectNotificationClickedPayload,
  selectNotificationPreview,
  selectNotificationSendError,
  selectNotificationSendStatus,
  selectNotificationShownPayload,
} from '@/store/slices/settingsSlice';

export function NotificationTab() {
  const { t } = useTranslation('pages');
  const dispatch = useDispatch<AppDispatch>();
  const sendStatus = useSelector((state: RootState) => selectNotificationSendStatus(state));
  const sendError = useSelector((state: RootState) => selectNotificationSendError(state));
  const shownPayload = useSelector((state: RootState) => selectNotificationShownPayload(state));
  const clickedPayload = useSelector((state: RootState) => selectNotificationClickedPayload(state));
  const preview = useSelector((state: RootState) => selectNotificationPreview(state));
  const previewRows = useMemo(() => ([
    { key: 'title', value: preview.title },
    { key: 'body', value: preview.body },
    { key: 'level', value: preview.level },
    {
      key: 'clickAction',
      value: preview.clickAction.type === 'open-url'
        ? `${t('settings.notification.values.openUrl')}: ${preview.clickAction.url}`
        : t('settings.notification.values.focusWindow'),
    },
    { key: 'duration', value: preview.duration === 0 ? '0' : String(preview.duration) },
    { key: 'silent', value: preview.silent ? 'true' : 'false' },
  ]), [preview, t]);

  const handleSend = async () => {
    await dispatch(sendTestNotification(buildTestNotificationParams())).unwrap().catch(() => undefined);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5" />
            <CardTitle>{t('settings.notification.title')}</CardTitle>
          </div>
          <CardDescription>{t('settings.notification.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium text-foreground">{t('settings.notification.testSectionTitle')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.notification.testSectionDescription')}</p>
              </div>
              <Button type="button" onClick={() => void handleSend()} disabled={sendStatus === 'sending'}>
                {sendStatus === 'sending' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {sendStatus === 'sending' ? t('settings.notification.sending') : t('settings.notification.testButton')}
              </Button>
            </div>
          </div>

          {sendStatus === 'success' ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>{t('settings.notification.testSuccess')}</AlertTitle>
              <AlertDescription>{t('settings.notification.testSuccessDescription')}</AlertDescription>
            </Alert>
          ) : null}

          {sendStatus === 'error' ? (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>{t('settings.notification.testError')}</AlertTitle>
              <AlertDescription>
                {t('settings.notification.testErrorDescription', { error: sendError ?? t('status.error') })}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ExternalLink className="h-4 w-4" />
                {t('settings.notification.eventShown')}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {shownPayload
                  ? t('settings.notification.eventShownValue', { id: shownPayload.notificationId, transport: shownPayload.transport })
                  : t('settings.notification.eventPending')}
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MousePointerClick className="h-4 w-4" />
                {t('settings.notification.eventClicked')}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {clickedPayload
                  ? t('settings.notification.eventClickedValue', {
                    id: clickedPayload.notificationId,
                    action: clickedPayload.actionType,
                    transport: clickedPayload.transport,
                  })
                  : t('settings.notification.eventPending')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.notification.previewTitle')}</CardTitle>
          <CardDescription>{t('settings.notification.previewDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {previewRows.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-3 py-2">
              <span className="text-sm text-muted-foreground">{t(`settings.notification.fields.${row.key}`)}</span>
              <Badge variant="outline" className="max-w-[60%] break-all text-right font-normal">{row.value}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
