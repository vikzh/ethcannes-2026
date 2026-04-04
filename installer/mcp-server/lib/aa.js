import { encodeFunctionData, concat, pad, toHex, keccak256, encodeAbiParameters } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { scrypt, createDecipheriv } from "node:crypto";
import { ISOLATED_ACCOUNT_ABI, EIP712_DOMAIN } from "./abi/isolated-account.js";

const SINGLE_MODE = pad("0x00", { size: 32 });
const BATCH_MODE = pad("0x01", { size: 32, dir: "right" });

function encodeSingleExecution(target, value, callData) {
  const targetBytes = target.toLowerCase();
  const valueHex = pad(toHex(BigInt(value)), { size: 32 });
  return concat([targetBytes, valueHex, callData || "0x"]);
}

function encodeBatchExecution(calls) {
  return encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    [calls.map((c) => ({ target: c.target, value: BigInt(c.value || 0), callData: c.data || "0x" }))]
  );
}

let _cachedAccount = null;

/**
 * Decrypt the OWS keystore and derive the EVM signing account.
 * The wallet is created with an empty passphrase — security is provided
 * by on-chain AA policies, not local encryption.
 */
async function loadSigningAccount(walletName) {
  if (_cachedAccount) return _cachedAccount;

  if (process.env.AGENT_PRIVATE_KEY) {
    const key = process.env.AGENT_PRIVATE_KEY.trim();
    _cachedAccount = /^(0x)?[0-9a-fA-F]{64}$/.test(key)
      ? privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`)
      : mnemonicToAccount(key);
    return _cachedAccount;
  }

  const owsDir = join(homedir(), ".ows");
  const walletsDir = join(owsDir, "wallets");
  const files = (await readdir(walletsDir)).filter((f) => f.endsWith(".json"));

  let wallet;
  for (const f of files) {
    const w = JSON.parse(await readFile(join(walletsDir, f), "utf-8"));
    if (w.name === walletName) { wallet = w; break; }
  }
  if (!wallet) throw new Error(`Wallet "${walletName}" not found in OWS keystore`);

  const { crypto: c } = wallet;
  const salt = Buffer.from(c.kdfparams.salt, "hex");
  const maxmem = 256 * 1024 * 1024;

  const derivedKey = await new Promise((resolve, reject) => {
    scrypt("", salt, c.kdfparams.dklen, {
      N: c.kdfparams.n,
      r: c.kdfparams.r,
      p: c.kdfparams.p,
      maxmem,
    }, (err, key) => (err ? reject(err) : resolve(key)));
  });

  const iv = Buffer.from(c.cipherparams.iv, "hex");
  const ciphertext = Buffer.from(c.ciphertext, "hex");
  const authTag = Buffer.from(c.auth_tag, "hex");

  const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const mnemonic = decrypted.toString("utf-8").trim();

  _cachedAccount = mnemonicToAccount(mnemonic);
  return _cachedAccount;
}

/**
 * Build an executeAuthorized transaction for IsolatedAccount.
 * Signs EIP-712 typed data by decrypting the OWS keystore directly.
 */
export async function buildAATransaction({
  publicClient,
  owsExec,
  readApiKey,
  walletName,
  accountAddress,
  chainId,
  calls,
  deadline = 0,
}) {
  const accountNonce = await publicClient.readContract({
    address: accountAddress,
    abi: ISOLATED_ACCOUNT_ABI,
    functionName: "nonce",
  });

  const isBatch = calls.length > 1;
  const mode = isBatch ? BATCH_MODE : SINGLE_MODE;

  let executionCalldata;
  if (isBatch) {
    executionCalldata = encodeBatchExecution(calls);
  } else {
    const c = calls[0];
    executionCalldata = encodeSingleExecution(c.target, c.value || "0", c.data);
  }

  const executionCalldataHash = keccak256(executionCalldata);

  const domain = {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract: accountAddress,
  };

  const types = {
    ExecuteRequest: [
      { name: "mode", type: "bytes32" },
      { name: "executionCalldataHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    mode,
    executionCalldataHash,
    nonce: accountNonce,
    deadline: BigInt(deadline),
  };

  const account = await loadSigningAccount(walletName);

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "ExecuteRequest",
    message,
  });

  const outerData = encodeFunctionData({
    abi: ISOLATED_ACCOUNT_ABI,
    functionName: "executeAuthorized",
    args: [mode, executionCalldata, accountNonce, BigInt(deadline), signature],
  });

  const totalValue = calls.reduce((sum, c) => sum + BigInt(c.value || 0), 0n);

  return {
    outerTo: accountAddress,
    outerData,
    outerValue: totalValue.toString(),
    accountNonce,
  };
}
