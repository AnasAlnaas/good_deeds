# Brand: logo and motion

The mark is a **map pin with a seedling growing in it**. The pin stands for events on the map, and the seedling for good deeds that grow. The pin is `brandGreen`, the seedling is white, and the mark sits on white or navy (`primary`). The mark never mirrors in RTL.

Open `/brand` (web: `http://localhost:8081/brand`, device: `gooddeeds://brand`) to see everything with a Replay button. [`src/app/brand.tsx`](../../app/brand.tsx) is a dev gallery that no screen links to.

## Where it's used

| Piece | Screen |
|---|---|
| App icon, adaptive icon, splash, favicon | `app.json` → `assets/brand/` |
| `Logo` | top of [`onboarding.tsx`](../../app/onboarding.tsx) |
| `OnboardingArt` | [`onboarding.tsx`](../../app/onboarding.tsx), one per slide, sized to the screen |
| `AnimatedLogo` | header of [`login.tsx`](../../app/login.tsx), replays whenever someone switches demo account |
| `JoinedMotion` | [`event/[id]/terms.tsx`](../../app/event/[id]/terms.tsx), after joining |
| `RecordedMotion` | [`event/[id]/record.tsx`](../../app/event/[id]/record.tsx), after recording a start or finish |
| `ConfirmedMotion` | [`attendance/[id].tsx`](../../app/attendance/[id].tsx), after confirming hours |

## Static

```tsx
import { Logo, LogoMark } from '@/components/brand';

<LogoMark size={48} />                          // green pin, white seedling
<LogoMark size={48} variant="reverse" />        // white pin, green seedling (on green or photos)
<LogoMark size={24} variant="mono" color={c} /> // one colour, seedling cut out
<Logo size={40} />                              // mark + app name in the current language
<Logo size={56} layout="stack" color={colors.surface} />  // on navy
```

## Motion

Every motion graphic takes `size` (width in points), `play` and `onDone`.

| Component | Use | Length |
|---|---|---|
| `AnimatedLogo` | splash / welcome: pin drops, seedling grows, leaves sway | 1.7 s |
| `MapPinsMotion` | slide 1 "Volunteer events near you" | 2.0 s |
| `AttendanceMotion` | slide 2 "A supervisor records your attendance" | 2.0 s |
| `GrowthMotion` | slide 3 "Your good works grow" | 1.7 s |

After the intro, each one settles into a quiet loop: a pulse, a bob or floating points.

- `play={false}` rewinds to the empty first frame, and setting it back to `true` replays. Use this in a pager so each slide plays when it arrives.
- With the system's reduce-motion setting on, a graphic shows its finished frame and stays still.
- All of them are decorative and hidden from screen readers. The slide text carries the meaning.
- They follow RTL wherever order matters: the roster rows, the time strip and the growing columns.

## Success moments

These replaced the static `checkmark-circle` on the three success screens. Each canvas is 160 × 140, so the default `size={150}` draws at 150 × 131.

| Component | Screen | Length | Feel |
|---|---|---|---|
| `JoinedMotion` | terms, after joining | 1.3 s, then a slow ripple | calm: the pin lands on a calendar day |
| `RecordedMotion` | supervisor's record screen | 0.65 s | quick stamp, plus a play/stop badge for start/end |
| `ConfirmedMotion` | confirm hours | 1.1 s, then a slow glow | the one reward moment: seal and a points burst in greens and navy |

- The record screen goes back 900 ms after success. The stamp finishes at 650 ms, so it stays visible for a beat. Don't lengthen it without lengthening that timer.
- The burst peaks while the level `ProgressBar` below it fills (600 ms), and the two read as one moment.

## Files (`assets/brand/`)

Regenerate them with `python scripts/make-brand-assets.py` (needs Pillow) after changing [`geometry.ts`](geometry.ts), and keep the paths in both files in step.

| File | For |
|---|---|
| `logo-mark.svg`, `logo-mark-reverse.svg`, `logo-mark-mono-{navy,white}.svg` | print, web, design tools |
| `logo-mark@1024.png`, `logo-mark-reverse@1024.png` | slides, social |
| `icon.png` | app icon (navy, full bleed) |
| `android-icon-{foreground,background,monochrome}.png` | Android adaptive icon (mark inside the safe zone) |
| `splash-icon.png`, `favicon.png` | splash screen, web |

`app.json` points at these. iOS uses `icon.png` too: the old `ios.icon` (`assets/expo.icon`, Expo's default Icon Composer file) was dropped. After changing any of them, run `npx expo prebuild --platform android` so the native icons are regenerated.
