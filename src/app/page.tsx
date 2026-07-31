"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Package,
  Radar,
  ShieldCheck,
  Sparkles,
  Truck,
  Workflow,
} from "lucide-react";
import { ByteBackMark } from "@/components/brand/ByteBackMark";
import { Button } from "@/components/ui/button";
import { PremiumDeviceHero } from "@/components/landing/PremiumDeviceShowcase";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  ["How it works", "#how"],
  ["Principles", "#principles"],
  ["Launch", "#launch"],
] as const;

const stats = [
  { value: "608+", label: "Device SKUs priced" },
  { value: "6", label: "Role-based workflows" },
  { value: "100%", label: "Lifecycle coverage" },
] as const;

const capabilities = ["Trade-in intake", "Certified pre-owned", "Pricing intelligence", "COE operations", "Vendor sourcing"] as const;

const steps = [
  {
    step: "01",
    eyebrow: "Arrival",
    icon: Sparkles,
    title: "One calm front door for every device.",
    description:
      "Customer context, device identity, and business intent arrive together — so the work starts aligned instead of fragmented.",
    focus: "Capture once, route with context.",
    chips: ["Trade-in", "Customer", "Vendor"],
  },
  {
    step: "02",
    eyebrow: "Pricing",
    icon: Radar,
    title: "Signal-driven decisions, right on the quote.",
    description:
      "Benchmarks, guardrails, and confidence cues sit in the same flow, so the number is explained before anyone asks why it changed.",
    focus: "Show the pricing logic where the decision happens.",
    chips: ["Benchmarks", "Guardrails", "Quotes"],
  },
  {
    step: "03",
    eyebrow: "Operations",
    icon: Truck,
    title: "Readable from intake to outbound.",
    description:
      "Receiving, triage, exceptions, and shipping continue one story, so handoffs feel connected rather than improvised.",
    focus: "Keep operations visible as a single motion.",
    chips: ["Receiving", "Triage", "Outbound"],
  },
] as const;

const principles = [
  {
    icon: Workflow,
    title: "One system for the whole journey",
    description:
      "From intake quote to certified resale, the entire device lifecycle moves inside a single platform — no tool-switching, no context loss.",
  },
  {
    icon: ShieldCheck,
    title: "Pricing that adapts to the market",
    description:
      "Benchmark data, competitor signals, and trained baselines keep quotes accurate without manual research at every step.",
  },
  {
    icon: Package,
    title: "Roles that match the work",
    description:
      "Admin, sales, COE technician, customer, and vendor each see exactly the surface they need — nothing more, nothing hidden.",
  },
] as const;

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });

  useEffect(() => {
    if (!isInitializing && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isInitializing, router]);

  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.2 },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-slate-700 antialiased">
      {/* Scroll progress */}
      <motion.div
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-blue-700 via-blue-500 to-sky-400"
      />

      {/* Ambient backdrop — absolute (painted once) + clipped so it never widens the page */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[880px] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,30,61,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,30,61,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(60%_60%_at_50%_28%,black,transparent)]" />
        <div className="absolute -top-44 left-1/2 h-[26rem] w-[46rem] max-w-[92vw] -translate-x-1/2 rounded-full bg-blue-500/[0.08] blur-[90px]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <motion.header
          initial={reduce ? undefined : { opacity: 0, y: -16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-3 z-50 mt-3 flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-2.5 shadow-[0_10px_36px_-24px_rgba(15,30,61,0.45)] backdrop-blur-md sm:top-4 sm:mt-4 sm:px-5"
        >
          <Link href="#top" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#12224a] to-[#1e3a8a] text-white shadow-sm">
              <ByteBackMark className="h-4 w-4" />
            </div>
            <div className="leading-none">
              <p className="text-lg font-extrabold tracking-tight text-[#0f1e3d]">Byte-Back</p>
              <p className="mt-0.5 hidden text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Device Lifecycle Platform
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 md:flex lg:gap-8">
            {NAV.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="text-sm font-medium text-slate-500 transition-colors hover:text-[#0f1e3d]"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden sm:block">
              <Button variant="outline" size="sm" className="h-9 border-slate-200 px-4 text-[#0f1e3d] hover:bg-slate-50">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="h-9 px-4 shadow-sm shadow-blue-600/20">
                Request Access
              </Button>
            </Link>
          </div>
        </motion.header>

        <main id="top">
          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="grid items-center gap-12 pb-8 pt-12 lg:grid-cols-[1.02fr_1.05fr] lg:gap-14 lg:pb-16 lg:pt-20">
            <div className="max-w-xl">
              <motion.span
                initial={reduce ? undefined : { opacity: 0, y: 14 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                </span>
                Device Lifecycle Platform
              </motion.span>

              <motion.h1
                initial={reduce ? undefined : { opacity: 0, y: 22 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.06 }}
                className="mt-6 text-[clamp(2.5rem,5.6vw,4.5rem)] font-bold leading-[1.04] tracking-[-0.02em] text-[#0f1e3d]"
              >
                Every device, one
                <span className="block bg-gradient-to-r from-[#1e3a8a] via-[#2563eb] to-[#3b82f6] bg-clip-text text-transparent">
                  continuous flow.
                </span>
              </motion.h1>

              <motion.p
                initial={reduce ? undefined : { opacity: 0, y: 22 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="mt-6 max-w-lg text-lg leading-8 text-slate-600"
              >
                From trade-in intake to certified resale — one platform for pricing
                intelligence, COE operations, and customer visibility, with every role
                on the same page.
              </motion.p>

              <motion.div
                initial={reduce ? undefined : { opacity: 0, y: 22 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <Link href="/login" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full shadow-lg shadow-blue-600/25 sm:w-auto">
                    Enter the platform
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="#how" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full border-slate-200 text-[#0f1e3d] hover:bg-slate-50 sm:w-auto">
                    See how it works
                  </Button>
                </Link>
              </motion.div>

              <motion.p
                initial={reduce ? undefined : { opacity: 0 }}
                animate={reduce ? undefined : { opacity: 1 }}
                transition={{ delay: 0.26 }}
                className="mt-4 flex items-center gap-2 text-sm text-slate-500"
              >
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                Role-based access · No credit card to explore
              </motion.p>

              <motion.div
                initial={reduce ? undefined : { opacity: 0, y: 18 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-slate-100 pt-6"
              >
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold tracking-tight text-[#0f1e3d] sm:text-3xl">{s.value}</p>
                    <p className="mt-1 text-xs leading-4 text-slate-500">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div
              initial={reduce ? undefined : { opacity: 0, scale: 0.96, y: 16 }}
              animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="absolute inset-0 -z-10 rounded-[3rem] bg-blue-500/10 blur-3xl" />
              <PremiumDeviceHero />
            </motion.div>
          </section>

          {/* ── CAPABILITY STRIP ─────────────────────────────────────────── */}
          <motion.div
            {...reveal()}
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-y border-slate-100 py-5 text-center"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">One platform for</span>
            {capabilities.map((c, i) => (
              <span key={c} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-600">{c}</span>
                {i < capabilities.length - 1 && <span className="h-1 w-1 rounded-full bg-slate-300" />}
              </span>
            ))}
          </motion.div>

          {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
          <section id="how" className="scroll-mt-24 py-20 sm:py-28">
            <motion.div {...reveal()} className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">How it works</span>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.02em] text-[#0f1e3d] sm:text-[2.75rem] sm:leading-[1.1]">
                Three surfaces. One continuous device journey.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Every handoff from arrival to outbound stays traceable — the platform
                carries the device context forward instead of breaking at each team boundary.
              </p>
            </motion.div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {steps.map((s, i) => (
                <motion.article
                  key={s.step}
                  {...reveal(i * 0.08)}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_60px_-48px_rgba(15,30,61,0.45)] transition-all duration-300 hover:-translate-y-1.5 hover:border-blue-200 hover:shadow-[0_36px_80px_-44px_rgba(37,99,235,0.5)]"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-sky-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="pointer-events-none absolute right-4 top-2 select-none text-[5.5rem] font-black leading-none text-slate-50">
                    {s.step}
                  </span>
                  <div className="relative flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/25">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {s.eyebrow}
                    </span>
                  </div>
                  <h3 className="relative mt-6 text-xl font-bold leading-snug tracking-tight text-[#0f1e3d]">
                    {s.title}
                  </h3>
                  <p className="relative mt-3 flex-1 text-sm leading-7 text-slate-600">{s.description}</p>
                  <div className="relative mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Why it matters</p>
                    <p className="mt-1.5 text-sm font-medium leading-6 text-[#0f1e3d]">{s.focus}</p>
                  </div>
                  <div className="relative mt-5 flex flex-wrap gap-2">
                    {s.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          {/* ── PAUSE BAND ───────────────────────────────────────────────── */}
          <motion.section
            {...reveal()}
            className="relative overflow-hidden rounded-[2.5rem] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-50/40 px-6 py-16 text-center sm:px-12"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Built for clarity</p>
            <p className="relative mx-auto mt-4 max-w-3xl text-[1.75rem] font-bold leading-tight tracking-tight text-[#0f1e3d] sm:text-4xl">
              Designed to stay calm while the work gets complicated.
            </p>
            <p className="relative mx-auto mt-5 max-w-xl text-base leading-8 text-slate-600">
              The goal is not more features. It is one clear path from device arrival to
              successful delivery — for every role, every order, every time.
            </p>
          </motion.section>

          {/* ── PRINCIPLES ───────────────────────────────────────────────── */}
          <section id="principles" className="scroll-mt-24 py-20 sm:py-28">
            <motion.div {...reveal()} className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Design principles</span>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.02em] text-[#0f1e3d] sm:text-[2.75rem] sm:leading-[1.1]">
                Clean on first glance. Deep when you keep going.
              </h2>
            </motion.div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {principles.map((p, i) => (
                <motion.div
                  key={p.title}
                  {...reveal(i * 0.08)}
                  className="group rounded-3xl border border-slate-200 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_30px_70px_-46px_rgba(37,99,235,0.45)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#12224a] to-[#1e3a8a] text-white transition-transform duration-300 group-hover:scale-105">
                    <p.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-6 text-lg font-bold text-[#0f1e3d]">{p.title}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{p.description}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── LAUNCH CTA ───────────────────────────────────────────────── */}
          <motion.section
            id="launch"
            {...reveal()}
            className="relative scroll-mt-24 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#0d1a37] via-[#122a5c] to-[#1e40af] px-6 py-16 sm:px-14 sm:py-20"
          >
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            <div className="relative flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Ready to launch</span>
                <h2 className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-[2.75rem]">
                  A serious operations platform for every device lifecycle.
                </h2>
                <p className="mt-5 text-base leading-8 text-blue-100/80 sm:text-lg">
                  Trade-ins, CPO resale, pricing intelligence, COE operations, and
                  customer-facing workflows — all in one composed, role-aware system.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-shrink-0">
                <Link href="/login" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full bg-white text-[#0f1e3d] shadow-lg hover:bg-blue-50 sm:w-auto">
                    Open the platform
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full border-white/25 bg-white/10 text-white hover:bg-white/20 sm:w-auto">
                    Request access
                  </Button>
                </Link>
              </div>
            </div>
          </motion.section>

          {/* ── FOOTER ───────────────────────────────────────────────────── */}
          <footer className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-100 py-10 text-sm text-slate-500 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#12224a] to-[#1e3a8a] text-white">
                <ByteBackMark className="h-3.5 w-3.5" />
              </div>
              <span className="font-semibold text-[#0f1e3d]">Byte-Back</span>
              <span className="hidden text-slate-300 sm:inline">·</span>
              <span className="hidden sm:inline">Device Lifecycle Management Platform</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="transition-colors hover:text-[#0f1e3d]">Sign in</Link>
              <Link href="/register" className="transition-colors hover:text-[#0f1e3d]">Request access</Link>
              <span>© {new Date().getFullYear()}</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
