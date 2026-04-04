import { Suspense } from "react";
import { OnboardApp } from "@/components/onboard/onboard-app";

export default function OnboardPage() {
  return (
    <Suspense>
      <OnboardApp />
    </Suspense>
  );
}
