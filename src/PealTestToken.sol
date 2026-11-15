// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title PealTestToken
/// @notice A fixed-supply test token standing in for "the project's token" that
///         the treasury buys back. Testnet only; it has no value.
contract PealTestToken is ERC20 {
    constructor(address holder, uint256 supply) ERC20("Peal Tender Test Token", "tPEAL") {
        _mint(holder, supply);
    }
}
