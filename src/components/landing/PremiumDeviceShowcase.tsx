"use client";

import { useRef } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

type LandingChapterId = "arrival" | "pricing" | "operations";

type HeroDevice = {
  title: string;
  label: string;
  detail: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  className: string;
};

type StoryPanel = {
  label: string;
  title: string;
  summary: string;
  chips: string[];
  cards: Array<{
    title: string;
    caption: string;
    src: string;
    alt: string;
    width: number;
    height: number;
  }>;
};

const heroDevices: HeroDevice[] = [
  {
    title: "Intake",
    label: "Front Door",
    detail: "Customer, serial, and condition arrive together.",
    src: "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=920&q=90",
    alt: "Smartphone standing upright on a clean reflective surface.",
    width: 640,
    height: 1080,
    className: "md:translate-y-16 md:-rotate-[10deg]",
  },
  {
    title: "Decision",
    label: "Pricing Lens",
    detail: "Benchmarks and confidence signals stay in the same frame.",
    src: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1600&q=90",
    alt: "Laptop and phone arranged on a bright premium desk.",
    width: 1600,
    height: 1068,
    className: "md:-translate-y-6 md:scale-[1.06]",
  },
  {
    title: "Outbound",
    label: "Operations",
    detail: "The same device story continues through the floor.",
    src: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=920&q=90",
    alt: "Close-up of a premium smartphone held in hand.",
    width: 640,
    height: 1094,
    className: "md:translate-y-10 md:rotate-[10deg]",
  },
];

const storyPanels: Record<LandingChapterId, StoryPanel> = {
  arrival: {
    label: "Arrival Surface",
    title: "Capture the device before the noise begins.",
    summary:
      "The intake moment feels premium because the hardware, customer, and business context stay together from the first touch.",
    chips: ["Customer linked", "Serial locked", "Condition framed"],
    cards: [
      {
        title: "Identity in frame",
        caption: "A real device view makes the intake moment feel grounded, not abstract.",
        src: "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=920&q=90",
        alt: "Smartphone upright against a softly lit background.",
        width: 640,
        height: 1080,
      },
      {
        title: "Context nearby",
        caption: "Customer details and quote context stay visible without taking over the screen.",
        src: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1600&q=90",
        alt: "Laptop workspace used as a clean premium operations setup.",
        width: 1600,
        height: 1067,
      },
    ],
  },
  pricing: {
    label: "Pricing Surface",
    title: "Show the value in the same moment the team decides.",
    summary:
      "Side-by-side device imagery gives pricing a stronger stage, while the copy stays short and the logic stays readable.",
    chips: ["Benchmarks live", "Quote protected", "Confidence visible"],
    cards: [
      {
        title: "Signal first",
        caption: "The value conversation sits next to the device instead of hiding behind a settings page.",
        src: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=920&q=90",
        alt: "Premium smartphone photographed on a dark surface.",
        width: 640,
        height: 1081,
      },
      {
        title: "Decision nearby",
        caption: "A wider workstation view adds calm and perspective to the pricing step.",
        src: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1600&q=90",
        alt: "Laptop and phone placed together on a minimal desk.",
        width: 1600,
        height: 1068,
      },
    ],
  },
  operations: {
    label: "Operations Surface",
    title: "Keep the hardware story intact all the way to ship.",
    summary:
      "The page stays cleaner when the operational motion is shown with real devices and a few strong cues instead of extra blocks of explanation.",
    chips: ["Receiving staged", "Exceptions visible", "Outbound aligned"],
    cards: [
      {
        title: "Floor continuity",
        caption: "The same device stays recognizable as teams move from intake to outbound.",
        src: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=920&q=90",
        alt: "Hand holding a smartphone close up with premium finish.",
        width: 640,
        height: 1094,
      },
      {
        title: "Shipment ready",
        caption: "A cleaner supporting frame hints at fulfillment without turning the welcome page into a dashboard.",
        src: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1600&q=90",
        alt: "Open laptop on a desk used to suggest calm operational readiness.",
        width: 1600,
        height: 1067,
      },
    ],
  },
};

export function PremiumDeviceHero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ["start end", "end start"],
  });

  const runwayX = useTransform(
    scrollYProgress,
    [0, 0.45, 1],
    [shouldReduceMotion ? 0 : 28, 0, shouldReduceMotion ? 0 : -34],
  );
  const spotlightScale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [1, shouldReduceMotion ? 1 : 1.05, 1],
  );
  const spotlightOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.42, 0.58, 0.34]);

  return (
    <div ref={stageRef} className="premium-runway-shell grain-overlay relative overflow-hidden rounded-[2.8rem] p-5 sm:p-7">
      <motion.div className="premium-runway-spotlight absolute inset-x-[10%] top-10 h-44 rounded-full blur-3xl" style={{ scale: spotlightScale, opacity: spotlightOpacity }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.52),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(245,239,232,0.96)_38%,rgba(232,224,214,0.92)_100%)]" />
      <div className="absolute inset-x-8 bottom-10 h-24 rounded-full bg-[radial-gradient(circle,rgba(23,18,15,0.18)_0%,rgba(23,18,15,0.02)_68%,transparent_76%)] blur-2xl" />

      <div className="relative flex min-h-[34rem] flex-col justify-between gap-8 sm:min-h-[38rem]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#8a7665]">
              Cinematic Device Runway
            </p>
            <p className="mt-3 max-w-lg text-2xl font-semibold tracking-tight text-[#17120f] sm:text-[2rem]">
              Real hardware, arranged like a product reveal instead of a dashboard.
            </p>
          </div>
          <div className="hidden rounded-full border border-black/8 bg-white/72 px-3 py-1 text-xs text-[#514a44] sm:block">
            Scroll-reactive composition
          </div>
        </div>

        <motion.div
          className="premium-runway-grid relative grid items-end gap-4 md:grid-cols-[0.8fr_1.18fr_0.82fr] md:gap-5"
          style={{ x: runwayX }}
        >
          {heroDevices.map((device, index) => (
            <motion.article
              key={device.title}
              initial={{ opacity: 0, y: 26, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className={`premium-device-card ${device.className}`}
            >
              <motion.div
                animate={
                  shouldReduceMotion
                    ? undefined
                    : {
                        y: [0, -8 - index * 2, 0],
                        rotateZ: [0, index === 1 ? 0 : index === 0 ? -1.5 : 1.5, 0],
                      }
                }
                transition={{
                  duration: 5.8 + index * 0.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className={`premium-device-frame overflow-hidden rounded-[2rem] ${index === 1 ? "aspect-[7/5]" : "aspect-[5/7]"}`}
              >
                <Image
                  src={device.src}
                  alt={device.alt}
                  width={device.width}
                  height={device.height}
                  sizes="(min-width: 1024px) 28vw, (min-width: 640px) 50vw, 88vw"
                  priority={index === 1}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
              </motion.div>

              <div className="premium-device-meta mt-4 rounded-[1.7rem] px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.26em] text-[#8a7665]">
                  {device.label}
                </p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xl font-semibold tracking-tight text-[#17120f]">
                      {device.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#5a534d]">
                      {device.detail}
                    </p>
                  </div>
                  <div className="hidden text-[10px] uppercase tracking-[0.22em] text-[#8f8277] sm:block">
                    0{index + 1}
                  </div>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>

        <div className="grid gap-3 sm:grid-cols-3">
          {heroDevices.map((device) => (
            <div key={device.title} className="rounded-full border border-black/8 bg-white/65 px-4 py-3 text-center text-[11px] uppercase tracking-[0.24em] text-[#5e5650]">
              {device.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PremiumStoryShowcase({ chapterId }: { chapterId: LandingChapterId }) {
  const shouldReduceMotion = useReducedMotion();
  const panel = storyPanels[chapterId];

  return (
    <div className="premium-story-shell relative flex min-h-[31rem] flex-col justify-between gap-8 sm:min-h-[34rem]">
      <AnimatePresence mode="wait">
        <motion.div
          key={chapterId}
          initial={{ opacity: 0, y: 20, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.985 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex h-full flex-col justify-between gap-8"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/46">
                  {panel.label}
                </p>
                <p className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-[2.45rem]">
                  {panel.title}
                </p>
              </div>
              <div className="hidden rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/66 sm:block">
                Visual chapter
              </div>
            </div>

            <p className="max-w-2xl text-base leading-8 text-white/68">
              {panel.summary}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.04fr_0.96fr]">
            {panel.cards.map((card, index) => (
              <motion.article
                key={card.title}
                animate={
                  shouldReduceMotion
                    ? undefined
                    : { y: [0, index === 0 ? -8 : -5, 0] }
                }
                transition={{
                  duration: 5.6 + index * 0.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className={`premium-story-card overflow-hidden rounded-[2rem] ${index === 0 ? "md:-rotate-[2deg]" : "md:translate-y-10 md:rotate-[2deg]"}`}
              >
                <div className={`premium-story-media relative ${index === 0 ? "aspect-[5/6]" : "aspect-[16/10]"}`}>
                  <Image
                    src={card.src}
                    alt={card.alt}
                    width={card.width}
                    height={card.height}
                    sizes="(min-width: 1024px) 22vw, (min-width: 640px) 42vw, 88vw"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/42 via-black/12 to-transparent" />
                </div>

                <div className="rounded-[1.8rem] px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/46">
                    Panel 0{index + 1}
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-white">
                    {card.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/64">
                    {card.caption}
                  </p>
                </div>
              </motion.article>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {panel.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/70"
              >
                {chip}
              </span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
