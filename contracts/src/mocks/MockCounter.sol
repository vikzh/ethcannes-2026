// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract MockCounter {
    uint256 public value;

    event ValueChanged(uint256 newValue);

    function increment() external {
        value += 1;
        emit ValueChanged(value);
    }
}
