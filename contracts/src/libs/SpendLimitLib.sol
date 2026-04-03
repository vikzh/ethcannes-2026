// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHook } from "../interfaces/IPolicyHook.sol";

/// @notice Library for rolling-window ERC-20 spend limit enforcement.
/// Operates directly on IPolicyHook.SpendLimit storage references to avoid
/// unnecessary memory copies in the hot path.
library SpendLimitLib {
    /// @notice Checks whether adding `amount` to the current window spend would
    ///         exceed the configured limit. If not, accumulates the spend.
    ///         Resets the window if the current period has expired.
    ///
    /// @dev Must be called with a storage pointer to the SpendLimit struct.
    ///      All mutations are applied to storage directly.
    ///
    /// @param sl     Storage pointer to the SpendLimit to check and update.
    /// @param amount Amount to be spent in the current call.
    function checkAndAccumulate(IPolicyHook.SpendLimit storage sl, uint256 amount) internal {
        // No limit configured — nothing to check.
        if (sl.maxPerPeriod == 0) return;

        _resetIfExpired(sl);

        uint256 newSpend = sl.spentInPeriod + amount;
        if (newSpend > sl.maxPerPeriod) {
            uint256 remaining = sl.maxPerPeriod - sl.spentInPeriod;
            revert IPolicyHook.SpendLimitExceeded(sl.token, amount, remaining);
        }

        sl.spentInPeriod = newSpend;
    }

    /// @notice Resets the rolling window if the current period has expired.
    /// @dev Idempotent — safe to call multiple times within the same block.
    function resetIfExpired(IPolicyHook.SpendLimit storage sl) internal {
        _resetIfExpired(sl);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _resetIfExpired(IPolicyHook.SpendLimit storage sl) private {
        if (sl.periodDuration == 0) return;
        if (block.timestamp >= sl.periodStart + sl.periodDuration) {
            sl.spentInPeriod = 0;
            sl.periodStart   = block.timestamp;
        }
    }
}
