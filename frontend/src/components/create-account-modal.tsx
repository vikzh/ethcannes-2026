"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  LoaderCircle,
  CheckCircle2,
  AlertTriangle,
  Rocket,
} from "lucide-react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import {
  parseEther,
  decodeEventLog,
  isAddress,
  getAddress,
  type Address,
} from "viem";
import {
  FACTORY_ABI,
  DEFAULT_GAS_FUND_ETH,
  buildModuleInits,
  computeSalt,
  getDeployment,
  DEFAULT_CHAIN_ID,
} from "@/lib/contracts";

interface CreateAccountModalProps {
  onClose: () => void;
  onSuccess: (accountAddress: string) => void;
}

export function CreateAccountModal({
  onClose,
  onSuccess,
}: CreateAccountModalProps) {
  const { chainId } = useAccount();
  const deployment = getDeployment(chainId ?? DEFAULT_CHAIN_ID);

  const [agentAddress, setAgentAddress] = useState("");
  const normalizedAgent =
    isAddress(agentAddress, { strict: false })
      ? getAddress(agentAddress)
      : undefined;

  const {
    data: txHash,
    writeContract,
    isPending: isSigning,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Extract account address from receipt and notify parent
  useEffect(() => {
    if (receipt && txHash) {
      let accountAddr = "";
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "AccountDeployed" && decoded.args) {
            const args = decoded.args as unknown as { account: Address };
            accountAddr = args.account;
            break;
          }
        } catch {
          // Not our event
        }
      }
      const timer = setTimeout(() => {
        onSuccess(accountAddr);
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [receipt, txHash, onSuccess, onClose]);

  const handleDeploy = useCallback(() => {
    if (!deployment || !normalizedAgent) return;
    resetWrite();

    const salt = computeSalt();
    const modules = buildModuleInits(normalizedAgent, deployment);

    writeContract({
      address: deployment.contracts.AbstractAccountFactory,
      abi: FACTORY_ABI,
      functionName: "deployAccount",
      args: [
        salt,
        deployment.contracts.PolicyHookRuleSpend,
        modules,
        normalizedAgent,
        deployment.contracts.AgentSessionValidator,
      ],
      value: parseEther(DEFAULT_GAS_FUND_ETH),
    });
  }, [deployment, normalizedAgent, writeContract, resetWrite]);

  const canSubmit =
    normalizedAgent !== undefined &&
    deployment !== undefined &&
    !isSigning &&
    !isConfirming &&
    !isConfirmed;

  const error = writeError || receiptError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            Create Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-zinc-500">
          Deploy a new smart account and fund the agent wallet with{" "}
          {DEFAULT_GAS_FUND_ETH} ETH for gas.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Agent wallet address
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value.trim())}
              disabled={isSigning || isConfirming || isConfirmed}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-50"
            />
            {agentAddress.length > 0 && !normalizedAgent && (
              <p className="mt-1.5 text-xs text-rose-600">
                Enter a valid Ethereum address
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Network
                </p>
                <p className="mt-1 text-sm text-zinc-900">
                  {deployment?.name ?? "Unsupported"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Gas funding
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {DEFAULT_GAS_FUND_ETH} ETH
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-xs text-rose-700">
              {(error as { shortMessage?: string }).shortMessage ||
                error.message}
            </p>
          </div>
        )}

        {isConfirmed && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-medium text-emerald-700">
              Account created successfully! Closing...
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleDeploy}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSigning ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Confirm in wallet...
              </>
            ) : isConfirming ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Deploy & Fund
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
