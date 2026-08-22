import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

/**
 * Figma `decisions · loading` (412:2922) drew this as a skeleton of the queue.
 * It is a centred spinner now: the skeleton promised a shape the queue may not
 * have -- two cards, one row -- and the wait here is a single query with no
 * denominator to lay out against. The sentence still says which query.
 *
 * Three different things, three different screens: this is not the empty queue
 * and it is not a store that cannot be reached.
 */
export default function DecisionsLoading() {
  return (
    <>
      <TopBar title="Decisions" status="loading…" />
      <RouteLoader>Reading the queue.</RouteLoader>
    </>
  );
}
