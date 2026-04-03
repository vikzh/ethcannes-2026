// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC7579Validator } from "./IERC7579Validator.sol";

/// @notice Agent session validator interface.
/// Authenticates a delegated agent EOA key within a bounded session window.
/// The agent is NOT a co-owner — it can only operate while a session is active
/// and within the constraints enforced by PolicyHook.
///
/// Module type: Validator (1)
/// Storage pattern: mapping(address account => Session)
interface IAgentSessionValidator is IERC7579Validator {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct Session {
        /// @dev EOA address whose ECDSA signature is accepted for this account.
        address agentKey;
        /// @dev block.timestamp must be >= validAfter for the session to be active.
        uint48  validAfter;
        /// @dev block.timestamp must be < validUntil. Zero means no expiry.
        uint48  validUntil;
        /// @dev Incremented each time a new session is created. Revoked sessions
        ///      are invalidated by a nonce mismatch in stored vs checked values.
        uint256 nonce;
        /// @dev Explicit revocation flag set by revokeSession or emergencyShutdown.
        bool    revoked;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event SessionCreated(
        address indexed account,
        uint256 indexed nonce,
        address indexed agentKey,
        uint48 validAfter,
        uint48 validUntil
    );

    event SessionRevoked(address indexed account, uint256 indexed nonce);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error SessionExpired(uint48 validUntil, uint256 currentTime);
    error SessionNotStarted(uint48 validAfter, uint256 currentTime);
    error SessionIsRevoked(address account, uint256 nonce);
    error NoActiveSession(address account);
    error InvalidAgentSignature();
    error WrongAgentKey(address provided, address expected);
    error AlreadyInitialized(address account);

    // -------------------------------------------------------------------------
    // Session lifecycle (owner-callable through account execute path)
    // -------------------------------------------------------------------------

    /// @notice Creates a new session for the calling account.
    /// @dev Overwrites any existing session. Increments the session nonce.
    ///      Must be called through the account's execute path (msg.sender == account)
    ///      and validated by the owner validator.
    /// @param agentKey   EOA address authorised to sign UserOps for this account.
    /// @param validAfter Timestamp after which the session becomes active.
    /// @param validUntil Timestamp after which the session expires. 0 = no expiry.
    function createSession(address agentKey, uint48 validAfter, uint48 validUntil) external;

    /// @notice Immediately revokes the current session for the calling account.
    /// @dev Sets revoked = true. Does not increment the nonce.
    ///      Must be called through the account's execute path (msg.sender == account).
    function revokeSession() external;

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns the current Session struct for the given account.
    function getSession(address account) external view returns (Session memory session);

    /// @notice Returns true if the account has a valid, non-expired, non-revoked session.
    function hasActiveSession(address account) external view returns (bool);
}
