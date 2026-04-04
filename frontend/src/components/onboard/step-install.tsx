"use client";

import { Copy, Check, Terminal } from "lucide-react";
import { useState, useCallback } from "react";

const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/vikzh/ethcannes-2026/main/installer/get.sh | bash";

interface StepInstallProps {
  onContinue: () => void;
}

export function StepInstall({ onContinue }: StepInstallProps) {
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Install Agent Wallet
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Run this command in your terminal to install the agent wallet locally.
          It generates a secure key pair and configures your AI coding agents.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl bg-[#282c34] shadow-lg">
        <div className="flex items-center gap-2 border-b border-zinc-700 px-4 py-2.5">
          <Terminal className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-500">Terminal</span>
        </div>
        <div className="px-5 py-4">
          <code className="block break-all font-mono text-sm leading-relaxed text-zinc-100">
            {INSTALL_COMMAND}
          </code>
        </div>
        <div className="flex items-center justify-end border-t border-zinc-700 px-4 py-2">
          <button
            type="button"
            onClick={copyCommand}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        Continue
      </button>
    </div>
  );
}
