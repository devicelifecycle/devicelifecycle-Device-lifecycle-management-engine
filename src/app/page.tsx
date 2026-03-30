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
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  Package,
  Radar,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrbitingDeviceField } from "@/components/landing/OrbitingDeviceField";
import { useAuth } from "@/hooks/useAuth";

const features = [
  {
    icon: ShoppingCart,
    title: "Order choreography",
    description:
      "Trade-in, customer, and vendor flows now read as one continuous experience instead of disconnected tools.",
  },
  {
    icon: BarChart3,
    title: "Pricing intelligence",
    description:
      "Competitor signals, guardrails, and quote context stay close enough to drive action in real time.",
  },
  {
    icon: ClipboardCheck,
    title: "COE execution",
    description:
      "Receiving, triage, exceptions, and outbound readiness feel tied to the same operational thread.",
  },
  {
    icon: ShieldCheck,
    title: "Role-built access",
    description:
      "Admins, sales, COE teams, customers, and vendors each get a calmer surface with the right controls.",
  },
];

const heroSignals = [
  {
    label: "Competitor sensing",
    value: "15.6k live rows",
    detail: "Bell, Telus, Apple, and other pricing signals stay within reach.",
    accent: "text-amber-200",
  },
  {
    label: "Shared visibility",
    value: "One operating canvas",
    detail:
      "Intake, quote, triage, and shipping stay attached to the same order story.",
    accent: "text-sky-200",
  },
  {
    label: "Role-aware flow",
    value: "From admin to vendor",
    detail:
      "Every team sees a clearer path without losing the sense of a single system.",
    accent: "text-teal-200",
  },
];

const storyChapters = [
  {
    id: "intake",
    step: "01",
    eyebrow: "Front door",
    title: "Begin with the device, not the department.",
    description:
      "Every request starts in a calmer intake layer, so customer details, device specifics, and quote intent travel together from the first touch.",
    points: [
      "Capture device data, owner context, and quote purpose once.",
      "Move customer, trade-in, and vendor flows into the same narrative.",
      "Surface missing data or exceptions before the work fragments.",
    ],
    railLabel: "Intake canvas",
    railHeadline:
      "A single entry point for device requests, quotes, and sourcing.",
    railMetrics: [
      { label: "Workflow lanes", value: "4" },
      { label: "Context loss", value: "Near zero" },
      { label: "Team handoff", value: "Continuous" },
    ],
    timeline: [
      "Request lands with device metadata and ownership details attached.",
      "Pricing and policy signals join the order before teams begin routing.",
      "Approvals, notes, and next actions move forward as one thread.",
    ],
    tags: ["Trade-in", "Customer", "Vendor", "CPO"],
    metricValue: "4",
    metricLabel: "workflow lanes",
    metricDetail: "running through one intake motion",
    icon: ShoppingCart,
    accent: "from-[#f0d6ab]/22 via-[#d17843]/12 to-transparent",
    glow: "bg-[#d17843]/18",
  },
  {
    id: "pricing",
    step: "02",
    eyebrow: "Signal engine",
    title: "Let pricing react to the market with confidence.",
    description:
      "Competitor pulls, baselines, and controls now feel like part of the experience, not an afterthought hidden in a back office tool.",
    points: [
      "Keep live competitor benchmarks close to the quote decision.",
      "Explain margin movement before an approver has to ask.",
      "Reduce guesswork with visible rules and quote confidence.",
    ],
    railLabel: "Pricing theater",
    railHeadline: "Quotes move with real signals instead of gut checks.",
    railMetrics: [
      { label: "Signal freshness", value: "Live" },
      { label: "Quote controls", value: "Visible" },
      { label: "Approval context", value: "Attached" },
    ],
    timeline: [
      "Competitor rows refresh the benchmark window behind each quote.",
      "Internal rules and floor logic shape the right price corridor.",
      "Teams see why a number changed before they approve or revise it.",
    ],
    tags: ["Bell", "Telus", "Apple", "Guardrails"],
    metricValue: "15.6k",
    metricLabel: "competitor rows",
    metricDetail: "feeding the quote surface",
    icon: Radar,
    accent: "from-sky-200/18 via-cyan-300/14 to-transparent",
    glow: "bg-sky-300/16",
  },
  {
    id: "operations",
    step: "03",
    eyebrow: "Floor motion",
    title: "Finish with an operations picture that stays readable.",
    description:
      "Receiving, triage, repair decisions, and outbound shipping now land in one polished story, so the floor stays fast without feeling chaotic.",
    points: [
      "Keep receiving and triage attached to the original order context.",
      "Track exceptions without losing the bigger operational picture.",
      "Make outbound readiness visible before devices leave the building.",
    ],
    railLabel: "Operations chamber",
    railHeadline:
      "Every downstream touch stays connected to the same device story.",
    railMetrics: [
      { label: "Traceability", value: "End to end" },
      { label: "Shipping state", value: "Visible" },
      { label: "Exceptions", value: "Actionable" },
    ],
    timeline: [
      "Devices arrive with order history and quote reasoning still intact.",
      "Receiving, triage, and exception handling stay in the same view.",
      "Outbound teams ship with cleaner signals and less last-minute searching.",
    ],
    tags: ["Receiving", "Triage", "Exceptions", "Outbound"],
    metricValue: "1",
    metricLabel: "shared floor view",
    metricDetail: "across receiving to shipping",
    icon: Truck,
    accent: "from-teal-200/18 via-emerald-300/12 to-transparent",
    glow: "bg-emerald-300/14",
  },
];

const platformStats = [
  {
    value: "15.6k",
    label: "competitor rows in motion",
    note: "Pricing data now supports the story instead of hiding behind it.",
  },
  {
    value: "4",
    label: "workflow lanes, one narrative",
    note: "Trade-in, CPO, customer, and vendor motion now feel connected from the first screen.",
  },
  {
    value: "1",
    label: "operating canvas",
    note: "Users understand the system faster because the page shows a unified product story.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeChapterId, setActiveChapterId] = useState(storyChapters[0].id);

  const { scrollYProgress } = useScroll();
  const progressScaleX = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 30,
    mass: 0.3,
  });

  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroCopyY = useTransform(
    heroScrollProgress,
    [0, 1],
    [0, shouldReduceMotion ? 0 : 110],
  );
  const heroCopyOpacity = useTransform(
    heroScrollProgress,
    [0, 0.72, 1],
    [1, 1, shouldReduceMotion ? 1 : 0.2],
  );
  const heroStageY = useTransform(
    heroScrollProgress,
    [0, 1],
    [0, shouldReduceMotion ? 0 : 84],
  );
  const heroStageScale = useTransform(
    heroScrollProgress,
    [0, 1],
    [1, shouldReduceMotion ? 1 : 0.94],
  );
  const heroHaloOpacity = useTransform(
    heroScrollProgress,
    [0, 1],
    [0.18, shouldReduceMotion ? 0.18 : 0.42],
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

        const nextChapter = visible[0]?.target.getAttribute("data-chapter");
        if (nextChapter) {
          setActiveChapterId(nextChapter);
        }
      },
      {
        threshold: [0.25, 0.4, 0.55, 0.7],
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

  return (
    <div className="relative overflow-x-clip bg-[#130f0d] text-stone-100">
      <motion.div
        className="fixed inset-x-0 top-0 z-[70] h-px origin-left bg-gradient-to-r from-[#f4dfbf] via-[#d17843] to-sky-200"
        style={{ scaleX: progressScaleX }}
      />

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(241,209,163,0.12),transparent_22%),radial-gradient(circle_at_80%_18%,rgba(98,185,255,0.08),transparent_20%),linear-gradient(180deg,#130f0d_0%,#0b0807_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] opacity-30" />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-10">
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-0 z-50 flex items-center justify-between border-b border-white/6 bg-[#130f0d]/72 py-4 backdrop-blur-xl"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-primary text-primary-foreground shadow-[0_20px_45px_-24px_rgba(182,93,47,0.9)]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="editorial-title text-3xl leading-none brand-gradient">
                DLM Engine
              </p>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                Device Lifecycle Management
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-6 lg:flex">
            <Link
              href="#experience"
              className="text-sm text-stone-400 transition-colors hover:text-stone-100"
            >
              Experience
            </Link>
            <Link
              href="#platform"
              className="text-sm text-stone-400 transition-colors hover:text-stone-100"
            >
              Platform
            </Link>
            <Link
              href="#launch"
              className="text-sm text-stone-400 transition-colors hover:text-stone-100"
            >
              Launch
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button
                variant="outline"
                className="transition-transform duration-300 hover:-translate-y-0.5"
              >
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button className="animate-shine">Request Access</Button>
            </Link>
          </div>
        </motion.header>

        <main className="pb-14">
          <section ref={heroRef} className="relative" id="top">
            <div className="grid min-h-[calc(100svh-5.5rem)] items-center gap-12 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 lg:py-16">
              <motion.div
                style={
                  shouldReduceMotion
                    ? undefined
                    : { y: heroCopyY, opacity: heroCopyOpacity }
                }
                className="relative z-10 space-y-8"
              >
                <motion.span
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7 }}
                  className="eyebrow-label"
                >
                  Scroll-Built Welcome Experience
                </motion.span>

                <div className="space-y-6">
                  <motion.h1
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="editorial-title max-w-5xl text-[clamp(3.6rem,8vw,7.8rem)] text-stone-100"
                  >
                    One operating story
                    <span className="brand-gradient"> for every device.</span>
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.16 }}
                    className="max-w-2xl text-lg leading-8 text-stone-400 sm:text-xl"
                  >
                    The landing experience now unfolds more like a premium
                    product reveal: bigger ideas first, calmer hierarchy, and a
                    scroll path that introduces trade-in, pricing, COE, and
                    shipping as one system.
                  </motion.p>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 24 }}
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
                    <Button size="lg" variant="outline">
                      Explore the flow
                    </Button>
                  </Link>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="grid gap-3 sm:grid-cols-3"
                >
                  {heroSignals.map((signal, index) => (
                    <motion.div
                      key={signal.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.34 + index * 0.08,
                        duration: 0.65,
                      }}
                      whileHover={
                        shouldReduceMotion ? undefined : { y: -4, scale: 1.01 }
                      }
                      className="rounded-[1.5rem] border border-white/8 bg-white/[0.035] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                        {signal.label}
                      </p>
                      <p
                        className={`mt-2 text-base font-medium ${signal.accent}`}
                      >
                        {signal.value}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-400">
                        {signal.detail}
                      </p>
                    </motion.div>
                  ))}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.46 }}
                  className="flex items-center gap-3 text-xs uppercase tracking-[0.26em] text-stone-500"
                >
                  <motion.div
                    animate={shouldReduceMotion ? undefined : { y: [0, 8, 0] }}
                    transition={{
                      duration: 2.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                  Scroll to enter the system story
                </motion.div>
              </motion.div>

              <motion.div
                style={
                  shouldReduceMotion
                    ? undefined
                    : { y: heroStageY, scale: heroStageScale }
                }
                initial={{ opacity: 0, scale: 0.96, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="relative"
              >
                <div className="landing-hero-halo absolute inset-0 blur-3xl" />
                <motion.div
                  className="absolute left-16 top-8 h-40 w-40 rounded-full bg-[#e7c38f]/12 blur-3xl"
                  style={{ opacity: heroHaloOpacity }}
                />
                <div className="landing-stage-panel grain-overlay relative overflow-hidden rounded-[2.8rem] p-6 sm:p-8">
                  <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />
                  <OrbitingDeviceField className="opacity-70" />

                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                          Operations theater
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-stone-100">
                          A cinematic first look at the platform
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-stone-300">
                        Live product story
                      </div>
                    </div>

                    <div className="mt-8 rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                        Now introducing
                      </p>
                      <p className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-stone-100">
                        Trade-in, pricing, and floor execution in one continuous
                        frame.
                      </p>
                      <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-400">
                        The page now leads with atmosphere, hierarchy, and
                        movement, but still stays grounded in what the product
                        actually does for operations teams.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="metric-tile p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                            Quote intelligence
                          </p>
                          <Radar className="h-4 w-4 text-sky-200" />
                        </div>
                        <p className="mt-4 text-2xl font-semibold text-stone-100">
                          Market-aware by default
                        </p>
                        <p className="mt-2 text-sm leading-6 text-stone-400">
                          Benchmarks and controls feel built into the product
                          story instead of bolted on.
                        </p>
                      </div>
                      <div className="metric-tile p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                            Operations thread
                          </p>
                          <Workflow className="h-4 w-4 text-amber-200" />
                        </div>
                        <p className="mt-4 text-2xl font-semibold text-stone-100">
                          Readable from intake to ship
                        </p>
                        <p className="mt-2 text-sm leading-6 text-stone-400">
                          Teams can understand the system quickly because the
                          motion now mirrors the real workflow.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {storyChapters.map((chapter) => (
                        <div
                          key={chapter.id}
                          className="flex items-start gap-4 rounded-[1.6rem] border border-white/8 bg-white/[0.035] px-4 py-4"
                        >
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-primary">
                            <chapter.icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                              Chapter {chapter.step}
                            </p>
                            <p className="mt-1 text-base font-semibold text-stone-100">
                              {chapter.title}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-stone-400">
                              {chapter.railLabel}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          <section id="experience" className="relative py-16 sm:py-24">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.75 }}
              className="mx-auto max-w-3xl text-center"
            >
              <span className="eyebrow-label">Scroll The System</span>
              <h2 className="editorial-title mt-6 text-5xl text-stone-100 sm:text-6xl">
                A homepage that reveals itself in chapters.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-400">
                Instead of showing every feature at once, the page now uses a
                sticky product stage and full-height scenes so people understand
                the platform as a sequence of connected decisions.
              </p>
            </motion.div>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {storyChapters.map((chapter) => {
                const isActive = activeChapter.id === chapter.id;

                return (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() =>
                      chapterRefs.current[chapter.id]?.scrollIntoView({
                        behavior: shouldReduceMotion ? "auto" : "smooth",
                        block: "center",
                      })
                    }
                    className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em] transition-all duration-300 ${
                      isActive
                        ? "border-primary/40 bg-primary/12 text-stone-100 shadow-[0_16px_40px_-28px_rgba(182,93,47,0.9)]"
                        : "border-white/10 bg-white/[0.03] text-stone-400 hover:border-white/20 hover:text-stone-100"
                    }`}
                  >
                    {chapter.eyebrow}
                  </button>
                );
              })}
            </div>

            <div className="mt-16 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] xl:gap-16">
              <div className="lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
                <div className="flex h-full items-start">
                  <div className="landing-stage-panel grain-overlay relative w-full overflow-hidden rounded-[2.8rem] p-6 sm:p-8">
                    <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeChapter.id}
                        initial={{ opacity: 0, y: 26, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -18, scale: 0.98 }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        className="relative"
                      >
                        <div
                          className={`absolute inset-x-12 top-10 h-28 rounded-full blur-3xl ${activeChapter.glow}`}
                        />

                        <div className="relative flex min-h-[32rem] flex-col justify-between gap-8">
                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="eyebrow-label">
                                Chapter {activeChapter.step}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-stone-300">
                                {activeChapter.railLabel}
                              </span>
                            </div>

                            <div className="mt-8 flex items-start gap-4">
                              <div
                                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.4rem] bg-gradient-to-br ${activeChapter.accent} border border-white/10 text-white`}
                              >
                                <activeChapter.icon className="h-6 w-6" />
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                                  {activeChapter.eyebrow}
                                </p>
                                <p className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-stone-100">
                                  {activeChapter.railHeadline}
                                </p>
                                <p className="mt-4 max-w-xl text-sm leading-7 text-stone-400">
                                  {activeChapter.description}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4">
                            <div className="rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
                              <div className="grid gap-3 sm:grid-cols-3">
                                {activeChapter.railMetrics.map((metric) => (
                                  <div
                                    key={metric.label}
                                    className="rounded-[1.3rem] border border-white/8 bg-white/[0.035] px-4 py-4"
                                  >
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
                                      {metric.label}
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-stone-100">
                                      {metric.value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                                Live thread
                              </p>
                              <div className="mt-4 space-y-4">
                                {activeChapter.timeline.map((item, index) => (
                                  <div
                                    key={item}
                                    className="flex items-start gap-4"
                                  >
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs text-stone-200">
                                      0{index + 1}
                                    </div>
                                    <p className="text-sm leading-7 text-stone-300">
                                      {item}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {activeChapter.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-stone-400"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {storyChapters.map((chapter, index) => {
                  const isActive = activeChapter.id === chapter.id;

                  return (
                    <motion.article
                      key={chapter.id}
                      ref={(node) => {
                        chapterRefs.current[chapter.id] = node;
                      }}
                      data-chapter={chapter.id}
                      initial={{ opacity: 0, y: 32 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ duration: 0.7, delay: index * 0.06 }}
                      className={`landing-story-card relative min-h-[70svh] overflow-hidden rounded-[2.6rem] px-6 py-8 sm:px-8 sm:py-10 lg:min-h-[78vh] lg:px-10 lg:py-12 ${
                        isActive
                          ? "border-primary/30 shadow-[0_32px_120px_-56px_rgba(182,93,47,0.9)]"
                          : "border-white/8"
                      }`}
                    >
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${chapter.accent} opacity-100`}
                      />
                      <div className="relative flex h-full flex-col justify-between gap-10">
                        <div>
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                              Chapter {chapter.step}
                            </p>
                            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-stone-300">
                              {chapter.metricValue} {chapter.metricLabel}
                            </div>
                          </div>

                          <div className="mt-8 flex flex-col gap-6 sm:flex-row">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.6rem] border border-white/10 bg-white/[0.05] text-primary">
                              <chapter.icon className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
                                {chapter.eyebrow}
                              </p>
                              <h3 className="editorial-title mt-4 text-4xl text-stone-100 sm:text-5xl">
                                {chapter.title}
                              </h3>
                              <p className="mt-5 max-w-2xl text-base leading-8 text-stone-400">
                                {chapter.description}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          {chapter.points.map((point, pointIndex) => (
                            <div
                              key={point}
                              className="rounded-[1.6rem] border border-white/8 bg-black/18 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                            >
                              <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                                0{pointIndex + 1}
                              </p>
                              <p className="mt-3 text-sm leading-7 text-stone-200">
                                {point}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col gap-6 border-t border-white/10 pt-6 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                              {chapter.metricLabel}
                            </p>
                            <p className="mt-3 text-4xl font-semibold text-stone-100">
                              {chapter.metricValue}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-stone-400">
                              {chapter.metricDetail}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-stone-300">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Scroll keeps the stage updated in sync
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </div>
          </section>

          <section id="platform" className="py-16 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.75 }}
                className="space-y-6"
              >
                <span className="eyebrow-label">Designed To Land Better</span>
                <h2 className="editorial-title text-5xl text-stone-100 sm:text-6xl">
                  Bigger ideas up front. Finer detail when you keep going.
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-stone-400">
                  The redesign is not just prettier. It makes the platform
                  easier to understand by spacing out decisions, reducing visual
                  noise, and revealing complexity in the right order.
                </p>
              </motion.div>

              <div className="grid gap-4 sm:grid-cols-3">
                {platformStats.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.65, delay: index * 0.08 }}
                    className="landing-story-card rounded-[2rem] p-5"
                  >
                    <p className="text-4xl font-semibold text-stone-100">
                      {stat.value}
                    </p>
                    <p className="mt-3 text-sm uppercase tracking-[0.18em] text-stone-500">
                      {stat.label}
                    </p>
                    <p className="mt-4 text-sm leading-7 text-stone-400">
                      {stat.note}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.65, delay: index * 0.06 }}
                  whileHover={
                    shouldReduceMotion
                      ? undefined
                      : { y: -6, rotateX: 2, rotateY: index % 2 === 0 ? -2 : 2 }
                  }
                  className="surface-panel rounded-[2rem] p-5"
                  style={{ transformPerspective: 1200 }}
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-primary/15 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <p className="text-xl font-semibold text-stone-100">
                    {feature.title}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-stone-400">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          <section id="launch" className="pb-8 pt-12 sm:pt-16">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.75 }}
              className="landing-stage-panel grain-overlay relative overflow-hidden rounded-[3rem] px-6 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12"
            >
              <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />
              <motion.div
                className="absolute right-10 top-8 h-40 w-40 rounded-full bg-[#d17843]/16 blur-3xl"
                animate={
                  shouldReduceMotion
                    ? undefined
                    : {
                        x: [0, -18, 0],
                        y: [0, 18, 0],
                        opacity: [0.22, 0.34, 0.22],
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
                  <span className="eyebrow-label">Ready To Launch</span>
                  <h2 className="editorial-title mt-6 text-5xl text-stone-100 sm:text-6xl">
                    A sharper welcome page for a serious operations product.
                  </h2>
                  <p className="mt-5 text-lg leading-8 text-stone-400">
                    The homepage now feels more premium, more scrollable, and
                    more memorable while still explaining the real value of DLM
                    Engine quickly.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link href="/login">
                    <Button size="lg">
                      Open the platform
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button size="lg" variant="outline">
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
