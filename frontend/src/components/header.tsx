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
      className="h-9 w-9 shrink-0 rounded-full ring-1 ring-white/20"
      style={{
        background: `linear-gradient(135deg, hsl(${h}, 72%, 42%), hsl(${(h + 48) % 360}, 62%, 36%))`,
      }}
      aria-hidden
    />
  );
}

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#0f3c97] bg-[#031B5A] px-5 text-[#F4F8FF] shadow-[0_18px_48px_-36px_rgba(2,13,46,0.85)]">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/logo2.png"
          alt="Wallet Console logo"
          width={120}
          height={80}
          className="h-9 w-auto object-contain"
        />
        <span className="text-lg font-semibold tracking-tight text-[#F4F8FF]">
          Safe wallet for<span className="text-[#8CEFFF]"> AI agents</span>
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
                  className="flex items-center gap-2 rounded-full border border-[#19D9FF]/40 bg-[linear-gradient(90deg,_#37B6FF_0%,_#19D9FF_100%)] px-4 py-2 text-sm font-semibold text-[#031B5A] shadow-[0_16px_30px_-18px_rgba(25,217,255,0.8)] transition-transform hover:-translate-y-0.5"
                >
                  Connect wallet
                </button>
              );
            }
            return (
              <button
                type="button"
                onClick={openAccountModal}
                className="flex max-w-[min(100vw-8rem,320px)] items-center gap-2 rounded-full border border-white/15 bg-white/8 py-1 pl-1 pr-3 text-sm text-[#F4F8FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/12"
              >
                <AddressAvatar address={account.address} />
                <span className="truncate font-mono text-xs text-[#F4F8FF]">
                  {chain.name?.slice(0, 3)}:{shortAddress(account.address)}
                </span>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[linear-gradient(90deg,_#37B6FF_0%,_#19D9FF_100%)] text-[10px] font-bold text-[#031B5A]"
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
