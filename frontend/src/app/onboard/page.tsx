"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { type Address } from "viem";
import { isAddress } from "viem";
import { LoaderCircle, AlertTriangle } from "lucide-react";
import { Header } from "@/components/header";
import { Stepper } from "@/components/onboard/stepper";
import { StepInstall } from "@/components/onboard/step-install";
import { StepAgentAddress } from "@/components/onboard/step-agent-address";
import { StepDeployAccount } from "@/components/onboard/step-deploy-account";
import { StepComplete } from "@/components/onboard/step-complete";
import { AccountStatus } from "@/components/onboard/account-status";
import {
  FACTORY_ABI,
  getDeployment,
  DEFAULT_CHAIN_ID,
} from "@/lib/contracts";

const STEPS = ["Install", "Agent Address", "Deploy & Fund", "Complete"];

export default function OnboardPage() {
  const searchParams = useSearchParams();
  const agentParam = searchParams.get("agent");
  const initialAgent =
    agentParam && isAddress(agentParam) ? agentParam : undefined;

  const { address: ownerAddress, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const deployment = getDeployment(chainId ?? DEFAULT_CHAIN_ID);
  const isCorrectChain = chainId === DEFAULT_CHAIN_ID;

  // When agent is provided via URL, start at step 3 (skip install + address input)
  const startStep = initialAgent ? 3 : 1;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(startStep);
  const [agentAddress, setAgentAddress] = useState<string>(initialAgent ?? "");
  const [deployedAccount, setDeployedAccount] = useState<string>("");
  const [deployTxHash, setDeployTxHash] = useState<string>("");

  // Account existence check — only when we have a valid agent address
  const shouldCheckAccount =
    !!agentAddress &&
    isAddress(agentAddress) &&
    !!deployment &&
    isConnected &&
    isCorrectChain;

  const {
    data: existingAccount,
    isLoading: isCheckingAccount,
  } = useReadContract({
    address: deployment?.contracts.AbstractAccountFactory,
    abi: FACTORY_ABI,
    functionName: "getWalletByAgent",
    args: agentAddress ? [agentAddress as Address] : undefined,
    query: {
      enabled: shouldCheckAccount,
    },
  });

  const hasExistingAccount =
    !!existingAccount &&
    existingAccount !== "0x0000000000000000000000000000000000000000";

  // Are we still waiting for the existence check to resolve?
  const isWaitingForCheck = shouldCheckAccount && isCheckingAccount;

  const handleAgentSubmit = useCallback((addr: string) => {
    setAgentAddress(addr);
    setCurrentStep(3);
  }, []);

  const handleDeploySuccess = useCallback(
    (accountAddr: string, txHash: string) => {
      setDeployedAccount(accountAddr);
      setDeployTxHash(txHash);
      setCurrentStep(4);
    },
    [],
  );

  // Show status card for existing accounts
  if (
    hasExistingAccount &&
    isConnected &&
    isCorrectChain &&
    agentAddress &&
    !isWaitingForCheck
  ) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-zinc-900">
        <Header />
        <main className="flex flex-1 justify-center px-6 py-12">
          <div className="w-full max-w-2xl">
            <AccountStatus
              accountAddress={existingAccount as string}
              agentAddress={agentAddress}
              chainId={chainId!}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <Header />
      <main className="flex flex-1 justify-center px-6 py-12">
        <div className="w-full max-w-2xl space-y-10">
          {/* Stepper */}
          <Stepper steps={STEPS} currentStep={currentStep} />

          {/* Wallet connection gate */}
          {!isConnected && (
            <div className="rounded-[20px] border border-zinc-200 bg-zinc-50/80 p-8 text-center shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                Connect your wallet to get started
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                Connect your owner wallet using the button in the header to
                begin the onboarding process.
              </p>
            </div>
          )}

          {/* Wrong network */}
          {isConnected && !isCorrectChain && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-8">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Switch to Sepolia
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    This app runs on the Sepolia test network. Please switch
                    your wallet to continue.
                  </p>
                  <button
                    type="button"
                    onClick={() => switchChain({ chainId: DEFAULT_CHAIN_ID })}
                    className="mt-4 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    Switch to Sepolia
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Checking account existence */}
          {isConnected && isCorrectChain && isWaitingForCheck && (
            <div className="flex items-center justify-center gap-3 py-8 text-sm text-zinc-600">
              <LoaderCircle className="h-5 w-5 animate-spin text-zinc-900" />
              Checking if account already exists...
            </div>
          )}

          {/* Wizard steps */}
          {isConnected && isCorrectChain && !isWaitingForCheck && (
            <div className="rounded-[20px] border border-zinc-200 bg-white p-8 shadow-[0_20px_70px_-52px_rgba(0,0,0,0.55)]">
              {currentStep === 1 && (
                <StepInstall onContinue={() => setCurrentStep(2)} />
              )}

              {currentStep === 2 && (
                <StepAgentAddress
                  initialAddress={initialAgent}
                  onSubmit={handleAgentSubmit}
                />
              )}

              {currentStep === 3 && (
                <StepDeployAccount
                  agentAddress={agentAddress}
                  chainId={chainId!}
                  onSuccess={handleDeploySuccess}
                />
              )}

              {currentStep === 4 && (
                <StepComplete
                  accountAddress={deployedAccount}
                  ownerAddress={ownerAddress ?? ""}
                  agentAddress={agentAddress}
                  chainId={chainId!}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
