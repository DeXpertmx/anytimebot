
/**
 * Lazy Loading Helper
 * Use this for heavy components that don't need to be loaded immediately
 * 
 * Example usage:
 * const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
 *   loading: LoadingFallback,
 *   ssr: false
 * });
 */

import dynamic from 'next/dynamic';

// Loading fallback component
export function LoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

// Export dynamic for easy reuse
export { dynamic };
