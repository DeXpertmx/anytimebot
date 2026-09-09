'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Anytimebot brand logo that adapts to the active theme.
 *
 * The default PNG is teal + black text, which disappears on dark
 * backgrounds. In dark mode we swap to the pre-generated light
 * variants (white wordmark, brightened mark) served from /public.
 *
 * Two usage shapes:
 *  - fill: parent must be `relative` and sized; the image uses `fill`.
 *  - fixed: pass `width`/`height` and the wrapper keeps those intrinsic
 *    dimensions (legacy usages that sized the <img> directly).
 */
type BrandLogoProps = {
  className?: string;
  alt?: string;
  priority?: boolean;
  fill?: true;
  width?: number;
  height?: number;
  unoptimized?: boolean;
};

export function BrandLogo({
  className,
  alt = 'Anytimebot',
  priority,
  fill,
  width,
  height,
  unoptimized,
}: BrandLogoProps) {
  if (fill) {
    return (
      <>
        <Image
          src="/anytimebot-logo.png"
          alt={alt}
          fill
          className={cn('object-contain dark:hidden', className)}
          priority={priority}
          unoptimized={unoptimized}
        />
        <Image
          src="/anytimebot-logo-light.png"
          alt={alt}
          fill
          className={cn('object-contain hidden dark:block', className)}
          priority={priority}
          unoptimized={unoptimized}
        />
      </>
    );
  }

  return (
    <span className="relative inline-block align-middle" style={{ width, height }}>
      <Image
        src="/anytimebot-logo.png"
        alt={alt}
        width={width}
        height={height}
        className={cn('object-contain dark:hidden', className)}
        priority={priority}
        unoptimized={unoptimized}
      />
      <Image
        src="/anytimebot-logo-light.png"
        alt={alt}
        width={width}
        height={height}
        className={cn('object-contain absolute inset-0 hidden dark:block', className)}
        priority={priority}
        unoptimized={unoptimized}
      />
    </span>
  );
}

/** Square brand mark (icon only), also theme-adaptive. */
export function BrandIcon({
  className,
  alt = 'Anytimebot',
  priority,
  fill,
  width,
  height,
  unoptimized,
}: BrandLogoProps) {
  if (fill) {
    return (
      <>
        <Image
          src="/Anytimebot-icon.png"
          alt={alt}
          fill
          className={cn('object-contain dark:hidden', className)}
          priority={priority}
          unoptimized={unoptimized}
        />
        <Image
          src="/anytimebot-icon-light.png"
          alt={alt}
          fill
          className={cn('object-contain hidden dark:block', className)}
          priority={priority}
          unoptimized={unoptimized}
        />
      </>
    );
  }

  return (
    <span className="relative inline-block align-middle" style={{ width, height }}>
      <Image
        src="/Anytimebot-icon.png"
        alt={alt}
        width={width}
        height={height}
        className={cn('object-contain dark:hidden', className)}
        priority={priority}
        unoptimized={unoptimized}
      />
      <Image
        src="/anytimebot-icon-light.png"
        alt={alt}
        width={width}
        height={height}
        className={cn('object-contain absolute inset-0 hidden dark:block', className)}
        priority={priority}
        unoptimized={unoptimized}
      />
    </span>
  );
}
