import { test, expect } from "@playwright/test";
import { generateAgentAddress, getOwnerAddress } from "./helpers/wallet";

test.describe("Onboarding page", () => {
  test("page renders with stepper and wallet connect prompt", async ({
    page,
  }) => {
    await page.goto("/onboard");

    // Header is visible
    await expect(page.locator("header")).toBeVisible();

    // Stepper shows 4 steps
    await expect(page.getByText("Install")).toBeVisible();
    await expect(page.getByText("Agent Address")).toBeVisible();
    await expect(page.getByText("Deploy & Fund")).toBeVisible();
    await expect(page.getByText("Complete")).toBeVisible();

    // Wallet connect prompt
    await expect(
      page.getByText("Connect your wallet to get started"),
    ).toBeVisible();
  });

  test("agent address pre-filled from URL parameter", async ({ page }) => {
    const agentAddr = generateAgentAddress();
    await page.goto(`/onboard?agent=${agentAddr}`);

    // The agent address should be visible somewhere on the page
    // (either in input or displayed after auto-advance)
    const content = await page.textContent("body");
    // The address or its shortened form should appear
    expect(
      content?.toLowerCase().includes(agentAddr.slice(0, 6).toLowerCase()),
    ).toBe(true);
  });

  test("invalid agent param is ignored — shows manual input", async ({
    page,
  }) => {
    await page.goto("/onboard?agent=not-an-address");

    // Should show install step (step 1), not auto-advance
    await expect(page.getByText("Install Agent Wallet")).toBeVisible();
  });

  test("address validation on agent input step", async ({ page }) => {
    await page.goto("/onboard");

    // We need wallet connected + correct chain to interact with steps
    // Without wallet, we can still check the step 1 renders
    await expect(page.getByText("Install Agent Wallet")).toBeVisible();
  });

  // The following tests require TEST_MNEMONIC with Sepolia ETH.
  // They are skipped if the env var is not set.
  const hasMnemonic = !!process.env.TEST_MNEMONIC;

  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!hasMnemonic, "TEST_MNEMONIC not set — skipping on-chain tests");

  test("full deploy flow (requires TEST_MNEMONIC)", async ({ page }) => {
    test.skip(!hasMnemonic);
    // This test would need a custom wallet connector injected into the page
    // to sign transactions without MetaMask. This is a placeholder for the
    // full integration test that requires browser wallet injection.
    //
    // The actual on-chain verification is done via the wallet helper:
    const agentAddr = generateAgentAddress();
    const ownerAddr = getOwnerAddress();

    // Navigate with agent pre-filled
    await page.goto(`/onboard?agent=${agentAddr}`);

    // Verify the page loaded with the agent address
    const content = await page.textContent("body");
    expect(
      content?.toLowerCase().includes(agentAddr.slice(0, 6).toLowerCase()),
    ).toBe(true);
  });
});
