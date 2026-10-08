/** No tour (`TourProvider.tsx`): a spot is just what it wraps. */
import type { ReactNode } from 'react';

export function TourSpot({ children }: { children: ReactNode; [prop: string]: unknown }) {
  return <>{children}</>;
}
