// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC7579Hook } from "./IERC7579Hook.sol";

/// @notice Policy hook interface.
/// Enforces all per-execution restrictions as an ERC-7579 execution hook.
/// Runs preCheck before every execute / executeBatch call on the account.
///
/// Whitelist granularity: (address target, bytes4 selector) tuples.
/// A wildcard selector (WILDCARD_SELECTOR = 0xffffffff) permits all functions on a target.
///
/// Spend limits: per-token rolling windows tracked by block.timestamp.
/// delegatecall: always blocked for agent sessions.
/// executeBatch: every call in the batch is checked individually;
///               spend accumulates across the batch before any call executes.
///
/// Module type: Hook (4)
/// Storage pattern: mapping(address account => PolicyState)
interface IPolicyHook is IERC7579Hook {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev Wildcard selector value. When stored in a whitelist entry, it permits
    ///      any function selector on the associated target address.
    // bytes4 public constant WILDCARD_SELECTOR = 0xffffffff;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @param target   Destination contract address.
    /// @param selector Allowed function selector. Use WILDCARD_SELECTOR for any function.
    /// @param active   Whether this entry is currently active.
    struct WhitelistEntry {
        address target;
        bytes4  selector;
        bool    active;
    }

    /// @param token           ERC-20 token address.
    /// @param maxPerPeriod    Maximum amount that may be spent in a single rolling window.
    /// @param periodDuration  Window length in seconds (e.g. 86400 = 1 day).
    /// @param spentInPeriod   Accumulated spend in the current window.
    /// @param periodStart     block.timestamp of the current window start.
    struct SpendLimit {
        address token;
        uint256 maxPerPeriod;
        uint256 periodDuration;
        uint256 spentInPeriod;
        uint256 periodStart;
    }

    /// @param nativeValueCapPerTx Max msg.value per execution call (0 = no cap).
    /// @param paused             Emergency pause flag. Blocks all agent execution when true.
    struct PolicyConfig {
        uint256 nativeValueCapPerTx;
        bool    paused;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event WhitelistEntryAdded(address indexed account, address indexed target, bytes4 indexed selector);
    event WhitelistEntryRemoved(address indexed account, address indexed target, bytes4 indexed selector);
    event SpendLimitSet(
        address indexed account,
        address indexed token,
        uint256 maxPerPeriod,
        uint256 periodDuration
    );
    event SpendLimitRemoved(address indexed account, address indexed token);
    event NativeValueCapSet(address indexed account, uint256 cap);
    event AccountPaused(address indexed account);
    event AccountUnpaused(address indexed account);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotWhitelisted(address target, bytes4 selector);
    error NativeValueCapExceeded(uint256 value, uint256 cap);
    error SpendLimitExceeded(address token, uint256 requested, uint256 remaining);
    error DelegatecallBlocked();
    error PolicyPaused(address account);
    error PrivilegedCallBlocked(address target, bytes4 selector);
    error CallerNotAccount();
    error EntryAlreadyExists(address target, bytes4 selector);
    error EntryNotFound(address target, bytes4 selector);

    // -------------------------------------------------------------------------
    // Whitelist management (owner-callable through account execute path)
    // -------------------------------------------------------------------------

    /// @notice Adds a (target, selector) entry to the active whitelist.
    /// @dev msg.sender must be the account (enforced by CallerNotAccount).
    ///      Use WILDCARD_SELECTOR to permit all selectors on target.
    function addWhitelistEntry(address target, bytes4 selector) external;

    /// @notice Removes a (target, selector) entry from the active whitelist.
    function removeWhitelistEntry(address target, bytes4 selector) external;

    /// @notice Returns true if the given (target, selector) tuple is whitelisted for account.
    /// @dev Also returns true if target is whitelisted with WILDCARD_SELECTOR.
    function isWhitelisted(address account, address target, bytes4 selector) external view returns (bool);

    // -------------------------------------------------------------------------
    // Spend limit configuration (owner-callable through account execute path)
    // -------------------------------------------------------------------------

    /// @notice Configures a rolling spend limit for an ERC-20 token.
    /// @param token          ERC-20 token address.
    /// @param maxPerPeriod   Maximum spend per rolling window.
    /// @param periodDuration Window length in seconds.
    function setSpendLimit(address token, uint256 maxPerPeriod, uint256 periodDuration) external;

    /// @notice Removes the spend limit for a token (no limit thereafter).
    function removeSpendLimit(address token) external;

    /// @notice Returns the current SpendLimit state for a given account and token.
    function getSpendLimit(address account, address token) external view returns (SpendLimit memory);

    // -------------------------------------------------------------------------
    // Native value cap (owner-callable through account execute path)
    // -------------------------------------------------------------------------

    /// @notice Sets the maximum msg.value permitted per execution call for the account.
    /// @param cap Maximum value in wei. 0 = no cap.
    function setNativeValueCap(uint256 cap) external;

    // -------------------------------------------------------------------------
    // Pause controls (callable by EmergencyControls module through account)
    // -------------------------------------------------------------------------

    /// @notice Pauses agent execution for the calling account.
    /// @dev Sets paused = true in PolicyConfig. Subsequent preCheck calls revert.
    function pause() external;

    /// @notice Unpauses agent execution for the calling account.
    function unpause() external;

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns the PolicyConfig for the given account.
    function getPolicy(address account) external view returns (PolicyConfig memory);
}
