import { z } from "zod";
import { MiniKit } from "@worldcoin/minikit-js";
import { getIsUserVerified } from "@worldcoin/minikit-js/address-book";

export function registerWorldIdTools(server) {
  server.tool(
    "resolve_worldid",
    "Resolve a World ID username (e.g. @alice) to an Ethereum address and check Orb verification status. Use this before sending tokens to a World ID user — pass the returned address to transfer_erc20 or send_transaction.",
    {
      username: z
        .string()
        .describe("World ID username, with or without @ prefix (e.g. 'alice' or '@alice')"),
    },
    async ({ username }) => {
      const clean = username.replace(/^@/, "").trim().toLowerCase();
      if (!clean) {
        return {
          content: [{ type: "text", text: "Error: username cannot be empty." }],
          isError: true,
        };
      }

      let user;
      try {
        user = await MiniKit.getUserByUsername(clean);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to resolve World ID username "@${clean}": ${err.message}` }],
          isError: true,
        };
      }

      if (!user?.walletAddress) {
        return {
          content: [{ type: "text", text: `World ID username "@${clean}" not found or has no linked wallet.` }],
          isError: true,
        };
      }

      let verified = false;
      try {
        verified = await getIsUserVerified(user.walletAddress);
      } catch {
        // verification check failed — proceed without blocking
      }

      const text = [
        `World ID Resolution`,
        `  Username:  @${user.username || clean}`,
        `  Address:   ${user.walletAddress}`,
        `  Orb Verified: ${verified ? "Yes" : "No"}`,
        user.profilePictureUrl ? `  Avatar:    ${user.profilePictureUrl}` : null,
        ``,
        verified
          ? `This address is Orb-verified on World Chain. Safe to proceed.`
          : `Warning: This address is NOT Orb-verified. Proceed with caution.`,
        ``,
        `Use this address as the recipient for transfer_erc20 or send_transaction.`,
      ].filter(Boolean).join("\n");

      return {
        content: [
          { type: "text", text },
          { type: "text", text: JSON.stringify({ username: user.username || clean, address: user.walletAddress, verified }) },
        ],
      };
    }
  );

  server.tool(
    "lookup_worldid",
    "Reverse-lookup: find the World ID username for an Ethereum address and check Orb verification. Useful for displaying human-readable names.",
    {
      address: z
        .string()
        .describe("Ethereum address (0x...)"),
    },
    async ({ address }) => {
      let user;
      try {
        user = await MiniKit.getUserByAddress(address);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to look up World ID for ${address}: ${err.message}` }],
          isError: true,
        };
      }

      let verified = false;
      try {
        verified = await getIsUserVerified(address);
      } catch {
        // verification check failed — proceed without blocking
      }

      if (!user?.username) {
        const text = [
          `World ID Lookup`,
          `  Address:      ${address}`,
          `  Username:     (none)`,
          `  Orb Verified: ${verified ? "Yes" : "No"}`,
        ].join("\n");

        return {
          content: [
            { type: "text", text },
            { type: "text", text: JSON.stringify({ address, username: null, verified }) },
          ],
        };
      }

      const text = [
        `World ID Lookup`,
        `  Address:      ${user.walletAddress || address}`,
        `  Username:     @${user.username}`,
        `  Orb Verified: ${verified ? "Yes" : "No"}`,
        user.profilePictureUrl ? `  Avatar:       ${user.profilePictureUrl}` : null,
      ].filter(Boolean).join("\n");

      return {
        content: [
          { type: "text", text },
          { type: "text", text: JSON.stringify({ username: user.username, address: user.walletAddress || address, verified }) },
        ],
      };
    }
  );

  server.tool(
    "verify_worldid",
    "Check if an Ethereum address is Orb-verified via the World ID Address Book on World Chain. Returns true/false.",
    {
      address: z
        .string()
        .describe("Ethereum address to check (0x...)"),
    },
    async ({ address }) => {
      let verified;
      try {
        verified = await getIsUserVerified(address);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Verification check failed: ${err.message}` }],
          isError: true,
        };
      }

      const text = [
        `World ID Verification`,
        `  Address:      ${address}`,
        `  Orb Verified: ${verified ? "Yes" : "No"}`,
        ``,
        verified
          ? `This address has a valid Orb verification on World Chain.`
          : `This address is NOT Orb-verified. The user may not have completed World ID verification.`,
      ].join("\n");

      return {
        content: [
          { type: "text", text },
          { type: "text", text: JSON.stringify({ address, verified }) },
        ],
      };
    }
  );
}
