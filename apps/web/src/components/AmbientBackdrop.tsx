import type { SettingsDocument } from '@mindfull/domain';
import { type CSSProperties, useMemo } from 'react';

import styles from './AmbientBackdrop.module.css';

type AmbientBackdropProps = {
  mode: SettingsDocument['payload']['ambience'];
  period: 'morning' | 'evening';
};

const waveSpeedRanges = [
  [9, 11],
  [12, 15],
  [10, 13],
  [13, 16],
] as const;

const directionPatterns = [
  ['alternate', 'alternate-reverse', 'alternate', 'alternate-reverse'],
  ['alternate-reverse', 'alternate', 'alternate-reverse', 'alternate'],
  ['alternate', 'alternate-reverse', 'alternate-reverse', 'alternate'],
  ['alternate-reverse', 'alternate', 'alternate', 'alternate-reverse'],
  ['alternate', 'alternate', 'alternate-reverse', 'alternate-reverse'],
  ['alternate-reverse', 'alternate-reverse', 'alternate', 'alternate'],
] as const;

const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * (maximum - minimum);

const createWaveMotion = (): CSSProperties[] => {
  const pattern =
    directionPatterns[Math.floor(Math.random() * directionPatterns.length)] ??
    directionPatterns[0];

  return waveSpeedRanges.map(([minimum, maximum], index) => ({
    animationDirection: pattern[index],
    animationDuration: `${randomBetween(minimum, maximum).toFixed(1)}s`,
  }));
};

export function AmbientBackdrop({ mode, period }: AmbientBackdropProps) {
  const waveMotion = useMemo(createWaveMotion, []);

  if (mode === 'off') return null;

  return (
    <div
      className={styles.backdrop}
      data-motion={mode}
      data-period={period}
      aria-hidden="true"
    >
      <svg
        className={styles.artwork}
        viewBox="0 0 900 600"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <title>Ambient layered waves</title>
        <g className={styles.waves}>
          <g
            className={`${styles.waveBand} ${styles.waveBandOne}`}
            style={waveMotion[0]}
          >
            <path
              data-wave="1"
              d="M0 383L11.5 389.3C23 395.7 46 408.3 69 406.7C92 405 115 389 138.2 388.5C161.3 388 184.7 403 207.8 408C231 413 254 408 277 410C300 412 323 421 346 422.2C369 423.3 392 416.7 415.2 411.2C438.3 405.7 461.7 401.3 484.8 396.3C508 391.3 531 385.7 554 391.7C577 397.7 600 415.3 623 411.8C646 408.3 669 383.7 692.2 380.8C715.3 378 738.7 397 761.8 395.8C785 394.7 808 373.3 831 364C854 354.7 877 357.3 888.5 358.7L900 360L900 601L0 601Z"
            />
            <path
              data-wave="2"
              d="M0 383L11.5 384C23 385 46 387 69 388.8C92 390.7 115 392.3 138.2 403.3C161.3 414.3 184.7 434.7 207.8 432.5C231 430.3 254 405.7 277 397.7C300 389.7 323 398.3 346 410.8C369 423.3 392 439.7 415.2 441.2C438.3 442.7 461.7 429.3 484.8 423.7C508 418 531 420 554 424.2C577 428.3 600 434.7 623 436.2C646 437.7 669 434.3 692.2 429.2C715.3 424 738.7 417 761.8 419C785 421 808 432 831 427.2C854 422.3 877 401.7 888.5 391.3L900 381L900 601L0 601Z"
            />
          </g>
          <g
            className={`${styles.waveBand} ${styles.waveBandTwo}`}
            style={waveMotion[1]}
          >
            <path
              data-wave="3"
              d="M0 431L11.5 430.2C23 429.3 46 427.7 69 424.3C92 421 115 416 138.2 413.5C161.3 411 184.7 411 207.8 420.2C231 429.3 254 447.7 277 456.5C300 465.3 323 464.7 346 457C369 449.3 392 434.7 415.2 434C438.3 433.3 461.7 446.7 484.8 454.8C508 463 531 466 554 462.7C577 459.3 600 449.7 623 448.8C646 448 669 456 692.2 459.5C715.3 463 738.7 462 761.8 459.2C785 456.3 808 451.7 831 450.8C854 450 877 453 888.5 454.5L900 456L900 601L0 601Z"
            />
            <path
              data-wave="4"
              d="M0 479L11.5 474C23 469 46 459 69 459.7C92 460.3 115 471.7 138.2 479.7C161.3 487.7 184.7 492.3 207.8 492C231 491.7 254 486.3 277 485.8C300 485.3 323 489.7 346 481.7C369 473.7 392 453.3 415.2 453.3C438.3 453.3 461.7 473.7 484.8 473.7C508 473.7 531 453.3 554 448.8C577 444.3 600 455.7 623 465.3C646 475 669 483 692.2 487C715.3 491 738.7 491 761.8 487.7C785 484.3 808 477.7 831 469.8C854 462 877 453 888.5 448.5L900 444L900 601L0 601Z"
            />
          </g>
          <g
            className={`${styles.waveBand} ${styles.waveBandThree}`}
            style={waveMotion[2]}
          >
            <path
              data-wave="5"
              d="M0 506L11.5 505.5C23 505 46 504 69 499.5C92 495 115 487 138.2 486.5C161.3 486 184.7 493 207.8 491.8C231 490.7 254 481.3 277 480.7C300 480 323 488 346 486.3C369 484.7 392 473.3 415.2 474.3C438.3 475.3 461.7 488.7 484.8 491C508 493.3 531 484.7 554 484.5C577 484.3 600 492.7 623 498.2C646 503.7 669 506.3 692.2 506C715.3 505.7 738.7 502.3 761.8 497C785 491.7 808 484.3 831 486C854 487.7 877 498.3 888.5 503.7L900 509L900 601L0 601Z"
            />
            <path
              data-wave="6"
              d="M0 521L11.5 516.3C23 511.7 46 502.3 69 501.8C92 501.3 115 509.7 138.2 517C161.3 524.3 184.7 530.7 207.8 534C231 537.3 254 537.7 277 533.2C300 528.7 323 519.3 346 516.7C369 514 392 518 415.2 515.7C438.3 513.3 461.7 504.7 484.8 506.5C508 508.3 531 520.7 554 522.5C577 524.3 600 515.7 623 509.7C646 503.7 669 500.3 692.2 498.2C715.3 496 738.7 495 761.8 501C785 507 808 520 831 522.3C854 524.7 877 516.3 888.5 512.2L900 508L900 601L0 601Z"
            />
          </g>
          <g
            className={`${styles.waveBand} ${styles.waveBandFour}`}
            style={waveMotion[3]}
          >
            <path
              data-wave="7"
              d="M0 529L11.5 528C23 527 46 525 69 526.2C92 527.3 115 531.7 138.2 533.3C161.3 535 184.7 534 207.8 532C231 530 254 527 277 530.3C300 533.7 323 543.3 346 543.7C369 544 392 535 415.2 535.2C438.3 535.3 461.7 544.7 484.8 549.3C508 554 531 554 554 552.2C577 550.3 600 546.7 623 547C646 547.3 669 551.7 692.2 551.5C715.3 551.3 738.7 546.7 761.8 544.7C785 542.7 808 543.3 831 544.7C854 546 877 548 888.5 549L900 550L900 601L0 601Z"
            />
            <path
              data-wave="8"
              d="M0 556L11.5 554.8C23 553.7 46 551.3 69 554C92 556.7 115 564.3 138.2 569.8C161.3 575.3 184.7 578.7 207.8 579.2C231 579.7 254 577.3 277 573.2C300 569 323 563 346 562.7C369 562.3 392 567.7 415.2 567.7C438.3 567.7 461.7 562.3 484.8 563.7C508 565 531 573 554 575.2C577 577.3 600 573.7 623 573.5C646 573.3 669 576.7 692.2 574.7C715.3 572.7 738.7 565.3 761.8 561C785 556.7 808 555.3 831 557C854 558.7 877 563.3 888.5 565.7L900 568L900 601L0 601Z"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
