"use client";

import { Check } from "lucide-react";

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="flex items-center">
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const isLast = i === steps.length - 1;

          return (
            <li
              key={label}
              className={`flex items-center ${isLast ? "" : "flex-1"}`}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    isComplete
                      ? "bg-emerald-600 text-white"
                      : isActive
                        ? "bg-zinc-900 text-white"
                        : "border-2 border-zinc-300 text-zinc-400"
                  }`}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    stepNum
                  )}
                </div>
                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    isComplete
                      ? "text-emerald-700"
                      : isActive
                        ? "text-zinc-900"
                        : "text-zinc-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mx-2 mt-[-18px] h-0.5 flex-1 rounded-full transition-colors ${
                    isComplete ? "bg-emerald-500" : "bg-zinc-200"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
