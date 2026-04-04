"use client";

import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { Header } from "@/components/header";

const INSTALL_COMMAND = "npm install lishay-ai";

export default function OnboardPage() {
  const [copied, setCopied] = useState(false);

  const copyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#F7FAFF] text-[#0F172A]">
      <Header />
      <main className="px-10 pt-10" style={{ paddingLeft: "20%" }}>
        <div className="w-full max-w-xl rounded-[28px] border border-[#D9E4FF] bg-white p-8 shadow-[0_24px_72px_-56px_rgba(8,42,115,0.34)]">
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-[#0F172A]">
            Execute the following steps
          </h1>

          <div className="mt-8 overflow-hidden rounded-2xl border border-[#0F3C97] bg-[#031B5A] shadow-[0_24px_60px_-44px_rgba(2,13,46,0.85)]">
            <div className="px-6 py-5">
              <code className="font-mono text-sm leading-relaxed text-[#F4F8FF]">
                <span className="mr-4 select-none text-[#8CEFFF]/70">1</span>
                {INSTALL_COMMAND}
              </code>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
              <span className="text-xs text-[#8CEFFF]/80">Bash</span>
              <button
                type="button"
                onClick={copyCommand}
                className="flex items-center gap-1.5 text-xs font-medium text-[#8CEFFF] transition-colors hover:text-white"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy to clipboard
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
