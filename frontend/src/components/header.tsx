"use client";

import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

function shortAddress(addr: string) {
  const a = addr.startsWith("0x") ? addr : `0x${addr}`;
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function AddressAvatar({ address }: { address: string }) {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return (
    <div
      className="h-9 w-9 shrink-0 rounded-full ring-1 ring-zinc-200"
      style={{
        background: `linear-gradient(135deg, hsl(${h}, 72%, 42%), hsl(${(h + 48) % 360}, 62%, 36%))`,
      }}
      aria-hidden
    />
  );
}

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-5">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/logo3.png"
          alt="Wallet Console logo"
          width={120}
          height={80}
          className="h-9 w-auto object-contain"
        />
        <span className="text-lg font-semibold tracking-tight">
          Safe wallet for<span className="text-zinc-500"> AI agents</span>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <ConnectButton.Custom>
          {({
            account,
            chain,
            mounted,
            openConnectModal,
            openAccountModal,
          }) => {
            const ready = mounted;
            const connected = ready && account && chain;
            if (!connected) {
              return (
                <button
                  type="button"
                  onClick={openConnectModal}
                  className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  Connect wallet
                </button>
              );
            }
            return (
              <button
                type="button"
                onClick={openAccountModal}
                className="flex max-w-[min(100vw-8rem,320px)] items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-3 text-sm shadow-sm hover:bg-zinc-50"
              >
                <AddressAvatar address={account.address} />
                <span className="truncate font-mono text-xs text-zinc-700">
                  {chain.name?.slice(0, 3)}:{shortAddress(account.address)}
                </span>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white"
                  title={chain.name}
                >
                  ◆
                </span>
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}
