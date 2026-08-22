import { Children } from 'react';
import { DURATION } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Children arrive one after another rather than all at once.
 *
 * Worth doing when the list is the thing that just happened -- results
 * landing, a menu opening. Not worth doing on a list that was already there
 * and merely re-rendered, where it reads as the page being slow.
 *
 * `step` is the gap between neighbours, not the total. Ten children at the
 * default 90ms means the last one starts 810ms in, which is already too long;
 * past six or so, drop the step or stagger only the first few.
 */
export function Stagger({
  children,
  step = DURATION.stagger,
  className,
  itemClassName,
}: {
  children: React.ReactNode;
  /** Milliseconds between one child and the next. 80-120 reads well. */
  step?: number;
  /** On the container. */
  className?: string;
  /** On each generated wrapper -- swap `motion-fade-up` for `motion-fade-in` here. */
  itemClassName?: string;
}) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) => (
        // A wrapper rather than cloneElement: cloning has to guess where the
        // child keeps its className and what it does with style, and guesses
        // wrong on anything that is not a plain host element.
        <div
          className={cn('motion-fade-up', itemClassName)}
          style={{ animationDelay: `${i * step}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
