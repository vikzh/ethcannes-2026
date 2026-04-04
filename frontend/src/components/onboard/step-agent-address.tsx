"use client";

import { ClipboardPaste } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { isAddress } from "viem";

interface StepAgentAddressProps {
  initialAddress?: string;
  onSubmit: (address: string) => void;
}

export function StepAgentAddress({ initialAddress, onSubmit }: StepAgentAddressProps) {
  const [value, setValue] = useState(initialAddress ?? "");
  const [touched, setTouched] = useState(false);

  const isValid = isAddress(value);
  const showError = touched && value.length > 0 && !isValid;

  // Auto-advance if initial address is valid
  useEffect(() => {
    if (initialAddress && isAddress(initialAddress)) {
      onSubmit(initialAddress);
    }
  }, [initialAddress, onSubmit]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text.trim());
      setTouched(true);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Agent Wallet Address
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Enter the agent wallet address from the installer output, or paste it
          from your clipboard.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.trim());
              setTouched(true);
            }}
            placeholder="0x..."
            spellCheck={false}
            autoComplete="off"
            className={`flex-1 rounded-xl border px-4 py-2.5 font-mono text-sm outline-none transition-colors placeholder:text-zinc-400 ${
              showError
                ? "border-rose-300 bg-rose-50 focus:border-rose-500"
                : "border-zinc-200 bg-white focus:border-zinc-400"
            }`}
          />
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
            title="Paste from clipboard"
          >
            <ClipboardPaste className="h-4 w-4" />
            Paste
          </button>
        </div>
        {showError && (
          <p className="text-xs text-rose-600">
            Enter a valid Ethereum address (0x followed by 40 hex characters)
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={!isValid}
        onClick={() => onSubmit(value)}
        className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}
