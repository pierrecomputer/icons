/**
 * Geometry for the layered file-status icons.
 *
 * Instead of shipping one pre-composed SVG per git status, we ship a single
 * file body plus one indicator glyph per status and composite them at render
 * time. The body is masked by SAFE_AREA so the negative-space gap between the
 * document and its indicator is carved out of a single shared shape.
 *
 * All geometry is authored on the same 16x16 grid as the rest of the library.
 */

/** Git status variants that can be layered onto the file body. */
export type FileStatus =
  | 'dot'
  | 'square'
  | 'triangle'
  | 'added'
  | 'deleted'
  | 'modified'
  | 'untracked';

export const FILE_STATUSES: readonly FileStatus[] = [
  'dot',
  'square',
  'triangle',
  'added',
  'deleted',
  'modified',
  'untracked',
];

/** The full document shape, taken verbatim from `svg/IconFile.svg`. */
export const FILE_BODY =
  'M10.75 0C10.9489 0 11.1396 0.0790743 11.2803 0.219727L14.7803 3.71973C14.9209 3.86038 15 4.05109 15 4.25V13.25C15 14.7688 13.7688 16 12.25 16H3.75C2.23122 16 1 14.7688 1 13.25V2.75C1 1.23122 2.23122 0 3.75 0H10.75ZM3.75 1.5C3.05964 1.5 2.5 2.05964 2.5 2.75V13.25C2.5 13.9404 3.05964 14.5 3.75 14.5H12.25C12.9404 14.5 13.5 13.9404 13.5 13.25V5H12.25C11.0074 5 10 3.99264 10 2.75V1.5H3.75Z';

/**
 * Clearance kept between the document edge and the indicator, in grid units.
 *
 * The pre-composed originals all cut the body to exactly this distance from
 * the indicator's outline rather than to a shared rectangle:
 * `IconFileStatusDot` notches a circle of radius 5 around a radius 3 dot, and
 * the diagonal cut in `IconFileStatusA` sits 2 units off the letter's stem.
 *
 * In other words the notch is the indicator outset by 2, which is what you get
 * by stroking the glyph at twice this width. That reproduces the hand-tuned
 * geometry per overlay without storing a second path for each one, and any
 * future overlay gets the same treatment for free. Rasterized at 20x, every
 * status but `untracked` comes out pixel-identical to its original, and that
 * one differs only by the nudge below.
 */
export const INDICATOR_CLEARANCE = 2;

export interface IndicatorPath {
  d: string;
  fillRule?: 'evenodd';
  transform?: string;
}

/**
 * Indicator glyphs, lifted from the second `<path>` of each
 * `svg/IconFileStatus*.svg`.
 */
export const INDICATORS: Record<FileStatus, IndicatorPath> = {
  dot: {
    d: 'M16 13C16 14.6569 14.6569 16 13 16C11.3431 16 10 14.6569 10 13C10 11.3431 11.3431 10 13 10C14.6569 10 16 11.3431 16 13Z',
  },
  square: {
    d: 'M13 10C10.5295 10 10 10.5295 10 13C10 15.4705 10.5295 16 13 16C15.4705 16 16 15.4705 16 13C16 10.5295 15.4705 10 13 10Z',
  },
  triangle: {
    d: 'M15.9613 15.0032C16.3238 14.3409 14.0444 10 12.9987 10C11.9531 10 9.68754 14.3409 10.0361 15.0032C10.3846 15.6656 15.5989 15.6656 15.9613 15.0032Z',
    fillRule: 'evenodd',
  },
  added: {
    d: 'M11.1904 16H9.58887L11.7373 9.33496H13.6904L15.8291 16H14.125L13.6904 14.4619H11.625L11.1904 16ZM12.7041 10.7705H12.6309L11.9229 13.3047H13.4023L12.7041 10.7705Z',
  },
  deleted: {
    d: 'M9.93066 9.33496H12.543C14.623 9.33496 15.5557 10.585 15.5557 12.6406C15.5557 14.7207 14.5986 16 12.543 16H9.93066V9.33496ZM11.5371 10.6045V14.7256H12.2891C13.4268 14.7256 13.9102 14.0469 13.9102 12.6797C13.9102 11.3076 13.4219 10.6045 12.2891 10.6045H11.5371Z',
  },
  modified: {
    d: 'M9.8623 16H8.43652V9.33496H10.0918L11.8057 13.1338H11.8594L13.5732 9.33496H15.2188V16H13.7734V11.8447H13.6953L12.2939 14.999H11.3516L9.93555 11.8447H9.8623V16Z',
  },
  untracked: {
    // Authored on a 16x17 grid so the round bottom could overshoot the
    // baseline; nudged back onto the 16x16 grid so it is not clipped.
    d: 'M12.499 14.7842C13.2021 14.7842 13.6904 14.3496 13.6904 13.5098V9.33496H15.292V13.6953C15.292 15.165 14.2129 16.1221 12.499 16.1221C10.79 16.1221 9.71094 15.165 9.71094 13.6953V9.33496H11.3125V13.5098C11.3125 14.3594 11.7959 14.7842 12.499 14.7842Z',
    transform: 'translate(0 -0.1221)',
  },
};

/**
 * Default indicator color per status. Shape indicators stay neutral so they
 * inherit whatever the body uses; the letterforms carry semantic meaning.
 *
 * The pairings are not invented here — they follow the `gitDecoration.*` keys
 * in the open-source Pierre themes (`@pierre/theme`), which is what tints a
 * changed file everywhere else, so an icon agrees with the row beside it.
 * That means modified is blue rather than yellow, and untracked shares the
 * added green, exactly as the editor renders them.
 */
export const STATUS_COLORS: Record<FileStatus, string> = {
  dot: 'currentcolor',
  square: 'currentcolor',
  triangle: 'currentcolor',
  added: 'green',
  deleted: 'red',
  modified: 'blue',
  untracked: 'green',
};
