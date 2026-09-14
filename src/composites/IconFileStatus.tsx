import { useId } from 'react';

import { Colors, type IconProps } from '../types';

import {
  FILE_BODY,
  type FileStatus,
  INDICATORS,
  INDICATOR_CLEARANCE,
  STATUS_COLORS,
} from './fileStatusPaths';

export interface IconFileStatusProps extends IconProps {
  /** Which git status indicator to layer onto the file. */
  status: FileStatus;

  /**
   * Color of the status indicator, independent of the file body.
   * Defaults to a semantic color per status.
   */
  statusColor?: string;

  /** Renders the masked-out clearance, for inspecting the notch geometry. */
  debugSafeArea?: boolean;
}

/**
 * A file icon composed from a shared body plus a status indicator layer.
 *
 * Each indicator cuts its own notch out of the body, so the two layers never
 * touch and can be colored independently.
 */
export function IconFileStatus({
  status,
  size = 16,
  color = 'currentcolor',
  statusColor,
  debugSafeArea = false,
  style,
  className,
  ...props
}: IconFileStatusProps) {
  // Colons from useId are unsafe inside a url(#...) reference.
  const maskId = `pi-file-status-${useId().replace(/:/g, '')}`;
  const height = size;
  const width = size === '1em' ? '1em' : Number(size) * 1;

  const indicator = INDICATORS[status];
  const resolvedStatusColor = statusColor ?? STATUS_COLORS[status];

  // Stroking the glyph at twice the clearance offsets its outline by exactly
  // that much, so each indicator carves a notch shaped like itself. A miter
  // join reproduces the corners the pre-composed originals were drawn with.
  const notch = {
    d: indicator.d,
    fillRule: indicator.fillRule,
    transform: indicator.transform,
    strokeWidth: INDICATOR_CLEARANCE * 2,
    strokeLinejoin: 'miter',
    strokeMiterlimit: 10,
  } as const;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={width}
      height={height}
      style={style}
      className={`pi${className != null ? ` ${className}` : ``}`}
      {...props}
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={16}
        height={16}
      >
        <rect width={16} height={16} fill="white" />
        <path {...notch} fill="black" stroke="black" />
      </mask>
      {debugSafeArea && (
        <path
          {...notch}
          fill="currentcolor"
          stroke="currentcolor"
          opacity={0.15}
        />
      )}
      <path
        d={FILE_BODY}
        fill={Colors[color] ?? color}
        mask={`url(#${maskId})`}
      />
      <path
        d={indicator.d}
        fillRule={indicator.fillRule}
        transform={indicator.transform}
        fill={Colors[resolvedStatusColor] ?? resolvedStatusColor}
      />
    </svg>
  );
}
