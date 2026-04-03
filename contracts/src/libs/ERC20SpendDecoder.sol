// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Decodes ERC-20 calldata to extract spend amounts for spend-limit enforcement.
/// Handles the three standard ERC-20 functions that move or commit tokens:
///   - transfer(address to, uint256 amount)
///   - approve(address spender, uint256 amount)
///   - transferFrom(address from, address to, uint256 amount)
///
/// Any other selector returns amount = 0 (non-ERC-20 calls are not spend-tracked).
library ERC20SpendDecoder {
    bytes4 internal constant SEL_TRANSFER      = bytes4(keccak256("transfer(address,uint256)"));
    bytes4 internal constant SEL_APPROVE       = bytes4(keccak256("approve(address,uint256)"));
    bytes4 internal constant SEL_TRANSFER_FROM = bytes4(keccak256("transferFrom(address,address,uint256)"));

    /// @notice Decodes the spend amount from ERC-20 calldata.
    /// @param selector The 4-byte function selector.
    /// @param data     The calldata excluding the selector (i.e. the ABI-encoded arguments).
    /// @return amount  The token amount involved in the call. Zero for unrecognised selectors.
    function decodeSpendAmount(bytes4 selector, bytes calldata data)
        internal
        pure
        returns (uint256 amount)
    {
        if (selector == SEL_TRANSFER) {
            // transfer(address to, uint256 amount)
            // amount is the second argument
            if (data.length >= 64) {
                amount = abi.decode(data[32:64], (uint256));
            }
        } else if (selector == SEL_APPROVE) {
            // approve(address spender, uint256 amount)
            // amount is the second argument
            if (data.length >= 64) {
                amount = abi.decode(data[32:64], (uint256));
            }
        } else if (selector == SEL_TRANSFER_FROM) {
            // transferFrom(address from, address to, uint256 amount)
            // amount is the third argument
            if (data.length >= 96) {
                amount = abi.decode(data[64:96], (uint256));
            }
        }
        // All other selectors return 0 — not spend-tracked.
    }

    /// @notice Returns true if the selector is a tracked ERC-20 spend function.
    function isSpendSelector(bytes4 selector) internal pure returns (bool) {
        return selector == SEL_TRANSFER
            || selector == SEL_APPROVE
            || selector == SEL_TRANSFER_FROM;
    }
}
