import { Card, CardHeader } from '../../components/ui/Card';
import type { HtmlCard as HtmlCardData } from '../../../shared/appearance';

/**
 * The user's own HTML in a sandboxed frame: scripts may run, but without allow-same-origin the
 * frame cannot read the app, its cookies or its data.
 */
export function HtmlCard({ card }: { card: HtmlCardData }) {
  return (
    <Card className="overflow-hidden">
      {card.title && <CardHeader title={card.title} />}
      <iframe title={card.title || card.id} sandbox="allow-scripts" srcDoc={card.html} className="block w-full border-0 bg-transparent" style={{ height: card.height }} />
    </Card>
  );
}
