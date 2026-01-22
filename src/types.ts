import type React from 'react';

/**
 * Icon colors mapped to CSS custom properties
 * These can be customized by defining the CSS variables in your application
 */
export type Color = {
  black: string;
  white: string;

  purple: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;

  fg: string;
  fg1: string;
  fg2: string;
  fg3: string;
  fg4: string;

  bg: string;
  border: string;
};

/**
 * Default color values using CSS custom properties
 * Override these by defining the CSS variables in your application
 */
export const Colors: Record<string, string> = {
  currentcolor: 'currentcolor',

  black: 'var(--color-black)',
  white: 'var(--color-white)',

  purple: 'var(--ui-theme-primary-icon)',
  green: 'var(--ui-theme-success-icon)',
  red: 'var(--ui-theme-danger-icon)',
  yellow: 'var(--ui-theme-warning-icon)',
  blue: 'var(--ui-theme-primary-icon)',

  fg: 'var(--color-fg)',
  fg1: 'var(--color-fg1)',
  fg2: 'var(--color-fg2)',
  fg3: 'var(--color-fg3)',
  fg4: 'var(--color-fg4)',

  bg: 'var(--color-bg)',
  border: 'var(--color-border)',
};

/**
 * Props interface for all icon components
 */
export interface IconProps {
  /**
   * Icon size - can be a number (pixels), string with units, or special values
   * @default 16
   */
  size?: 10 | 12 | 16 | 20 | 32 | 48 | '1em' | number | string;

  /**
   * Icon color - can be a key from Colors or any valid CSS color value
   * @default 'currentcolor'
   */
  color?: keyof Color | 'currentcolor' | string;

  /**
   * Additional CSS styles to apply to the SVG element
   */
  style?: React.CSSProperties;

  /**
   * Additional CSS class names to apply to the SVG element
   */
  className?: string;
}
