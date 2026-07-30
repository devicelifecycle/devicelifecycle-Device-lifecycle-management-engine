"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import {
  ArrowRight,
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

const heroMoments = [
  { title: "Arrive", detail: "Intake stays clean" },
  { title: "Value", detail: "Pricing stays visible" },
  { title: "Move", detail: "Ops stay aligned" },
] as const;

const stats = [
  { value: "608+", label: "Device SKUs priced" },
  { value: "6", label: "Role-based workflows" },
  { value: "100%", label: "Lifecycle coverage" },
] as const;

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
    <div className="relative min-h-screen overflow-x-hidden bg-white text-slate-700">
      {/* Scroll progress */}
      <motion.div
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-blue-700 via-blue-500 to-sky-400"
      />

      {/* Ambient backdrop — absolute (painted once, no per-frame scroll repaint)
          and fully clipped so the glow can never widen the page. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[860px] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,30,61,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,30,61,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-40" />
        <div className="absolute -top-40 left-1/2 h-[26rem] w-[44rem] max-w-[92vw] -translate-x-1/2 rounded-full bg-blue-500/[0.07] blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-10">
        {/* HEADER */}
        <motion.header
          initial={reduce ? undefined : { opacity: 0, y: -16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-4 z-50 mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/92 px-4 py-3 shadow-[0_12px_40px_-26px_rgba(15,30,61,0.4)] backdrop-blur-md sm:px-6"
        >
          <Link href="#top" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f1e3d] text-white sm:h-10 sm:w-10">
              <ByteBackMark className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="leading-none">
              <p className="text-[1.25rem] font-extrabold tracking-tight text-[#0f1e3d] sm:text-[1.4rem]">
                Byte-Back
              </p>
              <p className="mt-0.5 hidden text-[9px] font-medium uppercase tracking-[0.22em] text-slate-400 sm:block">
                Device Lifecycle Management Platform
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex">
            {[
              ["How it works", "#how"],
              ["Principles", "#principles"],
              ["Launch", "#launch"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="text-sm font-medium text-slate-500 transition-colors hover:text-[#0f1e3d]"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login">
              <Button variant="outline" size="sm" className="border-slate-200 text-[#0f1e3d] hover:bg-slate-50 sm:h-10 sm:px-4">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="sm:h-10 sm:px-4">
                Request Access
              </Button>
            </Link>
          </div>
        </motion.header>

        <main id="top" className="pb-16 pt-6">
          {/* HERO */}
          <section className="grid items-center gap-10 py-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:py-16">
            <div className="space-y-7">
              <motion.span
                initial={reduce ? undefined : { opacity: 0, y: 14 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Device Lifecycle Platform
              </motion.span>

              <motion.h1
                initial={reduce ? undefined : { opacity: 0, y: 22 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.06 }}
                className="editorial-title text-[clamp(2.6rem,6.4vw,5.2rem)] font-bold leading-[1.05] tracking-tight text-[#0f1e3d]"
              >
                Devices move through the business
                <span className="block brand-gradient">in one clear flow.</span>
              </motion.h1>

              <motion.p
                initial={reduce ? undefined : { opacity: 0, y: 22 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="max-w-xl text-base leading-8 text-slate-600 sm:text-lg"
              >
                One platform manages every device from trade-in intake to certified
                resale — with pricing intelligence, COE operations, and customer
                visibility built in.
              </motion.p>

              <motion.div
                initial={reduce ? undefined : { opacity: 0, y: 22 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="flex flex-wrap gap-3"
              >
                <Link href="/login">
                  <Button size="lg">
                    Enter the platform
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="#how">
                  <Button size="lg" variant="outline" className="border-slate-200 text-[#0f1e3d] hover:bg-slate-50">
                    See how it works
                  </Button>
                </Link>
              </motion.div>

              <motion.div
                initial={reduce ? undefined : { opacity: 0, y: 18 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.24 }}
                className="grid max-w-lg grid-cols-3 gap-4 border-t border-slate-100 pt-6"
              >
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold tracking-tight text-[#0f1e3d]">{s.value}</p>
                    <p className="mt-1 text-xs leading-4 text-slate-500">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div
              initial={reduce ? undefined : { opacity: 0, scale: 0.97, y: 16 }}
              animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="absolute inset-0 -z-10 rounded-[3rem] bg-blue-500/10 blur-3xl" />
              <PremiumDeviceHero />
            </motion.div>
          </section>

          {/* HOW IT WORKS */}
          <section id="how" className="scroll-mt-24 py-16 sm:py-24">
            <motion.div {...reveal()} className="mx-auto max-w-2xl text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600">
                How it works
              </span>
              <h2 className="editorial-title mt-4 text-3xl font-bold tracking-tight text-[#0f1e3d] sm:text-5xl">
                Three surfaces. One continuous device journey.
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-600">
                Every handoff from arrival to outbound stays traceable because the
                platform carries the device context forward — not broken at each
                team boundary.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <motion.article
                  key={s.step}
                  {...reveal(i * 0.08)}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_60px_-48px_rgba(15,30,61,0.4)] transition-shadow duration-300 hover:shadow-[0_30px_70px_-42px_rgba(37,99,235,0.5)]"
                >
                  <span className="pointer-events-none absolute -right-2 -top-4 select-none text-[7rem] font-black leading-none text-slate-50">
                    {s.step}
                  </span>
                  <div className="relative flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {s.eyebrow}
                    </span>
                  </div>
                  <h3 className="relative mt-6 text-xl font-bold leading-snug text-[#0f1e3d]">
                    {s.title}
                  </h3>
                  <p className="relative mt-3 text-sm leading-7 text-slate-600">
                    {s.description}
                  </p>
                  <div className="relative mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                      Why it matters
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#0f1e3d]">{s.focus}</p>
                  </div>
                  <div className="relative mt-5 flex flex-wrap gap-2">
                    {s.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          {/* PAUSE BAND */}
          <motion.section
            {...reveal()}
            className="my-4 overflow-hidden rounded-[2.5rem] border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-6 py-14 text-center sm:px-12"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600">
              Built for clarity
            </p>
            <p className="editorial-title mx-auto mt-4 max-w-4xl text-3xl font-bold leading-tight tracking-tight text-[#0f1e3d] sm:text-5xl">
              Designed to stay calm while the work gets complicated.
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600">
              The goal is not more features. It is one clear path from device
              arrival to successful delivery — for every role, every order, every
              time.
            </p>
          </motion.section>

          {/* PRINCIPLES */}
          <section id="principles" className="scroll-mt-24 py-16 sm:py-24">
            <motion.div {...reveal()} className="mx-auto max-w-2xl text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600">
                Design principles
              </span>
              <h2 className="editorial-title mt-4 text-3xl font-bold tracking-tight text-[#0f1e3d] sm:text-5xl">
                Clean on first glance. Deep when you keep going.
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {principles.map((p, i) => (
                <motion.div
                  {...reveal(i * 0.08)}
                  key={p.title}
                  className="rounded-3xl border border-slate-200 bg-white p-7 transition-colors duration-300 hover:border-blue-200"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0f1e3d] text-white">
                    <p.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-6 text-lg font-bold text-[#0f1e3d]">{p.title}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{p.description}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* LAUNCH CTA */}
          <motion.section
            id="launch"
            {...reveal()}
            className="scroll-mt-24 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#0f1e3d] via-[#122a5c] to-[#1e40af] px-6 py-14 sm:px-12"
          >
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-300">
                  Ready to launch
                </span>
                <h2 className="editorial-title mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                  A serious operations platform for every device lifecycle.
                </h2>
                <p className="mt-5 text-base leading-8 text-blue-100/80">
                  Trade-ins, CPO resale, pricing intelligence, COE operations, and
                  customer-facing workflows — all in one composed, role-aware system.
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap gap-3">
                <Link href="/login">
                  <Button size="lg" className="bg-white text-[#0f1e3d] hover:bg-blue-50">
                    Open the platform
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="lg" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20">
                    Request access
                  </Button>
                </Link>
              </div>
            </div>
          </motion.section>

          {/* FOOTER */}
          <footer className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-100 py-8 text-sm text-slate-500 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f1e3d] text-white">
                <ByteBackMark className="h-3.5 w-3.5" />
              </div>
              <span className="font-semibold text-[#0f1e3d]">Byte-Back</span>
              <span className="hidden text-slate-300 sm:inline">·</span>
              <span className="hidden sm:inline">Device Lifecycle Management Platform</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="hover:text-[#0f1e3d]">Sign in</Link>
              <Link href="/register" className="hover:text-[#0f1e3d]">Request access</Link>
              <span>© {new Date().getFullYear()}</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
