## ADDED Requirements

### Requirement: Installer outputs onboarding URL with agent address
The installer's post-install summary SHALL include the frontend onboarding URL
with the agent wallet's EVM address as a query parameter. The URL format SHALL be:
```
https://myleashai.vercel.app/onboard?agent=0x<AGENT_EVM_ADDRESS>
```

The URL SHALL be displayed in the summary box after all installation steps complete,
alongside the existing address, wallet name, and agents information. The URL SHALL
use `https://myleashai.vercel.app/onboard` as the default base (production).
For local development, override via `AGENT_ONBOARD_URL=http://localhost:3000/onboard`.

#### Scenario: Onboarding URL in summary (default — production)
- **WHEN** the installer completes successfully and `AGENT_ONBOARD_URL` is not set
- **THEN** the summary includes a line like `Onboard:  https://myleashai.vercel.app/onboard?agent=0xAbC...dEf`

#### Scenario: Local development override
- **WHEN** `AGENT_ONBOARD_URL=http://localhost:3000/onboard` is set
- **THEN** the summary URL uses that base: `http://localhost:3000/onboard?agent=0xAbC...dEf`

#### Scenario: Curl install outputs URL
- **WHEN** the installer is run via `curl -fsSL .../get.sh | bash`
- **THEN** the onboarding URL is printed in the summary (same as direct execution)
