"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

interface BetDeclarationDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (description: string) => void;
}

export function BetDeclarationDrawer({
  open,
  onClose,
  onConfirm,
}: BetDeclarationDrawerProps) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleConfirm = () => {
    if (!text.trim()) return;
    setSubmitted(true);
    onConfirm(text.trim());
  };

  const handleClose = () => {
    setText("");
    setSubmitted(false);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && handleClose()}>
      <DrawerContent className="bg-[#0A0A0F] border-white/10 max-w-lg mx-auto">
        <DrawerHeader className="px-6 pt-6 pb-2">
          <DrawerTitle className="text-[15px] font-semibold text-white/90">
            Describe your current product bet
          </DrawerTitle>
          <DrawerDescription className="text-[12px] text-white/40 mt-1">
            Write it in your own words. Aegis will extract the name, hypothesis,
            and one success metric.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-6 py-4">
          {!submitted ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. We're betting that making Linear workflows visible inside an Agentic UI will reduce the time founders spend on decision-making by 30% this quarter."
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-[#4F7EFF]/50"
            />
          ) : (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
              <p className="text-[12px] text-emerald-400">
                Got it. Aegis will use this to monitor your bet.
              </p>
            </div>
          )}
        </div>

        <DrawerFooter className="px-6 pb-6 pt-2 flex flex-row gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-white/40 hover:text-white/70"
          >
            Cancel
          </Button>
          {!submitted && (
            <Button
              size="sm"
              disabled={!text.trim()}
              onClick={handleConfirm}
              className="bg-[#4F7EFF] hover:bg-[#4F7EFF]/80 text-white"
            >
              Confirm Bet
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
