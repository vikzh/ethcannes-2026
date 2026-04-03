// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice ERC-7579 execution types.
/// Used by PolicyHook to decode the calldata received in preCheck.

// -------------------------------------------------------------------------
// ModeCode (bytes32 user-defined value type)
// -------------------------------------------------------------------------
// Layout (32 bytes):
//   [0]      CallType    — 0x00 single, 0x01 batch, 0xFE staticcall, 0xFF delegatecall
//   [1]      ExecType    — 0x00 revert on failure, 0x01 try/allow fail
//   [2..5]   Unused      — reserved (zeros)
//   [6..9]   ModeSelector — vendor-specific mode, default 0x00000000
//   [10..31] ModePayload — additional data (22 bytes)
// -------------------------------------------------------------------------

type ModeCode is bytes32;
type CallType is bytes1;
type ExecType is bytes1;
type ModeSelector is bytes4;
type ModePayload is bytes22;

// CallType constants
CallType constant CALLTYPE_SINGLE       = CallType.wrap(0x00);
CallType constant CALLTYPE_BATCH        = CallType.wrap(0x01);
CallType constant CALLTYPE_STATIC       = CallType.wrap(0xFE);
CallType constant CALLTYPE_DELEGATECALL = CallType.wrap(0xFF);

// ExecType constants
ExecType constant EXECTYPE_DEFAULT = ExecType.wrap(0x00);
ExecType constant EXECTYPE_TRY     = ExecType.wrap(0x01);

/// @notice Execution target for batch calls.
/// Matches the struct used by ERC-7579 account implementations.
struct Execution {
    address target;
    uint256 value;
    bytes   callData;
}

/// @notice Helpers for decoding ModeCode fields.
library ModeCodeLib {
    /// @notice Extracts the CallType from a ModeCode.
    function callType(ModeCode mode) internal pure returns (CallType) {
        return CallType.wrap(bytes1(ModeCode.unwrap(mode)));
    }

    /// @notice Extracts the ExecType from a ModeCode.
    function execType(ModeCode mode) internal pure returns (ExecType) {
        return ExecType.wrap(bytes1(ModeCode.unwrap(mode) << 8));
    }

    /// @notice Returns true if the call type is delegatecall.
    function isDelegatecall(ModeCode mode) internal pure returns (bool) {
        return CallType.unwrap(callType(mode)) == CallType.unwrap(CALLTYPE_DELEGATECALL);
    }

    /// @notice Returns true if the call type is a batch.
    function isBatch(ModeCode mode) internal pure returns (bool) {
        return CallType.unwrap(callType(mode)) == CallType.unwrap(CALLTYPE_BATCH);
    }

    /// @notice Returns true if the call type is a single call.
    function isSingle(ModeCode mode) internal pure returns (bool) {
        return CallType.unwrap(callType(mode)) == CallType.unwrap(CALLTYPE_SINGLE);
    }
}

/// @notice Helpers for decoding execution calldata from the account's execute call.
library ExecutionDecoder {
    /// @notice Decodes a single-call execution payload.
    /// @dev Single call encoding: abi.encodePacked(target, value, callData)
    ///      target = bytes[0:20], value = bytes[20:52], callData = bytes[52:]
    function decodeSingle(bytes calldata executionCalldata)
        internal
        pure
        returns (address target, uint256 value, bytes calldata callData)
    {
        target = address(bytes20(executionCalldata[:20]));
        value = uint256(bytes32(executionCalldata[20:52]));
        callData = executionCalldata[52:];
    }

    /// @notice Decodes a batch execution payload into an array of Execution structs.
    /// @dev Batch encoding: abi.encode(Execution[])
    function decodeBatch(bytes calldata executionCalldata)
        internal
        pure
        returns (Execution[] calldata executions)
    {
        assembly {
            let dataPointer := add(executionCalldata.offset, calldataload(executionCalldata.offset))
            executions.offset := add(dataPointer, 0x20)
            executions.length := calldataload(dataPointer)
        }
    }
}
