/**
 * 由 `pnpm --filter @cyrus/ui gen` 生成（scripts/gen-lazy-index.mjs），请勿手改。
 * 新增或删除组件后重新生成；想暂时排除某个组件，加进脚本的 EXCLUDE_FILES / EXCLUDE_NAMES。
 */
import { lazyModule } from "../utils/index.ts"

export const { AnimatedCircularProgressBar } = lazyModule(() => import("./animated-circular-progress-bar"))
export const { AnimatedListItem, AnimatedList } = lazyModule(() => import("./animated-list"))
export const { AnimatedThemeToggler } = lazyModule(() => import("./animated-theme-toggler"))
export const { BentoCard, BentoGrid } = lazyModule(() => import("./bento-grid"))
export const { BorderBeam } = lazyModule(() => import("./border-beam"))
export const { Confetti, ConfettiButton } = lazyModule(() => import("./confetti"))
export const { DiaTextReveal } = lazyModule(() => import("./dia-text-reveal"))
export const { DottedMap } = lazyModule(() => import("./dotted-map"))
export const { GlareHover } = lazyModule(() => import("./glare-hover"))
export const { Highlighter } = lazyModule(() => import("./highlighter"))
export const { LineShadowText } = lazyModule(() => import("./line-shadow-text"))
export const { MagicCard } = lazyModule(() => import("./magic-card"))
export const { Meteors } = lazyModule(() => import("./meteors"))
export const { ProgressiveBlur } = lazyModule(() => import("./progressive-blur"))
export const { ShineBorder } = lazyModule(() => import("./shine-border"))
export const { SmoothCursor } = lazyModule(() => import("./smooth-cursor"))
export const { SparklesText } = lazyModule(() => import("./sparkles-text"))
export const { TypingAnimation } = lazyModule(() => import("./typing-animation"))
