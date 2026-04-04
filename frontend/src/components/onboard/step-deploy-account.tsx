"use client";

import { Rocket } from "lucide-react";
import { useCallback, useEffect } from "react";
import { parseEther, decodeEventLog, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  FACTORY_ABI,
  DEFAULT_GAS_FUND_ETH,
  buildModuleInits,
  computeSalt,
  getDeployment,
  DEFAULT_CHAIN_ID,
} from "@/lib/contracts";
import { TxStatus, type TxState } from "./tx-status";

interface StepDeployAccountProps {
  agentAddress: string;
  chainId: number;
  onSuccess: (accountAddress: string, txHash: string) => void;
}

export function StepDeployAccount({
  agentAddress,
  chainId,
  onSuccess,
}: StepDeployAccountProps) {
  const deployment = getDeployment(chainId ?? DEFAULT_CHAIN_ID);
  const {
    data: txHash,
    writeContract,
    isPending: isWritePending,
    isError: isWriteError,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isReceiptLoading,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Derive tx state
  let txState: TxState = "idle";
  let errorMessage: string | undefined;

  if (isWritePending) {
    txState = "confirming";
  } else if (txHash && isReceiptLoading) {
    txState = "pending";
  } else if (receipt) {
    txState = "confirmed";
  } else if (isWriteError) {
    txState = "failed";
    errorMessage = writeError?.message?.includes("User rejected")
      ? "Transaction rejected"
      : writeError?.message?.split("\n")[0] ?? "Transaction failed";
  } else if (isReceiptError) {
    txState = "failed";
    errorMessage = receiptError?.message?.split("\n")[0] ?? "Transaction failed";
  }

  // On receipt, extract account address from AccountDeployed event log
  useEffect(() => {
    if (receipt && txHash) {
      let accountAddress = "";
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "AccountDeployed" && decoded.args) {
            const args = decoded.args as unknown as { account: Address };
            accountAddress = args.account;
            break;
          }
        } catch {
          // Not our event, skip
        }
      }
      onSuccess(accountAddress, txHash);
    }
  }, [receipt, txHash, onSuccess]);

  const handleDeploy = useCallback(() => {
    if (!deployment) return;

    const salt = computeSalt();
    const modules = buildModuleInits(agentAddress as Address, deployment);

    writeContract({
      address: deployment.contracts.AbstractAccountFactory,
      abi: FACTORY_ABI,
      functionName: "deployAccount",
      args: [
        salt,
        deployment.contracts.PolicyHookRuleSpend,
        deployment.contracts.WhitelistRequestModule,
        modules,
        agentAddress as Address,
        deployment.contracts.AgentSessionValidator,
      ],
      value: parseEther(DEFAULT_GAS_FUND_ETH),
    });
  }, [agentAddress, deployment, writeContract]);

  const handleRetry = useCallback(() => {
    resetWrite();
  }, [resetWrite]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Deploy & Fund Account
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Deploy your AA smart account and fund the agent wallet with{" "}
          {DEFAULT_GAS_FUND_ETH} ETH for gas. This is a single transaction.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Agent Address
            </p>
            <p className="mt-1 break-all font-mono text-sm text-zinc-900">
              {agentAddress}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Gas Funding
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">
              {DEFAULT_GAS_FUND_ETH} ETH
            </p>
          </div>
        </div>
      </div>

      {txState === "idle" && (
        <button
          type="button"
          onClick={handleDeploy}
          disabled={!deployment}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Rocket className="h-4 w-4" />
          Deploy & Fund
        </button>
      )}

      <TxStatus
        status={txState}
        txHash={txHash}
        error={errorMessage}
        chainId={chainId}
        onRetry={txState === "failed" ? handleRetry : undefined}
      />
    </div>
  );
}
