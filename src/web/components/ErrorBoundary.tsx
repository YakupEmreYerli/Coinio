import { AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type Props = {
  children: ReactNode;
  /** `page` fills a route; `card` keeps a dashboard card's footprint. */
  variant?: 'page' | 'card';
  /** When this value changes (for example the route), a shown error is cleared. */
  resetKey?: unknown;
};
type State = { error: Error | null; resetKey: unknown };

/** Catches a render error below it and shows a calm fallback instead of a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return this.props.variant === 'card' ? <CardFallback onRetry={this.reset} /> : <PageFallback error={error} onRetry={this.reset} />;
  }
}

function CardFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <Card role="alert" className="flex min-h-[120px] flex-col items-center justify-center gap-2 px-5 py-6 text-center">
      <p className="text-sm font-medium">{t('error.cardTitle')}</p>
      <Button size="sm" onClick={onRetry}>
        <RotateCcw />
        {t('error.retry')}
      </Button>
    </Card>
  );
}

function PageFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const details = `${error.name}: ${error.message}\n${window.location.pathname}`;
  const copy = () => {
    void navigator.clipboard?.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="px-4 py-10 md:px-9">
      <Card role="alert" className="mx-auto flex max-w-[520px] flex-col gap-4 p-6">
        <div className="grid size-10 place-items-center rounded-full bg-sunk text-text-2 [&_svg]:size-5">
          <AlertTriangle aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-[22px] leading-tight">{t('error.pageTitle')}</h1>
          <p className="mt-1.5 text-sm text-text-2">{t('error.pageBody')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onRetry}>
            {t('error.retry')}
          </Button>
          <Button onClick={() => window.location.reload()}>{t('error.reload')}</Button>
        </div>
        <div className="border-t border-line pt-3">
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 rounded-[6px] text-[13px] text-text-2 hover:text-text">
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden />
            {t('error.details')}
          </button>
          {open && (
            <div className="mt-2 flex flex-col gap-2">
              <pre className="num overflow-x-auto rounded-ctl bg-sunk px-3 py-2 text-[12px] whitespace-pre-wrap text-text-2">{error.message || error.name}</pre>
              <Button size="sm" variant="ghost" className="self-start" onClick={copy}>
                {copied ? t('error.copied') : t('error.copy')}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
