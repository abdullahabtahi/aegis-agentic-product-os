"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

export function FirstRunGuide() {
  return (
    <div className="col-span-2 glass-panel rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
        <Zap size={28} className="text-indigo-400" />
      </div>
      <div>
        <h3 className="font-heading text-base font-semibold text-[#1a1c1d]">Welcome to Mission Control</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-xs">
          Aegis monitors your strategic directions and surfaces AI-recommended interventions.
        </p>
      </div>
      <Link
        href="/workspace"
        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        Declare a Direction
      </Link>
    </div>
  );
}
