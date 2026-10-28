import { AttendanceMotion } from './AttendanceMotion';
import { GrowthMotion } from './GrowthMotion';
import { MapPinsMotion } from './MapPinsMotion';
import type { MotionProps } from './motion';

export { AnimatedLogo } from './AnimatedLogo';
export { ConfirmedMotion } from './ConfirmedMotion';
export { JoinedMotion } from './JoinedMotion';
export { Logo } from './Logo';
export { LogoMark, type MarkVariant } from './LogoMark';
export type { MotionProps } from './motion';
export { RecordedMotion } from './RecordedMotion';
export { AttendanceMotion, GrowthMotion, MapPinsMotion };

// One graphic per onboarding slide, in the order of s.onboarding.slides.
export const onboardingMotions = [MapPinsMotion, AttendanceMotion, GrowthMotion] as const;

// Drop-in for the onboarding screen: <OnboardingArt index={i} />.
// Pass active={false} for slides that are mounted but off screen (a pager),
// so each one plays when it arrives.
export function OnboardingArt({ index, active = true, ...rest }: MotionProps & { index: number; active?: boolean }) {
  const Art = onboardingMotions[index];
  return Art ? <Art key={index} play={active} {...rest} /> : null;
}
