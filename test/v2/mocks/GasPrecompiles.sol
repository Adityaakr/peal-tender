// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// Near-free stand-ins for the two precompiles, so a gas measurement shows the
/// vault's own cost. Every account has a well-formed ML-DSA-87 key and every
/// signature verifies: use them only for measuring, never for behaviour tests.
contract GasKeyStatus {
    function pqcKeyStatus(address) external pure returns (bool, uint8, bytes memory, bool) {
        return (true, 1, new bytes(2592), true);
    }
}

contract GasVerify {
    function pqcVerify(bytes calldata, bytes calldata, bytes calldata) external pure returns (uint256) {
        return 1;
    }
}
