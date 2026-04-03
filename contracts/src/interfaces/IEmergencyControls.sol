// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC7579Module } from "./IERC7579Module.sol";

/// @notice Emergency controls interface.
/// Provides the owner with immediate shutdown capabilities without depending on
/// the agent key or the normal UserOperation flow.
///
/// The paused flag lives in PolicyHook (not here) — EmergencyControls is the
/// privileged setter. This keeps the enforcement logic in the hook's hot path
/// without introducing a cross-module dependency in preCheck.
///
/// Module type: Executor (2)
/// Storage pattern: stateless — all state mutations are forwarded to PolicyHook
///                  and AgentSessionValidator.
interface IEmergencyControls is IERC7579Module {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AccountPaused(address indexed account, address indexed triggeredBy);
    event AccountUnpaused(address indexed account, address indexed triggeredBy);
    event EmergencyShutdown(address indexed account, address indexed triggeredBy);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error CallerNotAccount();
    error InvalidModuleAddress(address provided);

    // -------------------------------------------------------------------------
    // Controls (owner-callable through account execute path)
    // -------------------------------------------------------------------------

    /// @notice Pauses agent execution by setting the paused flag in PolicyHook.
    /// @dev Must be called through the account's execute path (msg.sender == account).
    ///      Calls policyHook.pause() on the account's behalf.
    /// @param policyHook Address of the PolicyHook module installed on this account.
    function pause(address policyHook) external;

    /// @notice Unpauses agent execution.
    /// @param policyHook Address of the PolicyHook module installed on this account.
    function unpause(address policyHook) external;

    /// @notice Immediately revokes the current agent session.
    /// @dev Calls agentSessionValidator.revokeSession() on the account's behalf.
    /// @param agentSessionValidator Address of the AgentSessionValidator module.
    function revokeSession(address agentSessionValidator) external;

    /// @notice Combined emergency: pauses PolicyHook and revokes the agent session atomically.
    /// @dev Preferred over calling pause + revokeSession separately to minimise
    ///      the window between the two operations.
    /// @param policyHook            Address of the PolicyHook module.
    /// @param agentSessionValidator Address of the AgentSessionValidator module.
    function emergencyShutdown(address policyHook, address agentSessionValidator) external;

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns true if the account's PolicyHook is currently paused.
    /// @param policyHook Address of the PolicyHook module.
    function isPaused(address account, address policyHook) external view returns (bool);
}
