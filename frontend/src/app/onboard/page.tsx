"use client";

import Image from "next/image";
import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

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
    <div className="flex min-h-screen bg-white text-zinc-900">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-5">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Logo" width={96} height={96} className="-ml-5 h-28 w-28 object-contain" />
            <span className="text-lg font-semibold tracking-tight">
              Safe wallet for<span className="text-zinc-500"> AI agents</span>
            </span>
          </div>
        </header>

        <main className="px-10 pt-10" style={{ paddingLeft: "20%" }}>
          <div className="w-full max-w-xl">
            <h1 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900">
              Execute the following steps
            </h1>

            <div className="mt-8 overflow-hidden rounded-xl bg-[#282c34]">
              <div className="px-6 py-5">
                <code className="font-mono text-sm leading-relaxed text-zinc-100">
                  <span className="mr-4 select-none text-zinc-500">1</span>
                  {INSTALL_COMMAND}
                </code>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-700 px-4 py-2">
                <span className="text-xs text-zinc-500">Bash</span>
                <button
                  type="button"
                  onClick={copyCommand}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
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
    </div>
  );
}
