# Brand: logo and motion

The mark is **a tree in a ring**: a forest-green tree whose trunk and branches are woven together, in a thin sage ring. It is the association's logo (`assets/brand/logo-source.jpg`, chosen 2026-11-05), traced into vector paths in [`geometry.ts`](geometry.ts). The tree is `brandGreen` (the app's `primary` forest) and the ring is `brandSage`. It sits on the cream page or on white; on forest, use `variant="reverse"`. The mark never mirrors in RTL.

The palette follows it: forest leads, cream (`surfaceAlt`) is the page, and a muted gold (`accent`) marks only what is earned: points, the level card, progress and the confirmed seal. Keep gold rare; event pins on the map are the one other use.

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

<LogoMark size={48} />                          // forest tree, sage ring
<LogoMark size={48} variant="reverse" />        // cream tree, soft ring (on forest or photos)
<LogoMark size={48} variant="mono" color={c} /> // one colour, ring and all
<LogoMark size={24} ring={false} />             // the tree alone: under ~32 the ring crowds it
<Logo size={40} />                              // mark + app name in the current language
<Logo size={56} layout="stack" color={colors.surface} />  // on forest: mark and name in cream
```

## Motion

Every motion graphic takes `size` (width in points), `play` and `onDone`.

| Component | Use | Length |
|---|---|---|
| `AnimatedLogo` | welcome: the ring draws itself, the tree rises from its foot, the free leaves open from the centre out, then breathe | 1.9 s |
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
| `JoinedMotion` | terms, after joining | 1.3 s, then a slow ripple | calm: an event pin lands on a calendar day |
| `RecordedMotion` | supervisor's record screen | 0.65 s | quick stamp, plus a play/stop badge for start/end |
| `ConfirmedMotion` | confirm hours | 1.1 s, then a slow glow | the one reward moment: a gold seal and a points burst in gold, forest and sage |

- The record screen goes back 900 ms after success. The stamp finishes at 650 ms, so it stays visible for a beat. Don't lengthen it without lengthening that timer.
- The burst peaks while the level `ProgressBar` below it fills (600 ms), and the two read as one moment.

## Files (`assets/brand/`)

Regenerate them with `python scripts/make-brand-assets.py` (needs Pillow). It reads `scripts/brand-tree.json`, which holds the same traced paths as [`geometry.ts`](geometry.ts): change the two together.

| File | For |
|---|---|
| `logo-source.jpg` | the logo as the association gave it: what the paths were traced from |
| `logo-mark.svg`, `logo-mark-reverse.svg`, `logo-mark-mono-{forest,white}.svg`, `logo-tree.svg` | print, web, design tools |
| `logo-mark@1024.png`, `logo-mark-reverse@1024.png` | slides, social |
| `icon.png`, `app-icon.svg` | app icon: cream tree in a gold ring on forest, full bleed |
| `android-icon-{foreground,background,monochrome}.png` | Android adaptive icon (ring inside the safe zone) |
| `splash-icon.png` | splash screen, on the cream page (`app.json`) |
| `favicon.png` | web: the tree alone |
| `notification-icon.png` | Android status bar: white tree on transparent |

`app.json` points at these. iOS uses `icon.png` too: the old `ios.icon` (`assets/expo.icon`, Expo's default Icon Composer file) was dropped. After changing any of them, run `npx expo prebuild --platform android` so the native icons are regenerated.
