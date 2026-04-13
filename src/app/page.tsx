"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Package,
  Radar,
  ShieldCheck,
  Sparkles,
  Truck,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PremiumDeviceHero,
  PremiumStoryShowcase,
} from "@/components/landing/PremiumDeviceShowcase";
import { useAuth } from "@/hooks/useAuth";

const heroMoments = [
  { title: "Arrive", detail: "Intake stays clean" },
  { title: "Value", detail: "Pricing stays visible" },
  { title: "Move", detail: "Ops stay aligned" },
] as const;

const storyChapters = [
  {
    id: "arrival",
    step: "01",
    eyebrow: "Arrival",
    title: "Everything begins with one calm front door.",
    description:
      "Customer context, device identity, and business intent arrive together, so the work starts aligned instead of fragmented.",
    focus: "Capture once, route with context, and let the system stay composed from the first touch.",
    outcome: "Less re-entry. Faster first decisions.",
    chips: ["Trade-in", "Customer", "Vendor"],
    stageLabel: "Intake surface",
    stageHeadline: "A single arrival layer keeps the device story intact.",
    stageFootnote:
      "The experience feels lighter because teams stop rebuilding context downstream.",
    icon: Sparkles,
    accent: "from-[#f4d8b0]/55 via-[#fcf4e8] to-white",
    glow: "bg-[#edc486]/35",
    wash: "from-[#e8bd84]/18 via-transparent to-transparent",
  },
  {
    id: "pricing",
    step: "02",
    eyebrow: "Pricing",
    title: "Signal-driven decisions stay close to the quote.",
    description:
      "Benchmarks, rules, and confidence cues are surfaced in the same flow, so the number feels explained before anyone asks why it changed.",
    focus: "Show the pricing logic where the decision happens instead of hiding it in a back-office corner.",
    outcome: "Sharper approvals. Fewer slowdowns.",
    chips: ["Benchmarks", "Guardrails", "Quotes"],
    stageLabel: "Decision surface",
    stageHeadline: "Market movement becomes readable, not noisy.",
    stageFootnote:
      "The page reveals complexity gradually, so pricing feels intelligent without looking busy.",
    icon: Radar,
    accent: "from-[#dbeafb]/58 via-[#f6fbff] to-white",
    glow: "bg-sky-300/35",
    wash: "from-sky-300/16 via-transparent to-transparent",
  },
  {
    id: "operations",
    step: "03",
    eyebrow: "Operations",
    title: "The floor stays readable all the way to outbound.",
    description:
      "Receiving, triage, exceptions, and shipping continue the same story, which makes handoffs feel connected rather than improvised.",
    focus: "Keep operations visible as one motion, even when multiple teams touch the same device.",
    outcome: "Cleaner handoffs. Calmer execution.",
    chips: ["Receiving", "Triage", "Outbound"],
    stageLabel: "Operations surface",
    stageHeadline: "From intake to ship, the product keeps one continuous frame.",
    stageFootnote:
      "Fewer jumps, more continuity, better recall across every team boundary.",
    icon: Truck,
    accent: "from-[#d4f4ea]/55 via-[#f5fbf8] to-white",
    glow: "bg-emerald-300/30",
    wash: "from-emerald-300/14 via-transparent to-transparent",
  },
] as const;

const principles = [
  {
    icon: Workflow,
    title: "One system for the whole journey",
    description:
      "From intake quote to certified resale, the entire device lifecycle moves inside a single platform — no tool-switching, no context loss, no duplicated effort.",
  },
  {
    icon: ShieldCheck,
    title: "Pricing that adapts to the market",
    description:
      "Benchmark data, competitor signals, and trained baselines keep quotes accurate without manual research at every step. Confidence built in.",
  },
  {
    icon: Package,
    title: "Roles that match the work",
    description:
      "Admin, sales, COE technician, customer, and vendor each see exactly the operations surface they need — nothing more, nothing hidden.",
  },
] as const;

type ChapterId = (typeof storyChapters)[number]["id"];

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<Record<string, HTMLElement | null>>({});
  const experienceRef = useRef<HTMLElement>(null);
  const [activeChapterId, setActiveChapterId] = useState<ChapterId>(
    storyChapters[0].id,
  );

  const { scrollYProgress } = useScroll();
  const progressScaleX = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 30,
    mass: 0.28,
  });

  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const { scrollYProgress: experienceScrollProgress } = useScroll({
    target: experienceRef,
    offset: ["start end", "end start"],
  });

  const heroCopyY = useTransform(
    heroScrollProgress,
    [0, 1],
    [0, shouldReduceMotion ? 0 : 96],
  );
  const heroCopyOpacity = useTransform(
    heroScrollProgress,
    [0, 0.75, 1],
    [1, 1, shouldReduceMotion ? 1 : 0.16],
  );
  const heroStageY = useTransform(
    heroScrollProgress,
    [0, 1],
    [0, shouldReduceMotion ? 0 : 70],
  );
  const heroStageScale = useTransform(
    heroScrollProgress,
    [0, 1],
    [1, shouldReduceMotion ? 1 : 0.95],
  );
  const stageShellY = useTransform(
    experienceScrollProgress,
    [0, 0.5, 1],
    [shouldReduceMotion ? 0 : 24, 0, shouldReduceMotion ? 0 : -24],
  );
  const stageShellScale = useTransform(
    experienceScrollProgress,
    [0, 0.5, 1],
    [shouldReduceMotion ? 1 : 0.98, 1, shouldReduceMotion ? 1 : 0.985],
  );
  const stageGlowOpacity = useTransform(
    experienceScrollProgress,
    [0, 0.5, 1],
    [0.18, 0.34, 0.2],
  );
  const quoteOpacity = useTransform(
    experienceScrollProgress,
    [0, 0.45, 0.85, 1],
    [0.45, 1, 1, 0.65],
  );

  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isInitializing, router]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        const nextChapter = visible[0]?.target.getAttribute(
          "data-chapter",
        ) as ChapterId | null;
        if (nextChapter) {
          setActiveChapterId(nextChapter);
        }
      },
      {
        threshold: [0.25, 0.45, 0.62],
        rootMargin: "-16% 0px -18% 0px",
      },
    );

    const nodes = Object.values(chapterRefs.current).filter(
      (node): node is HTMLElement => Boolean(node),
    );
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  const activeChapter =
    storyChapters.find((chapter) => chapter.id === activeChapterId) ??
    storyChapters[0];

  const scrollToChapter = (chapterId: string) => {
    chapterRefs.current[chapterId]?.scrollIntoView({
      behavior: shouldReduceMotion ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <div className="landing-shell relative overflow-x-clip text-[#16120f]">
      <motion.div
        className="fixed inset-x-0 top-0 z-[80] h-px origin-left bg-gradient-to-r from-[#e8bb77] via-[#d46f39] to-[#8dbde9]"
        style={{ scaleX: progressScaleX }}
      />

      <div className="pointer-events-none fixed inset-0">
        <div className="landing-backdrop absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(17,24,39,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />
      </div>

      <div className="relative mx-auto max-w-[1480px] px-4 sm:px-8 lg:px-10">
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="welcome-header sticky top-4 z-50 flex items-center justify-between rounded-full px-4 py-3 sm:px-6"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17120f] text-[#f8f2ea] shadow-[0_20px_40px_-24px_rgba(0,0,0,0.45)] sm:h-11 sm:w-11">
              <Package className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <p className="editorial-title text-[1.4rem] leading-none text-[#17120f] sm:text-[1.7rem]">
                DLM Engine
              </p>
              <p className="hidden text-[10px] uppercase tracking-[0.28em] text-[#7f766f] sm:block">
                Device Lifecycle Management
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-6 lg:flex">
            <Link
              href="#experience"
              className="text-sm text-[#6d655f] transition-colors hover:text-[#17120f]"
            >
              Story
            </Link>
            <Link
              href="#principles"
              className="text-sm text-[#6d655f] transition-colors hover:text-[#17120f]"
            >
              Principles
            </Link>
            <Link
              href="#launch"
              className="text-sm text-[#6d655f] transition-colors hover:text-[#17120f]"
            >
              Launch
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login">
              <Button
                variant="outline"
                size="sm"
                className="border-black/10 bg-white/60 text-[#17120f] hover:bg-white sm:h-10 sm:px-4 sm:text-sm"
              >
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="animate-shine sm:h-10 sm:px-4 sm:text-sm">
                Request Access
              </Button>
            </Link>
          </div>
        </motion.header>

        <main className="pb-16 pt-6">
          <section ref={heroRef} className="relative" id="top">
            <div className="grid min-h-[calc(100svh-5rem)] items-center gap-8 py-8 sm:gap-12 sm:py-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:py-20">
              <motion.div
                style={
                  shouldReduceMotion
                    ? undefined
                    : { y: heroCopyY, opacity: heroCopyOpacity }
                }
                className="relative z-10 space-y-7 sm:space-y-8"
              >
                <span className="eyebrow-label text-[#8a6c45]">
                  Device Lifecycle Platform
                </span>

                <div className="space-y-5 sm:space-y-6">
                  <motion.h1
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="editorial-title max-w-5xl text-[clamp(2.8rem,7.7vw,7.6rem)] leading-[1.06] text-[#17120f]"
                  >
                    Devices move through the business
                    <span className="block brand-gradient">
                      in one premium flow.
                    </span>
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.16 }}
                    className="max-w-2xl text-base leading-8 text-[#5f5751] sm:text-[1.18rem]"
                  >
                    One platform manages every device from trade-in intake to
                    certified resale — with pricing intelligence, COE operations,
                    and customer visibility built in.
                  </motion.p>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="flex flex-wrap gap-3"
                >
                  <Link href="/login">
                    <Button size="lg">
                      Enter the platform
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="#experience">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-black/10 bg-white/70 text-[#17120f] hover:bg-white"
                    >
                      Explore the story
                    </Button>
                  </Link>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="hero-sequence"
                >
                  {heroMoments.map((moment) => (
                    <div key={moment.title} className="hero-sequence-item">
                      <p className="text-[11px] uppercase tracking-[0.26em] text-[#8b8078]">
                        {moment.title}
                      </p>
                      <p className="mt-2 text-sm text-[#544d47]">
                        {moment.detail}
                      </p>
                    </div>
                  ))}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.38 }}
                  className="flex items-center gap-3 text-xs uppercase tracking-[0.26em] text-[#83786f]"
                >
                  <motion.div
                    animate={shouldReduceMotion ? undefined : { y: [0, 8, 0] }}
                    transition={{
                      duration: 2.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/70"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                  Scroll for the product reveal
                </motion.div>
              </motion.div>

              <motion.div
                style={
                  shouldReduceMotion
                    ? undefined
                    : { y: heroStageY, scale: heroStageScale }
                }
                initial={{ opacity: 0, scale: 0.97, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="relative"
              >
                <div className="landing-hero-halo absolute inset-0 blur-3xl" />
                <PremiumDeviceHero />
              </motion.div>
            </div>
          </section>

          <section
            ref={experienceRef}
            id="experience"
            className="relative py-16 sm:py-24"
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.75 }}
              className="mx-auto max-w-3xl text-center"
            >
              <span className="eyebrow-label text-[#8a6c45]">
                Platform Story
              </span>
              <h2 className="editorial-title mt-6 text-4xl text-[#17120f] sm:text-5xl lg:text-6xl">
                Three surfaces. One continuous device journey.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#625a54] sm:text-lg">
                Every handoff from arrival to outbound stays traceable because
                the platform carries the device context forward — not broken at
                each team boundary.
              </p>
            </motion.div>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {storyChapters.map((chapter) => {
                const isActive = activeChapter.id === chapter.id;

                return (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => scrollToChapter(chapter.id)}
                    className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em] transition-all duration-300 ${
                      isActive
                        ? "border-[#d07a48]/35 bg-[#f7e9da] text-[#17120f] shadow-[0_18px_50px_-30px_rgba(190,106,49,0.42)]"
                        : "border-black/8 bg-white/65 text-[#6a625d] hover:border-black/16 hover:text-[#17120f]"
                    }`}
                  >
                    {chapter.eyebrow}
                  </button>
                );
              })}
            </div>

            <div className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-[0.95fr_1.05fr] xl:gap-16">
              <motion.div
                style={
                  shouldReduceMotion
                    ? undefined
                    : {
                        y: stageShellY,
                        scale: stageShellScale,
                      }
                }
                className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)]"
              >
                <div className="flex h-full items-start">
                  <div className="chapter-stage grain-overlay relative h-full w-full overflow-hidden rounded-[2.8rem] p-6 sm:p-8">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${activeChapter.id}-wash`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        className={`absolute inset-0 bg-gradient-to-br ${activeChapter.wash}`}
                      />
                    </AnimatePresence>
                    <motion.div
                      className={`absolute left-10 top-8 h-32 w-32 rounded-full blur-3xl ${activeChapter.glow}`}
                      style={{ opacity: stageGlowOpacity }}
                    />
                    <div className="relative h-full">
                      <div className="mb-6 flex items-center justify-between gap-4">
                        <span className="eyebrow-label text-[#ebc88d]">
                          Chapter {activeChapter.step}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/70">
                          {activeChapter.stageLabel}
                        </span>
                      </div>
                      <PremiumStoryShowcase chapterId={activeChapter.id} />
                    </div>
                  </div>
                </div>
              </motion.div>

              <div className="space-y-6 lg:space-y-8">
                {storyChapters.map((chapter, index) => {
                  const isActive = activeChapter.id === chapter.id;

                  return (
                    <motion.article
                      key={chapter.id}
                      ref={(node) => {
                        chapterRefs.current[chapter.id] = node;
                      }}
                      data-chapter={chapter.id}
                      initial={{ opacity: 0, y: 28 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.22 }}
                      transition={{ duration: 0.7, delay: index * 0.06 }}
                      whileHover={shouldReduceMotion ? undefined : { y: -5 }}
                      className={`chapter-card relative min-h-[30rem] overflow-hidden rounded-[2.5rem] p-6 sm:min-h-[40rem] sm:p-8 lg:min-h-[52rem] ${
                        isActive
                          ? "border-[#d07a48]/28 shadow-[0_42px_120px_-70px_rgba(186,104,48,0.46)]"
                          : "border-black/8"
                      }`}
                    >
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${chapter.accent} opacity-95`}
                      />
                      <div className="pointer-events-none absolute right-6 top-4 text-[6rem] font-semibold leading-none text-black/[0.05] sm:right-8 sm:text-[8.5rem]">
                        {chapter.step}
                      </div>

                      <div className="relative flex h-full flex-col justify-between gap-8">
                        <div>
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-xs uppercase tracking-[0.28em] text-[#7b726b]">
                              Chapter {chapter.step}
                            </p>
                            <div className="rounded-full border border-black/8 bg-white/65 px-3 py-1 text-xs text-[#514a44]">
                              {chapter.eyebrow}
                            </div>
                          </div>

                          <div className="mt-8 flex flex-col gap-5 sm:mt-10 sm:gap-6">
                            <div className="flex h-14 w-14 items-center justify-center rounded-[1.7rem] border border-black/8 bg-white/75 text-[#17120f] shadow-[0_20px_40px_-28px_rgba(0,0,0,0.22)] sm:h-16 sm:w-16">
                              <chapter.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                            </div>

                            <div className="max-w-2xl">
                              <h3 className="editorial-title text-3xl text-[#17120f] sm:text-4xl lg:text-5xl">
                                {chapter.title}
                              </h3>
                              <p className="mt-4 text-base leading-8 text-[#5f5751]">
                                {chapter.description}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="chapter-highlight rounded-[2rem] p-5 sm:p-6">
                            <p className="text-xs uppercase tracking-[0.24em] text-[#8a6d4b]">
                              Why it matters
                            </p>
                            <p className="mt-3 text-base leading-8 text-[#1d1815] sm:mt-4 sm:text-lg">
                              {chapter.focus}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {chapter.chips.map((chip) => (
                              <span
                                key={chip}
                                className="rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[#5f5751]"
                              >
                                {chip}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="py-6 sm:py-10">
            <motion.div
              style={shouldReduceMotion ? undefined : { opacity: quoteOpacity }}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.75 }}
              className="pause-band mx-auto max-w-5xl rounded-[2.8rem] px-6 py-10 text-center sm:px-10 sm:py-14"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-[#8c7050]">
                Built For Clarity
              </p>
              <p className="editorial-title mt-5 text-3xl text-[#17120f] sm:text-5xl lg:text-6xl">
                Designed to stay calm while the work gets complicated.
              </p>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#645c56] sm:text-lg">
                The goal is not more features. It is one clear path from device
                arrival to successful delivery — for every role, every order,
                every time.
              </p>
            </motion.div>
          </section>

          <section id="principles" className="py-14 sm:py-20 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow-label text-[#8a6c45]">
                Design Principles
              </span>
              <h2 className="editorial-title mt-6 text-4xl text-[#17120f] sm:text-5xl lg:text-6xl">
                Clean on first glance. Deep when you keep going.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#625a54] sm:text-lg">
                Every layer of the platform is shaped by the same thinking —
                make the right action obvious, hide the noise, let the team
                focus on what matters.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {principles.map((principle, index) => (
                <motion.div
                  key={principle.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.65, delay: index * 0.06 }}
                  className="principle-card rounded-[2.1rem] p-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-[#17120f] text-[#f7efe5]">
                    <principle.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-6 text-xl font-semibold text-[#17120f] sm:text-2xl">
                    {principle.title}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[#605953]">
                    {principle.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          <section id="launch" className="pb-10 pt-6 sm:pt-10">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.75 }}
              className="launch-slab grain-overlay relative overflow-hidden rounded-[3rem] px-6 py-10 sm:px-8 sm:py-12 lg:px-12"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

              <motion.div
                className="absolute right-10 top-8 h-40 w-40 rounded-full bg-[#d17843]/16 blur-3xl"
                animate={
                  shouldReduceMotion
                    ? undefined
                    : {
                        x: [0, -18, 0],
                        y: [0, 18, 0],
                        opacity: [0.18, 0.34, 0.18],
                      }
                }
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <span className="eyebrow-label text-[#f0cca0]">
                    Ready To Launch
                  </span>
                  <h2 className="editorial-title mt-6 text-4xl text-white sm:text-5xl lg:text-6xl">
                    A serious operations platform for every device lifecycle.
                  </h2>
                  <p className="mt-5 text-base leading-8 text-white/70 sm:text-lg">
                    Trade-ins, CPO resale, pricing intelligence, COE operations,
                    and customer-facing workflows — all in one composed,
                    role-aware system.
                  </p>
                </div>

                <div className="flex flex-shrink-0 flex-wrap gap-3">
                  <Link href="/login">
                    <Button size="lg">
                      Open the platform
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-white/16 bg-white/[0.08] text-white hover:bg-white/[0.14]"
                    >
                      Request access
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          </section>
        </main>
      </div>
    </div>
  );
}
