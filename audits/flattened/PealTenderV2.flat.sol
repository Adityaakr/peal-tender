// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20 ^0.8.24;

// lib/openzeppelin-contracts/contracts/utils/Errors.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/Errors.sol)

/**
 * @dev Collection of common custom errors used in multiple contracts
 *
 * IMPORTANT: Backwards compatibility is not guaranteed in future versions of the library.
 * It is recommended to avoid relying on the error API for critical functionality.
 *
 * _Available since v5.1._
 */
library Errors {
    /**
     * @dev The ETH balance of the account is not enough to perform the operation.
     */
    error InsufficientBalance(uint256 balance, uint256 needed);

    /**
     * @dev A call to an address target failed. The target may have reverted.
     */
    error FailedCall();

    /**
     * @dev The deployment failed.
     */
    error FailedDeployment();

    /**
     * @dev A necessary precompile is missing.
     */
    error MissingPrecompile(address);
}

// lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// src/interfaces/ISealedAuction.sol

/// @title ISealedAuction
/// @notice The part of Peal Sealed Auction (github.com/Adityaakr/peal-sealed-auction)
///         that the treasury vault calls. Peal Tender imports nothing else from that
///         repository; the two only meet at run time, through these functions.
///
/// `Config` must stay field-for-field identical to `SealedAuction.Config`, because
/// the factory takes it as a calldata tuple. `docs/spikes.md` records how this was
/// checked against the auction's compiled ABI.
interface ISealedAuction {
    enum State {
        Created,
        Funded,
        CommitOpen,
        Closed,
        Settled,
        Failed,
        Cancelled
    }

    struct Config {
        address issuer;
        address saleToken;
        address quoteToken;
        uint256 totalSupply;
        uint8 saleDecimals;
        uint256 reservePrice; // quote base units per whole sale token at tick 0
        uint256 tickSize;
        uint16 numTicks;
        uint64 startTime;
        uint64 endTime;
        uint64 releaseDeadline;
        uint256 minBidQuantity;
        uint256 maxQuantityPerAddress; // 0 = no cap
        uint32 maxBids;
        uint256 bidBond; // quote base units, on top of escrow
        uint16 protocolFeeBps;
        address feeRecipient;
        bytes32 committeeSetId;
        bytes32 metadataHash;
    }

    function config() external view returns (Config memory);
    function state() external view returns (State);
    function proceedsClaimed() external view returns (bool);
    function unsoldClaimed() external view returns (bool);

    /// @notice Issuer only: before bidding opens, or while open with no bids. Returns the supply.
    function cancel() external;
    /// @notice Settled only, anyone: pays the proceeds (quote token) to the issuer.
    function claimProceeds() external;
    /// @notice Settled or failed, anyone: returns the unsold supply to the issuer.
    function claimUnsold() external;
}

/// @notice The factory that creates, funds and opens a `SealedAuction` in one call.
interface ISealedAuctionFactory {
    /// @notice The caller must be `cfg.issuer` and must have approved `cfg.totalSupply`
    ///         of the sale token to the factory.
    function createAuction(ISealedAuction.Config calldata cfg, string calldata name, string calldata details)
        external
        returns (address auction);

    function isAuction(address auction) external view returns (bool);

    function metadataHash(string calldata name, string calldata details) external pure returns (bytes32);
}

// lib/openzeppelin-contracts/contracts/utils/Panic.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/Panic.sol)

/**
 * @dev Helper library for emitting standardized panic codes.
 *
 * ```solidity
 * contract Example {
 *      using Panic for uint256;
 *
 *      // Use any of the declared internal constants
 *      function foo() { Panic.GENERIC.panic(); }
 *
 *      // Alternatively
 *      function foo() { Panic.panic(Panic.GENERIC); }
 * }
 * ```
 *
 * Follows the list from https://github.com/ethereum/solidity/blob/v0.8.24/libsolutil/ErrorCodes.h[libsolutil].
 *
 * _Available since v5.1._
 */
// slither-disable-next-line unused-state
library Panic {
    /// @dev generic / unspecified error
    uint256 internal constant GENERIC = 0x00;
    /// @dev used by the assert() builtin
    uint256 internal constant ASSERT = 0x01;
    /// @dev arithmetic underflow or overflow
    uint256 internal constant UNDER_OVERFLOW = 0x11;
    /// @dev division or modulo by zero
    uint256 internal constant DIVISION_BY_ZERO = 0x12;
    /// @dev enum conversion error
    uint256 internal constant ENUM_CONVERSION_ERROR = 0x21;
    /// @dev invalid encoding in storage
    uint256 internal constant STORAGE_ENCODING_ERROR = 0x22;
    /// @dev empty array pop
    uint256 internal constant EMPTY_ARRAY_POP = 0x31;
    /// @dev array out of bounds access
    uint256 internal constant ARRAY_OUT_OF_BOUNDS = 0x32;
    /// @dev resource error (too large allocation or too large array)
    uint256 internal constant RESOURCE_ERROR = 0x41;
    /// @dev calling invalid internal function
    uint256 internal constant INVALID_INTERNAL_FUNCTION = 0x51;

    /// @dev Reverts with a panic code. Recommended to use with
    /// the internal constants with predefined codes.
    function panic(uint256 code) internal pure {
        assembly ("memory-safe") {
            mstore(0x00, 0x4e487b71)
            mstore(0x20, code)
            revert(0x1c, 0x24)
        }
    }
}

// lib/qore-pq-kit/src/PqAuth.sol

/// @title PqAuth
/// @notice Post-quantum authorisation for QoreChain EVM contracts.
///
/// A contract that uses this library names one *signer account*. Each sensitive
/// action must carry a fresh ML-DSA-87 signature, made with the post-quantum key
/// that account has registered on chain, over a message that binds:
///
///   DOMAIN ‖ chain id ‖ this contract ‖ signer ‖ action ‖ nonce ‖ deadline ‖ argument hash
///
/// The key is read from the chain's own registry (`pqcKeyStatus`, 0x…0A02) at
/// every check, so a key rotation on chain is followed automatically, and it is
/// only accepted if it is ML-DSA-87 AND was registered with a verified proof of
/// possession. The signature is checked by `pqcVerify` (0x…0A01).
///
/// Who sends the transaction does not matter. `msg.sender` authorises nothing:
/// anyone may relay a signed action, and nobody can act without one, including
/// whoever holds the signer account's classical secp256k1 key.
///
/// ## Failure is closed
///
/// - An inactive precompile answers with success and EMPTY data. Both helpers
///   refuse that: `keyOf` reverts with `PqPrecompileUnavailable`, and `verify`
///   reverts with it too, so a chain where the precompile is switched off cannot
///   be mistaken for "signature valid" or "no key".
/// - A failed call, a return of the wrong length, or any word other than exactly
///   1 is "invalid".
/// - The nonce is consumed only after the signature verifies, and each nonce is
///   accepted once, so a signature cannot be replayed. The deadline bounds how
///   long a signed-but-unused authorisation stays usable; `maxTtl` lets the
///   contract refuse signatures that were made to last too long.
library PqAuth {
    /// @dev Written lower-case on purpose. The docs and the SDK spell them
    ///      `0x…0A01`, which is not a valid EIP-55 checksum: solc refuses that
    ///      literal and viem refuses that string.
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    uint8 internal constant ALGORITHM_ML_DSA_87 = 1;
    uint256 internal constant ML_DSA_87_PUBLIC_KEY_LENGTH = 2592;
    uint256 internal constant ML_DSA_87_SIGNATURE_LENGTH = 4627;

    /// @notice Domain tag at the start of every signed message.
    bytes32 internal constant DOMAIN = keccak256("qore-pq-kit.PqAuth.v1");

    /// @dev The smallest well-formed pqcKeyStatus answer: four head words plus the
    ///      length word of an empty `bytes`.
    uint256 private constant KEY_STATUS_MIN_RETURN = 160;

    /// @notice The authorising account and its next nonce.
    struct Signer {
        address account;
        uint64 nonce;
    }

    event PqAuthorized(address indexed signer, bytes32 indexed action, uint256 nonce, bytes32 argsHash);
    event PqSignerChanged(address indexed previous, address indexed next);

    error PqPrecompileUnavailable(address precompile);
    error PqKeyUnusable(address account, bool registered, uint8 algorithmId, bool possessionProven, uint256 keyLength);
    error PqBadSignatureLength(uint256 length);
    error PqSignatureInvalid();
    error PqExpired(uint256 deadline, uint256 timestamp);
    error PqDeadlineTooFar(uint256 deadline, uint256 latestAllowed);
    error PqZeroSigner();

    // ---------------------------------------------------------------------
    // Reading the chain
    // ---------------------------------------------------------------------

    /// @notice The account's registered ML-DSA-87 public key, or a revert if it has
    ///         none usable (not registered, another algorithm, possession not
    ///         proven, or a key of the wrong length).
    function keyOf(address account) internal view returns (bytes memory pubkey) {
        (bool ok, bytes memory ret) =
            PQC_KEY_STATUS.staticcall(abi.encodeWithSignature("pqcKeyStatus(address)", account));
        if (!ok || ret.length < KEY_STATUS_MIN_RETURN) revert PqPrecompileUnavailable(PQC_KEY_STATUS);
        // abi.decode reverts on malformed data (and on a bool word other than 0 or 1).
        (bool registered, uint8 algorithmId, bytes memory key, bool possessionProven) =
            abi.decode(ret, (bool, uint8, bytes, bool));
        if (
            !registered || algorithmId != ALGORITHM_ML_DSA_87 || !possessionProven
                || key.length != ML_DSA_87_PUBLIC_KEY_LENGTH
        ) {
            revert PqKeyUnusable(account, registered, algorithmId, possessionProven, key.length);
        }
        return key;
    }

    /// @notice True only if `pqcVerify` answered exactly `true`.
    /// @dev Reverts with `PqPrecompileUnavailable` on empty return data: that is
    ///      what an inactive precompile answers, and it must never read as a
    ///      verdict either way.
    function verify(bytes memory pubkey, bytes memory signature, bytes memory signedMessage)
        internal
        view
        returns (bool)
    {
        (bool ok, bytes memory ret) = PQC_VERIFY.staticcall(
            abi.encodeWithSignature("pqcVerify(bytes,bytes,bytes)", pubkey, signature, signedMessage)
        );
        if (ok && ret.length == 0) revert PqPrecompileUnavailable(PQC_VERIFY);
        if (!ok || ret.length != 32) return false;
        return abi.decode(ret, (uint256)) == 1;
    }

    // ---------------------------------------------------------------------
    // The signed message
    // ---------------------------------------------------------------------

    /// @notice The exact bytes the signer's ML-DSA-87 key signs (256 bytes).
    function message(
        address verifier,
        address signer,
        bytes32 action,
        uint256 nonce,
        uint256 deadline,
        bytes32 argsHash
    ) internal view returns (bytes memory) {
        return abi.encode(DOMAIN, block.chainid, verifier, signer, action, nonce, deadline, argsHash);
    }

    // ---------------------------------------------------------------------
    // Using it
    // ---------------------------------------------------------------------

    /// @notice Set the first signer. Reverts unless it has a usable ML-DSA-87 key.
    function init(Signer storage s, address account) internal {
        if (account == address(0)) revert PqZeroSigner();
        keyOf(account);
        s.account = account;
        emit PqSignerChanged(address(0), account);
    }

    /// @notice Replace the signer (call it only after `authorize`). The nonce keeps
    ///         counting, so no signature made for the old signer can be replayed.
    function setSigner(Signer storage s, address next) internal {
        if (next == address(0)) revert PqZeroSigner();
        keyOf(next);
        address previous = s.account;
        s.account = next;
        emit PqSignerChanged(previous, next);
    }

    /// @notice Check a fresh signature for `action` with arguments `argsHash`, then
    ///         consume the nonce. Reverts on anything short of a valid signature.
    /// @param maxTtl  the furthest in the future a deadline may be, in seconds
    function authorize(
        Signer storage s,
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        bytes calldata signature
    ) internal {
        if (block.timestamp > deadline) revert PqExpired(deadline, block.timestamp);
        if (deadline > block.timestamp + maxTtl) revert PqDeadlineTooFar(deadline, block.timestamp + maxTtl);
        if (signature.length != ML_DSA_87_SIGNATURE_LENGTH) revert PqBadSignatureLength(signature.length);
        address account = s.account;
        if (account == address(0)) revert PqZeroSigner();
        uint256 nonce = s.nonce;

        bytes memory signed = message(address(this), account, action, nonce, deadline, argsHash);
        if (!verify(keyOf(account), signature, signed)) revert PqSignatureInvalid();

        s.nonce = uint64(nonce + 1);
        emit PqAuthorized(account, action, nonce, argsHash);
    }
}

// lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// lib/openzeppelin-contracts/contracts/utils/math/SafeCast.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/math/SafeCast.sol)
// This file was procedurally generated from scripts/generate/templates/SafeCast.js.

/**
 * @dev Wrappers over Solidity's uintXX/intXX/bool casting operators with added overflow
 * checks.
 *
 * Downcasting from uint256/int256 in Solidity does not revert on overflow. This can
 * easily result in undesired exploitation or bugs, since developers usually
 * assume that overflows raise errors. `SafeCast` restores this intuition by
 * reverting the transaction when such an operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 */
library SafeCast {
    /**
     * @dev Value doesn't fit in an uint of `bits` size.
     */
    error SafeCastOverflowedUintDowncast(uint8 bits, uint256 value);

    /**
     * @dev An int value doesn't fit in an uint of `bits` size.
     */
    error SafeCastOverflowedIntToUint(int256 value);

    /**
     * @dev Value doesn't fit in an int of `bits` size.
     */
    error SafeCastOverflowedIntDowncast(uint8 bits, int256 value);

    /**
     * @dev An uint value doesn't fit in an int of `bits` size.
     */
    error SafeCastOverflowedUintToInt(uint256 value);

    /**
     * @dev Returns the downcasted uint248 from uint256, reverting on
     * overflow (when the input is greater than largest uint248).
     *
     * Counterpart to Solidity's `uint248` operator.
     *
     * Requirements:
     *
     * - input must fit into 248 bits
     */
    function toUint248(uint256 value) internal pure returns (uint248) {
        if (value > type(uint248).max) {
            revert SafeCastOverflowedUintDowncast(248, value);
        }
        return uint248(value);
    }

    /**
     * @dev Returns the downcasted uint240 from uint256, reverting on
     * overflow (when the input is greater than largest uint240).
     *
     * Counterpart to Solidity's `uint240` operator.
     *
     * Requirements:
     *
     * - input must fit into 240 bits
     */
    function toUint240(uint256 value) internal pure returns (uint240) {
        if (value > type(uint240).max) {
            revert SafeCastOverflowedUintDowncast(240, value);
        }
        return uint240(value);
    }

    /**
     * @dev Returns the downcasted uint232 from uint256, reverting on
     * overflow (when the input is greater than largest uint232).
     *
     * Counterpart to Solidity's `uint232` operator.
     *
     * Requirements:
     *
     * - input must fit into 232 bits
     */
    function toUint232(uint256 value) internal pure returns (uint232) {
        if (value > type(uint232).max) {
            revert SafeCastOverflowedUintDowncast(232, value);
        }
        return uint232(value);
    }

    /**
     * @dev Returns the downcasted uint224 from uint256, reverting on
     * overflow (when the input is greater than largest uint224).
     *
     * Counterpart to Solidity's `uint224` operator.
     *
     * Requirements:
     *
     * - input must fit into 224 bits
     */
    function toUint224(uint256 value) internal pure returns (uint224) {
        if (value > type(uint224).max) {
            revert SafeCastOverflowedUintDowncast(224, value);
        }
        return uint224(value);
    }

    /**
     * @dev Returns the downcasted uint216 from uint256, reverting on
     * overflow (when the input is greater than largest uint216).
     *
     * Counterpart to Solidity's `uint216` operator.
     *
     * Requirements:
     *
     * - input must fit into 216 bits
     */
    function toUint216(uint256 value) internal pure returns (uint216) {
        if (value > type(uint216).max) {
            revert SafeCastOverflowedUintDowncast(216, value);
        }
        return uint216(value);
    }

    /**
     * @dev Returns the downcasted uint208 from uint256, reverting on
     * overflow (when the input is greater than largest uint208).
     *
     * Counterpart to Solidity's `uint208` operator.
     *
     * Requirements:
     *
     * - input must fit into 208 bits
     */
    function toUint208(uint256 value) internal pure returns (uint208) {
        if (value > type(uint208).max) {
            revert SafeCastOverflowedUintDowncast(208, value);
        }
        return uint208(value);
    }

    /**
     * @dev Returns the downcasted uint200 from uint256, reverting on
     * overflow (when the input is greater than largest uint200).
     *
     * Counterpart to Solidity's `uint200` operator.
     *
     * Requirements:
     *
     * - input must fit into 200 bits
     */
    function toUint200(uint256 value) internal pure returns (uint200) {
        if (value > type(uint200).max) {
            revert SafeCastOverflowedUintDowncast(200, value);
        }
        return uint200(value);
    }

    /**
     * @dev Returns the downcasted uint192 from uint256, reverting on
     * overflow (when the input is greater than largest uint192).
     *
     * Counterpart to Solidity's `uint192` operator.
     *
     * Requirements:
     *
     * - input must fit into 192 bits
     */
    function toUint192(uint256 value) internal pure returns (uint192) {
        if (value > type(uint192).max) {
            revert SafeCastOverflowedUintDowncast(192, value);
        }
        return uint192(value);
    }

    /**
     * @dev Returns the downcasted uint184 from uint256, reverting on
     * overflow (when the input is greater than largest uint184).
     *
     * Counterpart to Solidity's `uint184` operator.
     *
     * Requirements:
     *
     * - input must fit into 184 bits
     */
    function toUint184(uint256 value) internal pure returns (uint184) {
        if (value > type(uint184).max) {
            revert SafeCastOverflowedUintDowncast(184, value);
        }
        return uint184(value);
    }

    /**
     * @dev Returns the downcasted uint176 from uint256, reverting on
     * overflow (when the input is greater than largest uint176).
     *
     * Counterpart to Solidity's `uint176` operator.
     *
     * Requirements:
     *
     * - input must fit into 176 bits
     */
    function toUint176(uint256 value) internal pure returns (uint176) {
        if (value > type(uint176).max) {
            revert SafeCastOverflowedUintDowncast(176, value);
        }
        return uint176(value);
    }

    /**
     * @dev Returns the downcasted uint168 from uint256, reverting on
     * overflow (when the input is greater than largest uint168).
     *
     * Counterpart to Solidity's `uint168` operator.
     *
     * Requirements:
     *
     * - input must fit into 168 bits
     */
    function toUint168(uint256 value) internal pure returns (uint168) {
        if (value > type(uint168).max) {
            revert SafeCastOverflowedUintDowncast(168, value);
        }
        return uint168(value);
    }

    /**
     * @dev Returns the downcasted uint160 from uint256, reverting on
     * overflow (when the input is greater than largest uint160).
     *
     * Counterpart to Solidity's `uint160` operator.
     *
     * Requirements:
     *
     * - input must fit into 160 bits
     */
    function toUint160(uint256 value) internal pure returns (uint160) {
        if (value > type(uint160).max) {
            revert SafeCastOverflowedUintDowncast(160, value);
        }
        return uint160(value);
    }

    /**
     * @dev Returns the downcasted uint152 from uint256, reverting on
     * overflow (when the input is greater than largest uint152).
     *
     * Counterpart to Solidity's `uint152` operator.
     *
     * Requirements:
     *
     * - input must fit into 152 bits
     */
    function toUint152(uint256 value) internal pure returns (uint152) {
        if (value > type(uint152).max) {
            revert SafeCastOverflowedUintDowncast(152, value);
        }
        return uint152(value);
    }

    /**
     * @dev Returns the downcasted uint144 from uint256, reverting on
     * overflow (when the input is greater than largest uint144).
     *
     * Counterpart to Solidity's `uint144` operator.
     *
     * Requirements:
     *
     * - input must fit into 144 bits
     */
    function toUint144(uint256 value) internal pure returns (uint144) {
        if (value > type(uint144).max) {
            revert SafeCastOverflowedUintDowncast(144, value);
        }
        return uint144(value);
    }

    /**
     * @dev Returns the downcasted uint136 from uint256, reverting on
     * overflow (when the input is greater than largest uint136).
     *
     * Counterpart to Solidity's `uint136` operator.
     *
     * Requirements:
     *
     * - input must fit into 136 bits
     */
    function toUint136(uint256 value) internal pure returns (uint136) {
        if (value > type(uint136).max) {
            revert SafeCastOverflowedUintDowncast(136, value);
        }
        return uint136(value);
    }

    /**
     * @dev Returns the downcasted uint128 from uint256, reverting on
     * overflow (when the input is greater than largest uint128).
     *
     * Counterpart to Solidity's `uint128` operator.
     *
     * Requirements:
     *
     * - input must fit into 128 bits
     */
    function toUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) {
            revert SafeCastOverflowedUintDowncast(128, value);
        }
        return uint128(value);
    }

    /**
     * @dev Returns the downcasted uint120 from uint256, reverting on
     * overflow (when the input is greater than largest uint120).
     *
     * Counterpart to Solidity's `uint120` operator.
     *
     * Requirements:
     *
     * - input must fit into 120 bits
     */
    function toUint120(uint256 value) internal pure returns (uint120) {
        if (value > type(uint120).max) {
            revert SafeCastOverflowedUintDowncast(120, value);
        }
        return uint120(value);
    }

    /**
     * @dev Returns the downcasted uint112 from uint256, reverting on
     * overflow (when the input is greater than largest uint112).
     *
     * Counterpart to Solidity's `uint112` operator.
     *
     * Requirements:
     *
     * - input must fit into 112 bits
     */
    function toUint112(uint256 value) internal pure returns (uint112) {
        if (value > type(uint112).max) {
            revert SafeCastOverflowedUintDowncast(112, value);
        }
        return uint112(value);
    }

    /**
     * @dev Returns the downcasted uint104 from uint256, reverting on
     * overflow (when the input is greater than largest uint104).
     *
     * Counterpart to Solidity's `uint104` operator.
     *
     * Requirements:
     *
     * - input must fit into 104 bits
     */
    function toUint104(uint256 value) internal pure returns (uint104) {
        if (value > type(uint104).max) {
            revert SafeCastOverflowedUintDowncast(104, value);
        }
        return uint104(value);
    }

    /**
     * @dev Returns the downcasted uint96 from uint256, reverting on
     * overflow (when the input is greater than largest uint96).
     *
     * Counterpart to Solidity's `uint96` operator.
     *
     * Requirements:
     *
     * - input must fit into 96 bits
     */
    function toUint96(uint256 value) internal pure returns (uint96) {
        if (value > type(uint96).max) {
            revert SafeCastOverflowedUintDowncast(96, value);
        }
        return uint96(value);
    }

    /**
     * @dev Returns the downcasted uint88 from uint256, reverting on
     * overflow (when the input is greater than largest uint88).
     *
     * Counterpart to Solidity's `uint88` operator.
     *
     * Requirements:
     *
     * - input must fit into 88 bits
     */
    function toUint88(uint256 value) internal pure returns (uint88) {
        if (value > type(uint88).max) {
            revert SafeCastOverflowedUintDowncast(88, value);
        }
        return uint88(value);
    }

    /**
     * @dev Returns the downcasted uint80 from uint256, reverting on
     * overflow (when the input is greater than largest uint80).
     *
     * Counterpart to Solidity's `uint80` operator.
     *
     * Requirements:
     *
     * - input must fit into 80 bits
     */
    function toUint80(uint256 value) internal pure returns (uint80) {
        if (value > type(uint80).max) {
            revert SafeCastOverflowedUintDowncast(80, value);
        }
        return uint80(value);
    }

    /**
     * @dev Returns the downcasted uint72 from uint256, reverting on
     * overflow (when the input is greater than largest uint72).
     *
     * Counterpart to Solidity's `uint72` operator.
     *
     * Requirements:
     *
     * - input must fit into 72 bits
     */
    function toUint72(uint256 value) internal pure returns (uint72) {
        if (value > type(uint72).max) {
            revert SafeCastOverflowedUintDowncast(72, value);
        }
        return uint72(value);
    }

    /**
     * @dev Returns the downcasted uint64 from uint256, reverting on
     * overflow (when the input is greater than largest uint64).
     *
     * Counterpart to Solidity's `uint64` operator.
     *
     * Requirements:
     *
     * - input must fit into 64 bits
     */
    function toUint64(uint256 value) internal pure returns (uint64) {
        if (value > type(uint64).max) {
            revert SafeCastOverflowedUintDowncast(64, value);
        }
        return uint64(value);
    }

    /**
     * @dev Returns the downcasted uint56 from uint256, reverting on
     * overflow (when the input is greater than largest uint56).
     *
     * Counterpart to Solidity's `uint56` operator.
     *
     * Requirements:
     *
     * - input must fit into 56 bits
     */
    function toUint56(uint256 value) internal pure returns (uint56) {
        if (value > type(uint56).max) {
            revert SafeCastOverflowedUintDowncast(56, value);
        }
        return uint56(value);
    }

    /**
     * @dev Returns the downcasted uint48 from uint256, reverting on
     * overflow (when the input is greater than largest uint48).
     *
     * Counterpart to Solidity's `uint48` operator.
     *
     * Requirements:
     *
     * - input must fit into 48 bits
     */
    function toUint48(uint256 value) internal pure returns (uint48) {
        if (value > type(uint48).max) {
            revert SafeCastOverflowedUintDowncast(48, value);
        }
        return uint48(value);
    }

    /**
     * @dev Returns the downcasted uint40 from uint256, reverting on
     * overflow (when the input is greater than largest uint40).
     *
     * Counterpart to Solidity's `uint40` operator.
     *
     * Requirements:
     *
     * - input must fit into 40 bits
     */
    function toUint40(uint256 value) internal pure returns (uint40) {
        if (value > type(uint40).max) {
            revert SafeCastOverflowedUintDowncast(40, value);
        }
        return uint40(value);
    }

    /**
     * @dev Returns the downcasted uint32 from uint256, reverting on
     * overflow (when the input is greater than largest uint32).
     *
     * Counterpart to Solidity's `uint32` operator.
     *
     * Requirements:
     *
     * - input must fit into 32 bits
     */
    function toUint32(uint256 value) internal pure returns (uint32) {
        if (value > type(uint32).max) {
            revert SafeCastOverflowedUintDowncast(32, value);
        }
        return uint32(value);
    }

    /**
     * @dev Returns the downcasted uint24 from uint256, reverting on
     * overflow (when the input is greater than largest uint24).
     *
     * Counterpart to Solidity's `uint24` operator.
     *
     * Requirements:
     *
     * - input must fit into 24 bits
     */
    function toUint24(uint256 value) internal pure returns (uint24) {
        if (value > type(uint24).max) {
            revert SafeCastOverflowedUintDowncast(24, value);
        }
        return uint24(value);
    }

    /**
     * @dev Returns the downcasted uint16 from uint256, reverting on
     * overflow (when the input is greater than largest uint16).
     *
     * Counterpart to Solidity's `uint16` operator.
     *
     * Requirements:
     *
     * - input must fit into 16 bits
     */
    function toUint16(uint256 value) internal pure returns (uint16) {
        if (value > type(uint16).max) {
            revert SafeCastOverflowedUintDowncast(16, value);
        }
        return uint16(value);
    }

    /**
     * @dev Returns the downcasted uint8 from uint256, reverting on
     * overflow (when the input is greater than largest uint8).
     *
     * Counterpart to Solidity's `uint8` operator.
     *
     * Requirements:
     *
     * - input must fit into 8 bits
     */
    function toUint8(uint256 value) internal pure returns (uint8) {
        if (value > type(uint8).max) {
            revert SafeCastOverflowedUintDowncast(8, value);
        }
        return uint8(value);
    }

    /**
     * @dev Converts a signed int256 into an unsigned uint256.
     *
     * Requirements:
     *
     * - input must be greater than or equal to 0.
     */
    function toUint256(int256 value) internal pure returns (uint256) {
        if (value < 0) {
            revert SafeCastOverflowedIntToUint(value);
        }
        return uint256(value);
    }

    /**
     * @dev Returns the downcasted int248 from int256, reverting on
     * overflow (when the input is less than smallest int248 or
     * greater than largest int248).
     *
     * Counterpart to Solidity's `int248` operator.
     *
     * Requirements:
     *
     * - input must fit into 248 bits
     */
    function toInt248(int256 value) internal pure returns (int248 downcasted) {
        downcasted = int248(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(248, value);
        }
    }

    /**
     * @dev Returns the downcasted int240 from int256, reverting on
     * overflow (when the input is less than smallest int240 or
     * greater than largest int240).
     *
     * Counterpart to Solidity's `int240` operator.
     *
     * Requirements:
     *
     * - input must fit into 240 bits
     */
    function toInt240(int256 value) internal pure returns (int240 downcasted) {
        downcasted = int240(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(240, value);
        }
    }

    /**
     * @dev Returns the downcasted int232 from int256, reverting on
     * overflow (when the input is less than smallest int232 or
     * greater than largest int232).
     *
     * Counterpart to Solidity's `int232` operator.
     *
     * Requirements:
     *
     * - input must fit into 232 bits
     */
    function toInt232(int256 value) internal pure returns (int232 downcasted) {
        downcasted = int232(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(232, value);
        }
    }

    /**
     * @dev Returns the downcasted int224 from int256, reverting on
     * overflow (when the input is less than smallest int224 or
     * greater than largest int224).
     *
     * Counterpart to Solidity's `int224` operator.
     *
     * Requirements:
     *
     * - input must fit into 224 bits
     */
    function toInt224(int256 value) internal pure returns (int224 downcasted) {
        downcasted = int224(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(224, value);
        }
    }

    /**
     * @dev Returns the downcasted int216 from int256, reverting on
     * overflow (when the input is less than smallest int216 or
     * greater than largest int216).
     *
     * Counterpart to Solidity's `int216` operator.
     *
     * Requirements:
     *
     * - input must fit into 216 bits
     */
    function toInt216(int256 value) internal pure returns (int216 downcasted) {
        downcasted = int216(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(216, value);
        }
    }

    /**
     * @dev Returns the downcasted int208 from int256, reverting on
     * overflow (when the input is less than smallest int208 or
     * greater than largest int208).
     *
     * Counterpart to Solidity's `int208` operator.
     *
     * Requirements:
     *
     * - input must fit into 208 bits
     */
    function toInt208(int256 value) internal pure returns (int208 downcasted) {
        downcasted = int208(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(208, value);
        }
    }

    /**
     * @dev Returns the downcasted int200 from int256, reverting on
     * overflow (when the input is less than smallest int200 or
     * greater than largest int200).
     *
     * Counterpart to Solidity's `int200` operator.
     *
     * Requirements:
     *
     * - input must fit into 200 bits
     */
    function toInt200(int256 value) internal pure returns (int200 downcasted) {
        downcasted = int200(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(200, value);
        }
    }

    /**
     * @dev Returns the downcasted int192 from int256, reverting on
     * overflow (when the input is less than smallest int192 or
     * greater than largest int192).
     *
     * Counterpart to Solidity's `int192` operator.
     *
     * Requirements:
     *
     * - input must fit into 192 bits
     */
    function toInt192(int256 value) internal pure returns (int192 downcasted) {
        downcasted = int192(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(192, value);
        }
    }

    /**
     * @dev Returns the downcasted int184 from int256, reverting on
     * overflow (when the input is less than smallest int184 or
     * greater than largest int184).
     *
     * Counterpart to Solidity's `int184` operator.
     *
     * Requirements:
     *
     * - input must fit into 184 bits
     */
    function toInt184(int256 value) internal pure returns (int184 downcasted) {
        downcasted = int184(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(184, value);
        }
    }

    /**
     * @dev Returns the downcasted int176 from int256, reverting on
     * overflow (when the input is less than smallest int176 or
     * greater than largest int176).
     *
     * Counterpart to Solidity's `int176` operator.
     *
     * Requirements:
     *
     * - input must fit into 176 bits
     */
    function toInt176(int256 value) internal pure returns (int176 downcasted) {
        downcasted = int176(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(176, value);
        }
    }

    /**
     * @dev Returns the downcasted int168 from int256, reverting on
     * overflow (when the input is less than smallest int168 or
     * greater than largest int168).
     *
     * Counterpart to Solidity's `int168` operator.
     *
     * Requirements:
     *
     * - input must fit into 168 bits
     */
    function toInt168(int256 value) internal pure returns (int168 downcasted) {
        downcasted = int168(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(168, value);
        }
    }

    /**
     * @dev Returns the downcasted int160 from int256, reverting on
     * overflow (when the input is less than smallest int160 or
     * greater than largest int160).
     *
     * Counterpart to Solidity's `int160` operator.
     *
     * Requirements:
     *
     * - input must fit into 160 bits
     */
    function toInt160(int256 value) internal pure returns (int160 downcasted) {
        downcasted = int160(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(160, value);
        }
    }

    /**
     * @dev Returns the downcasted int152 from int256, reverting on
     * overflow (when the input is less than smallest int152 or
     * greater than largest int152).
     *
     * Counterpart to Solidity's `int152` operator.
     *
     * Requirements:
     *
     * - input must fit into 152 bits
     */
    function toInt152(int256 value) internal pure returns (int152 downcasted) {
        downcasted = int152(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(152, value);
        }
    }

    /**
     * @dev Returns the downcasted int144 from int256, reverting on
     * overflow (when the input is less than smallest int144 or
     * greater than largest int144).
     *
     * Counterpart to Solidity's `int144` operator.
     *
     * Requirements:
     *
     * - input must fit into 144 bits
     */
    function toInt144(int256 value) internal pure returns (int144 downcasted) {
        downcasted = int144(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(144, value);
        }
    }

    /**
     * @dev Returns the downcasted int136 from int256, reverting on
     * overflow (when the input is less than smallest int136 or
     * greater than largest int136).
     *
     * Counterpart to Solidity's `int136` operator.
     *
     * Requirements:
     *
     * - input must fit into 136 bits
     */
    function toInt136(int256 value) internal pure returns (int136 downcasted) {
        downcasted = int136(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(136, value);
        }
    }

    /**
     * @dev Returns the downcasted int128 from int256, reverting on
     * overflow (when the input is less than smallest int128 or
     * greater than largest int128).
     *
     * Counterpart to Solidity's `int128` operator.
     *
     * Requirements:
     *
     * - input must fit into 128 bits
     */
    function toInt128(int256 value) internal pure returns (int128 downcasted) {
        downcasted = int128(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(128, value);
        }
    }

    /**
     * @dev Returns the downcasted int120 from int256, reverting on
     * overflow (when the input is less than smallest int120 or
     * greater than largest int120).
     *
     * Counterpart to Solidity's `int120` operator.
     *
     * Requirements:
     *
     * - input must fit into 120 bits
     */
    function toInt120(int256 value) internal pure returns (int120 downcasted) {
        downcasted = int120(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(120, value);
        }
    }

    /**
     * @dev Returns the downcasted int112 from int256, reverting on
     * overflow (when the input is less than smallest int112 or
     * greater than largest int112).
     *
     * Counterpart to Solidity's `int112` operator.
     *
     * Requirements:
     *
     * - input must fit into 112 bits
     */
    function toInt112(int256 value) internal pure returns (int112 downcasted) {
        downcasted = int112(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(112, value);
        }
    }

    /**
     * @dev Returns the downcasted int104 from int256, reverting on
     * overflow (when the input is less than smallest int104 or
     * greater than largest int104).
     *
     * Counterpart to Solidity's `int104` operator.
     *
     * Requirements:
     *
     * - input must fit into 104 bits
     */
    function toInt104(int256 value) internal pure returns (int104 downcasted) {
        downcasted = int104(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(104, value);
        }
    }

    /**
     * @dev Returns the downcasted int96 from int256, reverting on
     * overflow (when the input is less than smallest int96 or
     * greater than largest int96).
     *
     * Counterpart to Solidity's `int96` operator.
     *
     * Requirements:
     *
     * - input must fit into 96 bits
     */
    function toInt96(int256 value) internal pure returns (int96 downcasted) {
        downcasted = int96(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(96, value);
        }
    }

    /**
     * @dev Returns the downcasted int88 from int256, reverting on
     * overflow (when the input is less than smallest int88 or
     * greater than largest int88).
     *
     * Counterpart to Solidity's `int88` operator.
     *
     * Requirements:
     *
     * - input must fit into 88 bits
     */
    function toInt88(int256 value) internal pure returns (int88 downcasted) {
        downcasted = int88(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(88, value);
        }
    }

    /**
     * @dev Returns the downcasted int80 from int256, reverting on
     * overflow (when the input is less than smallest int80 or
     * greater than largest int80).
     *
     * Counterpart to Solidity's `int80` operator.
     *
     * Requirements:
     *
     * - input must fit into 80 bits
     */
    function toInt80(int256 value) internal pure returns (int80 downcasted) {
        downcasted = int80(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(80, value);
        }
    }

    /**
     * @dev Returns the downcasted int72 from int256, reverting on
     * overflow (when the input is less than smallest int72 or
     * greater than largest int72).
     *
     * Counterpart to Solidity's `int72` operator.
     *
     * Requirements:
     *
     * - input must fit into 72 bits
     */
    function toInt72(int256 value) internal pure returns (int72 downcasted) {
        downcasted = int72(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(72, value);
        }
    }

    /**
     * @dev Returns the downcasted int64 from int256, reverting on
     * overflow (when the input is less than smallest int64 or
     * greater than largest int64).
     *
     * Counterpart to Solidity's `int64` operator.
     *
     * Requirements:
     *
     * - input must fit into 64 bits
     */
    function toInt64(int256 value) internal pure returns (int64 downcasted) {
        downcasted = int64(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(64, value);
        }
    }

    /**
     * @dev Returns the downcasted int56 from int256, reverting on
     * overflow (when the input is less than smallest int56 or
     * greater than largest int56).
     *
     * Counterpart to Solidity's `int56` operator.
     *
     * Requirements:
     *
     * - input must fit into 56 bits
     */
    function toInt56(int256 value) internal pure returns (int56 downcasted) {
        downcasted = int56(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(56, value);
        }
    }

    /**
     * @dev Returns the downcasted int48 from int256, reverting on
     * overflow (when the input is less than smallest int48 or
     * greater than largest int48).
     *
     * Counterpart to Solidity's `int48` operator.
     *
     * Requirements:
     *
     * - input must fit into 48 bits
     */
    function toInt48(int256 value) internal pure returns (int48 downcasted) {
        downcasted = int48(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(48, value);
        }
    }

    /**
     * @dev Returns the downcasted int40 from int256, reverting on
     * overflow (when the input is less than smallest int40 or
     * greater than largest int40).
     *
     * Counterpart to Solidity's `int40` operator.
     *
     * Requirements:
     *
     * - input must fit into 40 bits
     */
    function toInt40(int256 value) internal pure returns (int40 downcasted) {
        downcasted = int40(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(40, value);
        }
    }

    /**
     * @dev Returns the downcasted int32 from int256, reverting on
     * overflow (when the input is less than smallest int32 or
     * greater than largest int32).
     *
     * Counterpart to Solidity's `int32` operator.
     *
     * Requirements:
     *
     * - input must fit into 32 bits
     */
    function toInt32(int256 value) internal pure returns (int32 downcasted) {
        downcasted = int32(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(32, value);
        }
    }

    /**
     * @dev Returns the downcasted int24 from int256, reverting on
     * overflow (when the input is less than smallest int24 or
     * greater than largest int24).
     *
     * Counterpart to Solidity's `int24` operator.
     *
     * Requirements:
     *
     * - input must fit into 24 bits
     */
    function toInt24(int256 value) internal pure returns (int24 downcasted) {
        downcasted = int24(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(24, value);
        }
    }

    /**
     * @dev Returns the downcasted int16 from int256, reverting on
     * overflow (when the input is less than smallest int16 or
     * greater than largest int16).
     *
     * Counterpart to Solidity's `int16` operator.
     *
     * Requirements:
     *
     * - input must fit into 16 bits
     */
    function toInt16(int256 value) internal pure returns (int16 downcasted) {
        downcasted = int16(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(16, value);
        }
    }

    /**
     * @dev Returns the downcasted int8 from int256, reverting on
     * overflow (when the input is less than smallest int8 or
     * greater than largest int8).
     *
     * Counterpart to Solidity's `int8` operator.
     *
     * Requirements:
     *
     * - input must fit into 8 bits
     */
    function toInt8(int256 value) internal pure returns (int8 downcasted) {
        downcasted = int8(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(8, value);
        }
    }

    /**
     * @dev Converts an unsigned uint256 into a signed int256.
     *
     * Requirements:
     *
     * - input must be less than or equal to maxInt256.
     */
    function toInt256(uint256 value) internal pure returns (int256) {
        // Note: Unsafe cast below is okay because `type(int256).max` is guaranteed to be positive
        if (value > uint256(type(int256).max)) {
            revert SafeCastOverflowedUintToInt(value);
        }
        return int256(value);
    }

    /**
     * @dev Cast a boolean (false or true) to a uint256 (0 or 1) with no jump.
     */
    function toUint(bool b) internal pure returns (uint256 u) {
        assembly ("memory-safe") {
            u := iszero(iszero(b))
        }
    }
}

// lib/openzeppelin-contracts/contracts/utils/Address.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/Address.sol)

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev There's no code at `target` (it is not a contract).
     */
    error AddressEmptyCode(address target);

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.20/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        if (address(this).balance < amount) {
            revert Errors.InsufficientBalance(address(this).balance, amount);
        }

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert Errors.FailedCall();
        }
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason or custom error, it is bubbled
     * up by this function (like regular Solidity function calls). However, if
     * the call reverted with no returned reason, this function reverts with a
     * {Errors.FailedCall} error.
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and reverts if the target
     * was not a contract or bubbling up the revert reason (falling back to {Errors.FailedCall}) in case
     * of an unsuccessful call.
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata
    ) internal view returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            // only check if target is a contract if the call was successful and the return data is empty
            // otherwise we already know that it was a contract
            if (returndata.length == 0 && target.code.length == 0) {
                revert AddressEmptyCode(target);
            }
            return returndata;
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and reverts if it wasn't, either by bubbling the
     * revert reason or with a default {Errors.FailedCall} error.
     */
    function verifyCallResult(bool success, bytes memory returndata) internal pure returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            return returndata;
        }
    }

    /**
     * @dev Reverts with returndata if present. Otherwise reverts with {Errors.FailedCall}.
     */
    function _revert(bytes memory returndata) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            assembly ("memory-safe") {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert Errors.FailedCall();
        }
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC165.sol

// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC165.sol)

// lib/openzeppelin-contracts/contracts/interfaces/IERC20.sol

// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC20.sol)

// lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol

// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/extensions/IERC20Metadata.sol)

/**
 * @dev Interface for the optional metadata functions from the ERC-20 standard.
 */
interface IERC20Metadata is IERC20 {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}

// lib/qore-pq-kit/src/PqAuthSet.sol

/// @title PqAuthSet
/// @notice A t-of-n set of post-quantum signers: a post-quantum multisig for
///         QoreChain EVM contracts, built on `PqAuth`.
///
/// Each member is an account with a registered ML-DSA-87 key (proven
/// possession, read live from `pqcKeyStatus` at every check, so on-chain key
/// rotation is followed). An action needs signatures from at least `threshold`
/// distinct members over the ordinary `PqAuth.message`, with `signer` set to
/// that member:
///
///   PqAuth.message(this contract, member, quorumAction(action), set nonce, deadline, argsHash)
///
/// - All members sign the same set nonce, which is consumed once per authorised
///   action, so no signature can be replayed and none made before a membership
///   change still counts after it.
/// - `quorumAction` puts the action under this library's own domain. A contract
///   that also guards something with a single `PqAuth.Signer` therefore cannot
///   have a single-signer signature accepted as a quorum share, or the reverse,
///   even if a member is that signer and the nonces coincide.
/// - Signers are passed in strictly ascending address order, which proves they
///   are distinct without a mapping.
/// - `msg.sender` authorises nothing: anyone may relay a signed action.
///
/// `authorizeAny` accepts one member's signature under a separate action
/// domain. It is meant for actions any single member may take alone, such as
/// cancelling a queued action in a timelock.
library PqAuthSet {
    /// @notice The largest set. A quorum of 16 costs about 16 x 170k gas.
    uint256 internal constant MAX_MEMBERS = 16;

    /// @notice Domain tags folded into the action of quorum and single-member signatures.
    bytes32 internal constant QUORUM_DOMAIN = keccak256("qore-pq-kit.PqAuthSet.quorum.v1");
    bytes32 internal constant ANY_DOMAIN = keccak256("qore-pq-kit.PqAuthSet.any.v1");

    struct Set {
        address[] members; // strictly ascending
        uint8 threshold;
        uint64 nonce;
    }

    event PqSetChanged(address[] members, uint256 threshold);
    event PqQuorumAuthorized(bytes32 indexed action, uint256 nonce, bytes32 argsHash, address[] signers);
    event PqMemberAuthorized(bytes32 indexed action, uint256 nonce, bytes32 argsHash, address indexed signer);

    error PqSetBadThreshold(uint256 threshold, uint256 members);
    error PqSetTooLarge(uint256 members);
    error PqSetNotAscending(uint256 index);
    error PqSetNotMember(address account);
    error PqSetTooFewSignatures(uint256 given, uint256 threshold);
    error PqSetLengthMismatch(uint256 signers, uint256 signatures);
    error PqSetUninitialised();

    // ---------------------------------------------------------------------
    // Setting the set
    // ---------------------------------------------------------------------

    /// @notice Set the first members. Each must have a usable ML-DSA-87 key.
    function init(Set storage s, address[] memory members, uint256 threshold) internal {
        _set(s, members, threshold);
    }

    /// @notice Replace the members and threshold (call it only after an
    ///         authorisation). The nonce keeps counting.
    function setMembers(Set storage s, address[] memory members, uint256 threshold) internal {
        _set(s, members, threshold);
    }

    function _set(Set storage s, address[] memory members, uint256 threshold) private {
        uint256 n = members.length;
        if (n > MAX_MEMBERS) revert PqSetTooLarge(n);
        if (threshold == 0 || threshold > n) revert PqSetBadThreshold(threshold, n);
        for (uint256 i = 0; i < n; ++i) {
            address m = members[i];
            if (m == address(0)) revert PqAuth.PqZeroSigner();
            if (i > 0 && m <= members[i - 1]) revert PqSetNotAscending(i);
            PqAuth.keyOf(m); // reverts unless the key is usable now
        }
        s.members = members;
        s.threshold = uint8(threshold);
        emit PqSetChanged(members, threshold);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function isMember(Set storage s, address account) internal view returns (bool) {
        address[] storage m = s.members;
        for (uint256 i = 0; i < m.length; ++i) {
            if (m[i] == account) return true;
        }
        return false;
    }

    /// @notice The action id a quorum signs for `action`.
    function quorumAction(bytes32 action) internal pure returns (bytes32) {
        return keccak256(abi.encode(QUORUM_DOMAIN, action));
    }

    /// @notice The action id a single member signs for `action` in `authorizeAny`.
    function anyAction(bytes32 action) internal pure returns (bytes32) {
        return keccak256(abi.encode(ANY_DOMAIN, action));
    }

    /// @notice The exact bytes `member` signs for a quorum action at the current nonce.
    function quorumMessage(Set storage s, address member, bytes32 action, uint256 deadline, bytes32 argsHash)
        internal
        view
        returns (bytes memory)
    {
        return PqAuth.message(address(this), member, quorumAction(action), s.nonce, deadline, argsHash);
    }

    // ---------------------------------------------------------------------
    // Authorising
    // ---------------------------------------------------------------------

    /// @notice Check at least `threshold` member signatures for `action` with
    ///         arguments `argsHash`, then consume the nonce. Reverts on anything
    ///         short of that.
    /// @param signers     members who signed, strictly ascending
    /// @param signatures  signatures[i] by signers[i], 4,627 bytes each
    /// @param maxTtl      the furthest in the future a deadline may be, in seconds
    function authorizeQuorum(
        Set storage s,
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        address[] calldata signers,
        bytes[] calldata signatures
    ) internal {
        _fresh(deadline, maxTtl);
        uint256 t = s.threshold;
        if (t == 0) revert PqSetUninitialised();
        if (signers.length != signatures.length) revert PqSetLengthMismatch(signers.length, signatures.length);
        if (signers.length < t) revert PqSetTooFewSignatures(signers.length, t);
        uint256 nonce = s.nonce;
        _checkAll(s, quorumAction(action), argsHash, deadline, signers, signatures);
        s.nonce = uint64(nonce + 1);
        emit PqQuorumAuthorized(action, nonce, argsHash, signers);
    }

    /// @notice Check one member's signature for `action` (under its own
    ///         domain), then consume the nonce.
    function authorizeAny(
        Set storage s,
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        address signer,
        bytes calldata signature
    ) internal {
        _fresh(deadline, maxTtl);
        if (s.threshold == 0) revert PqSetUninitialised();
        if (!isMember(s, signer)) revert PqSetNotMember(signer);
        uint256 nonce = s.nonce;
        _check(signer, anyAction(action), nonce, deadline, argsHash, signature);
        s.nonce = uint64(nonce + 1);
        emit PqMemberAuthorized(action, nonce, argsHash, signer);
    }

    function _checkAll(
        Set storage s,
        bytes32 qAction,
        bytes32 argsHash,
        uint256 deadline,
        address[] calldata signers,
        bytes[] calldata signatures
    ) private view {
        uint256 nonce = s.nonce;
        for (uint256 i = 0; i < signers.length; ++i) {
            address signer = signers[i];
            if (i > 0 && signer <= signers[i - 1]) revert PqSetNotAscending(i);
            if (!isMember(s, signer)) revert PqSetNotMember(signer);
            _check(signer, qAction, nonce, deadline, argsHash, signatures[i]);
        }
    }

    function _fresh(uint256 deadline, uint256 maxTtl) private view {
        if (block.timestamp > deadline) revert PqAuth.PqExpired(deadline, block.timestamp);
        if (deadline > block.timestamp + maxTtl) {
            revert PqAuth.PqDeadlineTooFar(deadline, block.timestamp + maxTtl);
        }
    }

    function _check(
        address signer,
        bytes32 signedAction,
        uint256 nonce,
        uint256 deadline,
        bytes32 argsHash,
        bytes calldata signature
    ) private view {
        if (signature.length != PqAuth.ML_DSA_87_SIGNATURE_LENGTH) {
            revert PqAuth.PqBadSignatureLength(signature.length);
        }
        bytes memory signed = PqAuth.message(address(this), signer, signedAction, nonce, deadline, argsHash);
        if (!PqAuth.verify(PqAuth.keyOf(signer), signature, signed)) revert PqAuth.PqSignatureInvalid();
    }
}

// lib/openzeppelin-contracts/contracts/utils/math/Math.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/math/Math.sol)

/**
 * @dev Standard math utilities missing in the Solidity language.
 */
library Math {
    enum Rounding {
        Floor, // Toward negative infinity
        Ceil, // Toward positive infinity
        Trunc, // Toward zero
        Expand // Away from zero
    }

    /**
     * @dev Returns the addition of two unsigned integers, with an success flag (no overflow).
     */
    function tryAdd(uint256 a, uint256 b) internal pure returns (bool success, uint256 result) {
        unchecked {
            uint256 c = a + b;
            if (c < a) return (false, 0);
            return (true, c);
        }
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, with an success flag (no overflow).
     */
    function trySub(uint256 a, uint256 b) internal pure returns (bool success, uint256 result) {
        unchecked {
            if (b > a) return (false, 0);
            return (true, a - b);
        }
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, with an success flag (no overflow).
     */
    function tryMul(uint256 a, uint256 b) internal pure returns (bool success, uint256 result) {
        unchecked {
            // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
            // benefit is lost if 'b' is also tested.
            // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
            if (a == 0) return (true, 0);
            uint256 c = a * b;
            if (c / a != b) return (false, 0);
            return (true, c);
        }
    }

    /**
     * @dev Returns the division of two unsigned integers, with a success flag (no division by zero).
     */
    function tryDiv(uint256 a, uint256 b) internal pure returns (bool success, uint256 result) {
        unchecked {
            if (b == 0) return (false, 0);
            return (true, a / b);
        }
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers, with a success flag (no division by zero).
     */
    function tryMod(uint256 a, uint256 b) internal pure returns (bool success, uint256 result) {
        unchecked {
            if (b == 0) return (false, 0);
            return (true, a % b);
        }
    }

    /**
     * @dev Branchless ternary evaluation for `a ? b : c`. Gas costs are constant.
     *
     * IMPORTANT: This function may reduce bytecode size and consume less gas when used standalone.
     * However, the compiler may optimize Solidity ternary operations (i.e. `a ? b : c`) to only compute
     * one branch when needed, making this function more expensive.
     */
    function ternary(bool condition, uint256 a, uint256 b) internal pure returns (uint256) {
        unchecked {
            // branchless ternary works because:
            // b ^ (a ^ b) == a
            // b ^ 0 == b
            return b ^ ((a ^ b) * SafeCast.toUint(condition));
        }
    }

    /**
     * @dev Returns the largest of two numbers.
     */
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return ternary(a > b, a, b);
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return ternary(a < b, a, b);
    }

    /**
     * @dev Returns the average of two numbers. The result is rounded towards
     * zero.
     */
    function average(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b) / 2 can overflow.
        return (a & b) + (a ^ b) / 2;
    }

    /**
     * @dev Returns the ceiling of the division of two numbers.
     *
     * This differs from standard division with `/` in that it rounds towards infinity instead
     * of rounding towards zero.
     */
    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        if (b == 0) {
            // Guarantee the same behavior as in a regular Solidity division.
            Panic.panic(Panic.DIVISION_BY_ZERO);
        }

        // The following calculation ensures accurate ceiling division without overflow.
        // Since a is non-zero, (a - 1) / b will not overflow.
        // The largest possible result occurs when (a - 1) / b is type(uint256).max,
        // but the largest value we can obtain is type(uint256).max - 1, which happens
        // when a = type(uint256).max and b = 1.
        unchecked {
            return SafeCast.toUint(a > 0) * ((a - 1) / b + 1);
        }
    }

    /**
     * @dev Calculates floor(x * y / denominator) with full precision. Throws if result overflows a uint256 or
     * denominator == 0.
     *
     * Original credit to Remco Bloemen under MIT license (https://xn--2-umb.com/21/muldiv) with further edits by
     * Uniswap Labs also under MIT license.
     */
    function mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            // 512-bit multiply [prod1 prod0] = x * y. Compute the product mod 2²⁵⁶ and mod 2²⁵⁶ - 1, then use
            // the Chinese Remainder Theorem to reconstruct the 512 bit result. The result is stored in two 256
            // variables such that product = prod1 * 2²⁵⁶ + prod0.
            uint256 prod0 = x * y; // Least significant 256 bits of the product
            uint256 prod1; // Most significant 256 bits of the product
            assembly {
                let mm := mulmod(x, y, not(0))
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Handle non-overflow cases, 256 by 256 division.
            if (prod1 == 0) {
                // Solidity will revert if denominator == 0, unlike the div opcode on its own.
                // The surrounding unchecked block does not change this fact.
                // See https://docs.soliditylang.org/en/latest/control-structures.html#checked-or-unchecked-arithmetic.
                return prod0 / denominator;
            }

            // Make sure the result is less than 2²⁵⁶. Also prevents denominator == 0.
            if (denominator <= prod1) {
                Panic.panic(ternary(denominator == 0, Panic.DIVISION_BY_ZERO, Panic.UNDER_OVERFLOW));
            }

            ///////////////////////////////////////////////
            // 512 by 256 division.
            ///////////////////////////////////////////////

            // Make division exact by subtracting the remainder from [prod1 prod0].
            uint256 remainder;
            assembly {
                // Compute remainder using mulmod.
                remainder := mulmod(x, y, denominator)

                // Subtract 256 bit number from 512 bit number.
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor powers of two out of denominator and compute largest power of two divisor of denominator.
            // Always >= 1. See https://cs.stackexchange.com/q/138556/92363.

            uint256 twos = denominator & (0 - denominator);
            assembly {
                // Divide denominator by twos.
                denominator := div(denominator, twos)

                // Divide [prod1 prod0] by twos.
                prod0 := div(prod0, twos)

                // Flip twos such that it is 2²⁵⁶ / twos. If twos is zero, then it becomes one.
                twos := add(div(sub(0, twos), twos), 1)
            }

            // Shift in bits from prod1 into prod0.
            prod0 |= prod1 * twos;

            // Invert denominator mod 2²⁵⁶. Now that denominator is an odd number, it has an inverse modulo 2²⁵⁶ such
            // that denominator * inv ≡ 1 mod 2²⁵⁶. Compute the inverse by starting with a seed that is correct for
            // four bits. That is, denominator * inv ≡ 1 mod 2⁴.
            uint256 inverse = (3 * denominator) ^ 2;

            // Use the Newton-Raphson iteration to improve the precision. Thanks to Hensel's lifting lemma, this also
            // works in modular arithmetic, doubling the correct bits in each step.
            inverse *= 2 - denominator * inverse; // inverse mod 2⁸
            inverse *= 2 - denominator * inverse; // inverse mod 2¹⁶
            inverse *= 2 - denominator * inverse; // inverse mod 2³²
            inverse *= 2 - denominator * inverse; // inverse mod 2⁶⁴
            inverse *= 2 - denominator * inverse; // inverse mod 2¹²⁸
            inverse *= 2 - denominator * inverse; // inverse mod 2²⁵⁶

            // Because the division is now exact we can divide by multiplying with the modular inverse of denominator.
            // This will give us the correct result modulo 2²⁵⁶. Since the preconditions guarantee that the outcome is
            // less than 2²⁵⁶, this is the final result. We don't need to compute the high bits of the result and prod1
            // is no longer required.
            result = prod0 * inverse;
            return result;
        }
    }

    /**
     * @dev Calculates x * y / denominator with full precision, following the selected rounding direction.
     */
    function mulDiv(uint256 x, uint256 y, uint256 denominator, Rounding rounding) internal pure returns (uint256) {
        return mulDiv(x, y, denominator) + SafeCast.toUint(unsignedRoundsUp(rounding) && mulmod(x, y, denominator) > 0);
    }

    /**
     * @dev Calculate the modular multiplicative inverse of a number in Z/nZ.
     *
     * If n is a prime, then Z/nZ is a field. In that case all elements are inversible, except 0.
     * If n is not a prime, then Z/nZ is not a field, and some elements might not be inversible.
     *
     * If the input value is not inversible, 0 is returned.
     *
     * NOTE: If you know for sure that n is (big) a prime, it may be cheaper to use Fermat's little theorem and get the
     * inverse using `Math.modExp(a, n - 2, n)`. See {invModPrime}.
     */
    function invMod(uint256 a, uint256 n) internal pure returns (uint256) {
        unchecked {
            if (n == 0) return 0;

            // The inverse modulo is calculated using the Extended Euclidean Algorithm (iterative version)
            // Used to compute integers x and y such that: ax + ny = gcd(a, n).
            // When the gcd is 1, then the inverse of a modulo n exists and it's x.
            // ax + ny = 1
            // ax = 1 + (-y)n
            // ax ≡ 1 (mod n) # x is the inverse of a modulo n

            // If the remainder is 0 the gcd is n right away.
            uint256 remainder = a % n;
            uint256 gcd = n;

            // Therefore the initial coefficients are:
            // ax + ny = gcd(a, n) = n
            // 0a + 1n = n
            int256 x = 0;
            int256 y = 1;

            while (remainder != 0) {
                uint256 quotient = gcd / remainder;

                (gcd, remainder) = (
                    // The old remainder is the next gcd to try.
                    remainder,
                    // Compute the next remainder.
                    // Can't overflow given that (a % gcd) * (gcd // (a % gcd)) <= gcd
                    // where gcd is at most n (capped to type(uint256).max)
                    gcd - remainder * quotient
                );

                (x, y) = (
                    // Increment the coefficient of a.
                    y,
                    // Decrement the coefficient of n.
                    // Can overflow, but the result is casted to uint256 so that the
                    // next value of y is "wrapped around" to a value between 0 and n - 1.
                    x - y * int256(quotient)
                );
            }

            if (gcd != 1) return 0; // No inverse exists.
            return ternary(x < 0, n - uint256(-x), uint256(x)); // Wrap the result if it's negative.
        }
    }

    /**
     * @dev Variant of {invMod}. More efficient, but only works if `p` is known to be a prime greater than `2`.
     *
     * From https://en.wikipedia.org/wiki/Fermat%27s_little_theorem[Fermat's little theorem], we know that if p is
     * prime, then `a**(p-1) ≡ 1 mod p`. As a consequence, we have `a * a**(p-2) ≡ 1 mod p`, which means that
     * `a**(p-2)` is the modular multiplicative inverse of a in Fp.
     *
     * NOTE: this function does NOT check that `p` is a prime greater than `2`.
     */
    function invModPrime(uint256 a, uint256 p) internal view returns (uint256) {
        unchecked {
            return Math.modExp(a, p - 2, p);
        }
    }

    /**
     * @dev Returns the modular exponentiation of the specified base, exponent and modulus (b ** e % m)
     *
     * Requirements:
     * - modulus can't be zero
     * - underlying staticcall to precompile must succeed
     *
     * IMPORTANT: The result is only valid if the underlying call succeeds. When using this function, make
     * sure the chain you're using it on supports the precompiled contract for modular exponentiation
     * at address 0x05 as specified in https://eips.ethereum.org/EIPS/eip-198[EIP-198]. Otherwise,
     * the underlying function will succeed given the lack of a revert, but the result may be incorrectly
     * interpreted as 0.
     */
    function modExp(uint256 b, uint256 e, uint256 m) internal view returns (uint256) {
        (bool success, uint256 result) = tryModExp(b, e, m);
        if (!success) {
            Panic.panic(Panic.DIVISION_BY_ZERO);
        }
        return result;
    }

    /**
     * @dev Returns the modular exponentiation of the specified base, exponent and modulus (b ** e % m).
     * It includes a success flag indicating if the operation succeeded. Operation will be marked as failed if trying
     * to operate modulo 0 or if the underlying precompile reverted.
     *
     * IMPORTANT: The result is only valid if the success flag is true. When using this function, make sure the chain
     * you're using it on supports the precompiled contract for modular exponentiation at address 0x05 as specified in
     * https://eips.ethereum.org/EIPS/eip-198[EIP-198]. Otherwise, the underlying function will succeed given the lack
     * of a revert, but the result may be incorrectly interpreted as 0.
     */
    function tryModExp(uint256 b, uint256 e, uint256 m) internal view returns (bool success, uint256 result) {
        if (m == 0) return (false, 0);
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            // | Offset    | Content    | Content (Hex)                                                      |
            // |-----------|------------|--------------------------------------------------------------------|
            // | 0x00:0x1f | size of b  | 0x0000000000000000000000000000000000000000000000000000000000000020 |
            // | 0x20:0x3f | size of e  | 0x0000000000000000000000000000000000000000000000000000000000000020 |
            // | 0x40:0x5f | size of m  | 0x0000000000000000000000000000000000000000000000000000000000000020 |
            // | 0x60:0x7f | value of b | 0x<.............................................................b> |
            // | 0x80:0x9f | value of e | 0x<.............................................................e> |
            // | 0xa0:0xbf | value of m | 0x<.............................................................m> |
            mstore(ptr, 0x20)
            mstore(add(ptr, 0x20), 0x20)
            mstore(add(ptr, 0x40), 0x20)
            mstore(add(ptr, 0x60), b)
            mstore(add(ptr, 0x80), e)
            mstore(add(ptr, 0xa0), m)

            // Given the result < m, it's guaranteed to fit in 32 bytes,
            // so we can use the memory scratch space located at offset 0.
            success := staticcall(gas(), 0x05, ptr, 0xc0, 0x00, 0x20)
            result := mload(0x00)
        }
    }

    /**
     * @dev Variant of {modExp} that supports inputs of arbitrary length.
     */
    function modExp(bytes memory b, bytes memory e, bytes memory m) internal view returns (bytes memory) {
        (bool success, bytes memory result) = tryModExp(b, e, m);
        if (!success) {
            Panic.panic(Panic.DIVISION_BY_ZERO);
        }
        return result;
    }

    /**
     * @dev Variant of {tryModExp} that supports inputs of arbitrary length.
     */
    function tryModExp(
        bytes memory b,
        bytes memory e,
        bytes memory m
    ) internal view returns (bool success, bytes memory result) {
        if (_zeroBytes(m)) return (false, new bytes(0));

        uint256 mLen = m.length;

        // Encode call args in result and move the free memory pointer
        result = abi.encodePacked(b.length, e.length, mLen, b, e, m);

        assembly ("memory-safe") {
            let dataPtr := add(result, 0x20)
            // Write result on top of args to avoid allocating extra memory.
            success := staticcall(gas(), 0x05, dataPtr, mload(result), dataPtr, mLen)
            // Overwrite the length.
            // result.length > returndatasize() is guaranteed because returndatasize() == m.length
            mstore(result, mLen)
            // Set the memory pointer after the returned data.
            mstore(0x40, add(dataPtr, mLen))
        }
    }

    /**
     * @dev Returns whether the provided byte array is zero.
     */
    function _zeroBytes(bytes memory byteArray) private pure returns (bool) {
        for (uint256 i = 0; i < byteArray.length; ++i) {
            if (byteArray[i] != 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Returns the square root of a number. If the number is not a perfect square, the value is rounded
     * towards zero.
     *
     * This method is based on Newton's method for computing square roots; the algorithm is restricted to only
     * using integer operations.
     */
    function sqrt(uint256 a) internal pure returns (uint256) {
        unchecked {
            // Take care of easy edge cases when a == 0 or a == 1
            if (a <= 1) {
                return a;
            }

            // In this function, we use Newton's method to get a root of `f(x) := x² - a`. It involves building a
            // sequence x_n that converges toward sqrt(a). For each iteration x_n, we also define the error between
            // the current value as `ε_n = | x_n - sqrt(a) |`.
            //
            // For our first estimation, we consider `e` the smallest power of 2 which is bigger than the square root
            // of the target. (i.e. `2**(e-1) ≤ sqrt(a) < 2**e`). We know that `e ≤ 128` because `(2¹²⁸)² = 2²⁵⁶` is
            // bigger than any uint256.
            //
            // By noticing that
            // `2**(e-1) ≤ sqrt(a) < 2**e → (2**(e-1))² ≤ a < (2**e)² → 2**(2*e-2) ≤ a < 2**(2*e)`
            // we can deduce that `e - 1` is `log2(a) / 2`. We can thus compute `x_n = 2**(e-1)` using a method similar
            // to the msb function.
            uint256 aa = a;
            uint256 xn = 1;

            if (aa >= (1 << 128)) {
                aa >>= 128;
                xn <<= 64;
            }
            if (aa >= (1 << 64)) {
                aa >>= 64;
                xn <<= 32;
            }
            if (aa >= (1 << 32)) {
                aa >>= 32;
                xn <<= 16;
            }
            if (aa >= (1 << 16)) {
                aa >>= 16;
                xn <<= 8;
            }
            if (aa >= (1 << 8)) {
                aa >>= 8;
                xn <<= 4;
            }
            if (aa >= (1 << 4)) {
                aa >>= 4;
                xn <<= 2;
            }
            if (aa >= (1 << 2)) {
                xn <<= 1;
            }

            // We now have x_n such that `x_n = 2**(e-1) ≤ sqrt(a) < 2**e = 2 * x_n`. This implies ε_n ≤ 2**(e-1).
            //
            // We can refine our estimation by noticing that the middle of that interval minimizes the error.
            // If we move x_n to equal 2**(e-1) + 2**(e-2), then we reduce the error to ε_n ≤ 2**(e-2).
            // This is going to be our x_0 (and ε_0)
            xn = (3 * xn) >> 1; // ε_0 := | x_0 - sqrt(a) | ≤ 2**(e-2)

            // From here, Newton's method give us:
            // x_{n+1} = (x_n + a / x_n) / 2
            //
            // One should note that:
            // x_{n+1}² - a = ((x_n + a / x_n) / 2)² - a
            //              = ((x_n² + a) / (2 * x_n))² - a
            //              = (x_n⁴ + 2 * a * x_n² + a²) / (4 * x_n²) - a
            //              = (x_n⁴ + 2 * a * x_n² + a² - 4 * a * x_n²) / (4 * x_n²)
            //              = (x_n⁴ - 2 * a * x_n² + a²) / (4 * x_n²)
            //              = (x_n² - a)² / (2 * x_n)²
            //              = ((x_n² - a) / (2 * x_n))²
            //              ≥ 0
            // Which proves that for all n ≥ 1, sqrt(a) ≤ x_n
            //
            // This gives us the proof of quadratic convergence of the sequence:
            // ε_{n+1} = | x_{n+1} - sqrt(a) |
            //         = | (x_n + a / x_n) / 2 - sqrt(a) |
            //         = | (x_n² + a - 2*x_n*sqrt(a)) / (2 * x_n) |
            //         = | (x_n - sqrt(a))² / (2 * x_n) |
            //         = | ε_n² / (2 * x_n) |
            //         = ε_n² / | (2 * x_n) |
            //
            // For the first iteration, we have a special case where x_0 is known:
            // ε_1 = ε_0² / | (2 * x_0) |
            //     ≤ (2**(e-2))² / (2 * (2**(e-1) + 2**(e-2)))
            //     ≤ 2**(2*e-4) / (3 * 2**(e-1))
            //     ≤ 2**(e-3) / 3
            //     ≤ 2**(e-3-log2(3))
            //     ≤ 2**(e-4.5)
            //
            // For the following iterations, we use the fact that, 2**(e-1) ≤ sqrt(a) ≤ x_n:
            // ε_{n+1} = ε_n² / | (2 * x_n) |
            //         ≤ (2**(e-k))² / (2 * 2**(e-1))
            //         ≤ 2**(2*e-2*k) / 2**e
            //         ≤ 2**(e-2*k)
            xn = (xn + a / xn) >> 1; // ε_1 := | x_1 - sqrt(a) | ≤ 2**(e-4.5)  -- special case, see above
            xn = (xn + a / xn) >> 1; // ε_2 := | x_2 - sqrt(a) | ≤ 2**(e-9)    -- general case with k = 4.5
            xn = (xn + a / xn) >> 1; // ε_3 := | x_3 - sqrt(a) | ≤ 2**(e-18)   -- general case with k = 9
            xn = (xn + a / xn) >> 1; // ε_4 := | x_4 - sqrt(a) | ≤ 2**(e-36)   -- general case with k = 18
            xn = (xn + a / xn) >> 1; // ε_5 := | x_5 - sqrt(a) | ≤ 2**(e-72)   -- general case with k = 36
            xn = (xn + a / xn) >> 1; // ε_6 := | x_6 - sqrt(a) | ≤ 2**(e-144)  -- general case with k = 72

            // Because e ≤ 128 (as discussed during the first estimation phase), we know have reached a precision
            // ε_6 ≤ 2**(e-144) < 1. Given we're operating on integers, then we can ensure that xn is now either
            // sqrt(a) or sqrt(a) + 1.
            return xn - SafeCast.toUint(xn > a / xn);
        }
    }

    /**
     * @dev Calculates sqrt(a), following the selected rounding direction.
     */
    function sqrt(uint256 a, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = sqrt(a);
            return result + SafeCast.toUint(unsignedRoundsUp(rounding) && result * result < a);
        }
    }

    /**
     * @dev Return the log in base 2 of a positive value rounded towards zero.
     * Returns 0 if given 0.
     */
    function log2(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        uint256 exp;
        unchecked {
            exp = 128 * SafeCast.toUint(value > (1 << 128) - 1);
            value >>= exp;
            result += exp;

            exp = 64 * SafeCast.toUint(value > (1 << 64) - 1);
            value >>= exp;
            result += exp;

            exp = 32 * SafeCast.toUint(value > (1 << 32) - 1);
            value >>= exp;
            result += exp;

            exp = 16 * SafeCast.toUint(value > (1 << 16) - 1);
            value >>= exp;
            result += exp;

            exp = 8 * SafeCast.toUint(value > (1 << 8) - 1);
            value >>= exp;
            result += exp;

            exp = 4 * SafeCast.toUint(value > (1 << 4) - 1);
            value >>= exp;
            result += exp;

            exp = 2 * SafeCast.toUint(value > (1 << 2) - 1);
            value >>= exp;
            result += exp;

            result += SafeCast.toUint(value > 1);
        }
        return result;
    }

    /**
     * @dev Return the log in base 2, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log2(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log2(value);
            return result + SafeCast.toUint(unsignedRoundsUp(rounding) && 1 << result < value);
        }
    }

    /**
     * @dev Return the log in base 10 of a positive value rounded towards zero.
     * Returns 0 if given 0.
     */
    function log10(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >= 10 ** 64) {
                value /= 10 ** 64;
                result += 64;
            }
            if (value >= 10 ** 32) {
                value /= 10 ** 32;
                result += 32;
            }
            if (value >= 10 ** 16) {
                value /= 10 ** 16;
                result += 16;
            }
            if (value >= 10 ** 8) {
                value /= 10 ** 8;
                result += 8;
            }
            if (value >= 10 ** 4) {
                value /= 10 ** 4;
                result += 4;
            }
            if (value >= 10 ** 2) {
                value /= 10 ** 2;
                result += 2;
            }
            if (value >= 10 ** 1) {
                result += 1;
            }
        }
        return result;
    }

    /**
     * @dev Return the log in base 10, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log10(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log10(value);
            return result + SafeCast.toUint(unsignedRoundsUp(rounding) && 10 ** result < value);
        }
    }

    /**
     * @dev Return the log in base 256 of a positive value rounded towards zero.
     * Returns 0 if given 0.
     *
     * Adding one to the result gives the number of pairs of hex symbols needed to represent `value` as a hex string.
     */
    function log256(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        uint256 isGt;
        unchecked {
            isGt = SafeCast.toUint(value > (1 << 128) - 1);
            value >>= isGt * 128;
            result += isGt * 16;

            isGt = SafeCast.toUint(value > (1 << 64) - 1);
            value >>= isGt * 64;
            result += isGt * 8;

            isGt = SafeCast.toUint(value > (1 << 32) - 1);
            value >>= isGt * 32;
            result += isGt * 4;

            isGt = SafeCast.toUint(value > (1 << 16) - 1);
            value >>= isGt * 16;
            result += isGt * 2;

            result += SafeCast.toUint(value > (1 << 8) - 1);
        }
        return result;
    }

    /**
     * @dev Return the log in base 256, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log256(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log256(value);
            return result + SafeCast.toUint(unsignedRoundsUp(rounding) && 1 << (result << 3) < value);
        }
    }

    /**
     * @dev Returns whether a provided rounding mode is considered rounding up for unsigned integers.
     */
    function unsignedRoundsUp(Rounding rounding) internal pure returns (bool) {
        return uint8(rounding) % 2 == 1;
    }
}

// src/TenderClearing.sol

/// @title TenderClearing
/// @notice The clearing rule of a buyback tender, as a pure library.
///
/// Ported from Peal (the author's earlier project, started July 2026), where the
/// same rule clears sealed buyback tenders. Re-written for this repository; the
/// rule and its test cases are Peal's.
///
/// A tender is a uniform-price auction turned around. One buyer (the treasury)
/// holds a budget in a payment token. Sellers each offer a quantity of the token
/// being bought back at a minimum price, expressed as a tick on a price ladder:
/// `price(tick) = floorPrice + tick * tickSize` payment base units per whole token.
/// Everyone who sells is paid the same price.
///
/// The price climbs from the lowest tick that holds supply:
///   - if the budget pays every offer at or below this tick at this tick's price,
///     they all fill and the price may climb further;
///   - if it pays every cheaper offer but not all of this tick, the budget is spent
///     here: cheaper offers fill in full, offers at this tick share pro-rata;
///   - if it cannot even pay the cheaper offers at this tick's price, the price
///     stays at the previous tick and the rest of the budget is not spent.
///
/// So a seller is never paid below their minimum, offers are taken cheapest first,
/// and the sum of all payments never exceeds the budget. The scan is over ticks,
/// never over offers, so posting many offers cannot make settlement dearer.
library TenderClearing {
    uint256 internal constant MAX_TICKS = 256;

    struct Result {
        bool cleared;
        uint16 clearingTick;
        uint256 price;
        uint256 bought;
        uint256 supplyAtClearingTick;
        uint256 fillAtClearingTick;
    }

    function priceAt(uint256 floorPrice, uint256 tickSize, uint256 tick) internal pure returns (uint256) {
        return floorPrice + tick * tickSize;
    }

    /// @notice Payment for `quantity` base units at `price`, rounded down (what a seller is paid).
    function costFloor(uint256 quantity, uint256 price, uint8 decimals) internal pure returns (uint256) {
        return Math.mulDiv(quantity, price, 10 ** decimals, Math.Rounding.Floor);
    }

    /// @notice Payment for `quantity` base units at `price`, rounded up (what the budget must cover).
    function costCeil(uint256 quantity, uint256 price, uint8 decimals) internal pure returns (uint256) {
        return Math.mulDiv(quantity, price, 10 ** decimals, Math.Rounding.Ceil);
    }

    function findClearing(
        uint256[] memory supplyByTick,
        uint256 budget,
        uint256 floorPrice,
        uint256 tickSize,
        uint8 decimals
    ) internal pure returns (Result memory r) {
        uint256 numTicks = supplyByTick.length;
        require(numTicks > 0 && numTicks <= MAX_TICKS, "TenderClearing: bad tick count");
        require(budget > 0, "TenderClearing: zero budget");
        require(floorPrice > 0, "TenderClearing: zero floor price");

        uint256 cumulative = 0;
        bool any = false;
        uint256 last = 0;

        for (uint256 t = 0; t < numTicks; ++t) {
            uint256 s = supplyByTick[t];
            if (s == 0) continue;
            uint256 p = priceAt(floorPrice, tickSize, t);

            // Every cheaper seller would be paid this price too.
            if (costCeil(cumulative, p, decimals) > budget) break;

            if (costCeil(cumulative + s, p, decimals) <= budget) {
                cumulative += s;
                any = true;
                last = t;
                continue;
            }

            // The budget runs out inside this tick.
            uint256 maxQty = Math.mulDiv(budget, 10 ** decimals, p);
            uint256 fill = maxQty - cumulative;
            if (fill == 0) break;

            r.cleared = true;
            // Safe: t < numTicks <= 256.
            // forge-lint: disable-next-line(unsafe-typecast)
            r.clearingTick = uint16(t);
            r.price = p;
            r.bought = cumulative + fill;
            r.supplyAtClearingTick = s;
            r.fillAtClearingTick = fill;
            return r;
        }

        if (!any) return r; // nothing affordable: the tender fails and sellers are refunded

        r.cleared = true;
        // forge-lint: disable-next-line(unsafe-typecast)
        r.clearingTick = uint16(last);
        r.price = priceAt(floorPrice, tickSize, last);
        r.bought = cumulative;
        r.supplyAtClearingTick = supplyByTick[last];
        r.fillAtClearingTick = supplyByTick[last];
    }

    /// @notice What one offer sells. Order-independent: computed from the offer and
    ///         totals fixed at settlement, never from a running counter, and floored,
    ///         so the allocations at the clearing tick never sum above its fill.
    function allocationFor(Result memory r, uint256 quantity, uint16 tick) internal pure returns (uint256) {
        if (!r.cleared) return 0;
        if (tick > r.clearingTick) return 0;
        if (tick < r.clearingTick) return quantity;
        if (r.fillAtClearingTick >= r.supplyAtClearingTick) return quantity;
        return Math.mulDiv(quantity, r.fillAtClearingTick, r.supplyAtClearingTick);
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC1363.sol

// OpenZeppelin Contracts (last updated v5.1.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol

// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}

// src/TenderBook.sol

/// @title TenderBook
/// @notice The open buyback tender of `PealTenderV2`: holders offer the bought-back
///         token at a minimum price, and the tender clears at one price
///         (`TenderClearing`, ported from Peal).
///
/// A linked library with external functions. The vault calls it with DELEGATECALL,
/// so its code runs on the vault's own storage (`Book`) and token balances, with
/// the vault's `msg.sender`. It is a library only to keep the vault under the
/// 24,576-byte contract size limit; it holds no funds and no state of its own,
/// and Solidity refuses direct calls to its state-changing functions.
///
/// The vault decides who may call what: `open` and `cancel` only after a quorum
/// of post-quantum signatures, `settle`, `offer` and `claim` for anyone.
/// The rules are the drill vault's (`PealTender`), unchanged.
library TenderBook {
    using SafeERC20 for IERC20;

    uint256 internal constant MAX_DURATION = 30 days;
    uint32 internal constant MAX_OFFERS = 200;

    enum State {
        None,
        Open,
        Settled,
        Failed
    }

    struct OpenParams {
        uint256 budget; // payment base units
        uint256 floorPrice; // payment base units per whole bought token, at tick 0
        uint256 tickSize; // price step per tick
        uint16 numTicks; // 1 to 256
        uint64 endTime; // offers accepted until this timestamp
        uint32 maxOffers; // 1 to MAX_OFFERS
        uint256 minQuantity; // smallest offer, in bought-token base units
    }

    struct Tender {
        State state;
        uint16 numTicks;
        uint16 clearingTick;
        uint32 maxOffers;
        uint32 offerCount;
        uint32 claimedCount;
        uint64 endTime;
        uint256 budget;
        uint256 floorPrice;
        uint256 tickSize;
        uint256 minQuantity;
        uint256 price;
        uint256 bought;
        uint256 supplyAtClearingTick;
        uint256 fillAtClearingTick;
        uint256 reserved; // payment still held for this tender
        uint256 escrowed; // seller tokens still held for this tender
    }

    struct Offer {
        address seller;
        uint16 tick;
        bool claimed;
        uint256 quantity;
    }

    struct Book {
        uint256 tenderCount;
        uint256 openTenderId; // 0 when no tender is open
        uint256 reservedPay; // payment owed to the open tender's budget or to unclaimed sellers
        uint256 escrowedBuy; // sellers' tokens held for unclaimed offers
        mapping(uint256 tenderId => Tender) tenders;
        mapping(uint256 tenderId => mapping(uint32 offerId => Offer)) offers;
        mapping(uint256 tenderId => mapping(uint256 tick => uint256)) supplyByTick;
    }

    event TenderOpened(
        uint256 indexed tenderId,
        uint256 budget,
        uint256 floorPrice,
        uint256 tickSize,
        uint16 numTicks,
        uint64 endTime,
        uint32 maxOffers,
        uint256 minQuantity
    );
    event OfferPlaced(
        uint256 indexed tenderId, uint32 indexed offerId, address indexed seller, uint256 quantity, uint16 tick
    );
    event TenderSettled(uint256 indexed tenderId, uint16 clearingTick, uint256 price, uint256 bought, uint256 reserved);
    event TenderFailed(uint256 indexed tenderId, string reason);
    event Claimed(
        uint256 indexed tenderId,
        uint32 indexed offerId,
        address indexed seller,
        uint256 sold,
        uint256 paid,
        uint256 returned
    );

    error BadParams(string what);
    error TenderAlreadyOpen(uint256 tenderId);
    error NoOpenTender();
    error TooEarly(uint256 at);
    error TooLate(uint256 at);
    error BadTick(uint16 tick, uint16 numTicks);
    error BadQuantity(uint256 quantity);
    error TooManyOffers(uint32 maxOffers);
    error NoSuchOffer(uint256 tenderId, uint32 offerId);
    error AlreadyClaimed(uint256 tenderId, uint32 offerId);
    error NotClaimable(uint256 tenderId, State state);
    error FeeOnTransfer(uint256 expected, uint256 received);

    // ------------------------------------------------------------------ gated by the vault

    /// @notice Refuse parameters that could not make a tender (no state change).
    function checkOpen(Book storage b, OpenParams calldata p) external view {
        if (b.openTenderId != 0) revert TenderAlreadyOpen(b.openTenderId);
        if (p.budget == 0) revert BadParams("budget");
        if (p.floorPrice == 0) revert BadParams("floorPrice");
        if (p.numTicks == 0 || p.numTicks > TenderClearing.MAX_TICKS) revert BadParams("numTicks");
        if (p.numTicks > 1 && p.tickSize == 0) revert BadParams("tickSize");
        if (p.endTime <= block.timestamp || p.endTime > block.timestamp + MAX_DURATION) revert BadParams("endTime");
        if (p.maxOffers == 0 || p.maxOffers > MAX_OFFERS) revert BadParams("maxOffers");
        if (p.minQuantity == 0) revert BadParams("minQuantity");
        // The dearest tick must be computable.
        TenderClearing.priceAt(p.floorPrice, p.tickSize, p.numTicks - 1);
    }

    /// @notice Open a tender, reserving its budget. Call `checkOpen` first.
    function open(Book storage b, OpenParams calldata p) external returns (uint256 tenderId) {
        tenderId = ++b.tenderCount;
        Tender storage t = b.tenders[tenderId];
        t.state = State.Open;
        t.numTicks = p.numTicks;
        t.maxOffers = p.maxOffers;
        t.endTime = p.endTime;
        t.budget = p.budget;
        t.floorPrice = p.floorPrice;
        t.tickSize = p.tickSize;
        t.minQuantity = p.minQuantity;
        t.reserved = p.budget;
        b.reservedPay += p.budget;
        b.openTenderId = tenderId;
        emit TenderOpened(
            tenderId, p.budget, p.floorPrice, p.tickSize, p.numTicks, p.endTime, p.maxOffers, p.minQuantity
        );
    }

    /// @notice The open tender's id, if it may still be cancelled (before its end).
    function checkCancel(Book storage b) external view returns (uint256 id) {
        id = b.openTenderId;
        if (id == 0) revert NoOpenTender();
        uint64 end = b.tenders[id].endTime;
        if (block.timestamp >= end) revert TooLate(end);
    }

    /// @notice Fail the open tender; sellers reclaim their tokens. Call `checkCancel` first.
    function cancel(Book storage b) external {
        uint256 id = b.openTenderId;
        _fail(b, id, b.tenders[id], "cancelled");
    }

    // ------------------------------------------------------------------ anyone

    /// @notice Settle the open tender at one clearing price, after its end.
    function settle(Book storage b, uint8 buyDecimals) external {
        uint256 id = b.openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = b.tenders[id];
        if (block.timestamp < t.endTime) revert TooEarly(t.endTime);

        uint256[] memory supply = new uint256[](t.numTicks);
        for (uint256 i = 0; i < t.numTicks; ++i) {
            supply[i] = b.supplyByTick[id][i];
        }
        TenderClearing.Result memory r =
            TenderClearing.findClearing(supply, t.budget, t.floorPrice, t.tickSize, buyDecimals);
        if (!r.cleared) {
            _fail(b, id, t, "no offer within budget");
            return;
        }

        // What the sellers can be owed at most: payments are floored per offer and
        // allocations never sum above `bought`, so this bounds their sum.
        uint256 maxOwed = TenderClearing.costCeil(r.bought, r.price, buyDecimals);
        if (maxOwed > t.budget) maxOwed = t.budget;
        b.reservedPay -= t.budget - maxOwed;
        t.reserved = maxOwed;

        t.state = State.Settled;
        t.clearingTick = r.clearingTick;
        t.price = r.price;
        t.bought = r.bought;
        t.supplyAtClearingTick = r.supplyAtClearingTick;
        t.fillAtClearingTick = r.fillAtClearingTick;
        b.openTenderId = 0;
        emit TenderSettled(id, r.clearingTick, r.price, r.bought, maxOwed);
    }

    /// @notice Offer `quantity` of the bought-back token at a minimum price tick,
    ///         pulled from `msg.sender` (the holder) and escrowed.
    function offer(Book storage b, IERC20 buyToken, uint256 quantity, uint16 tick) external returns (uint32 offerId) {
        uint256 id = b.openTenderId;
        if (id == 0) revert NoOpenTender();
        Tender storage t = b.tenders[id];
        if (block.timestamp >= t.endTime) revert TooLate(t.endTime);
        if (tick >= t.numTicks) revert BadTick(tick, t.numTicks);
        if (quantity < t.minQuantity) revert BadQuantity(quantity);
        if (t.offerCount >= t.maxOffers) revert TooManyOffers(t.maxOffers);

        uint256 before = buyToken.balanceOf(address(this));
        buyToken.safeTransferFrom(msg.sender, address(this), quantity);
        uint256 received = buyToken.balanceOf(address(this)) - before;
        if (received != quantity) revert FeeOnTransfer(quantity, received);

        offerId = t.offerCount++;
        b.offers[id][offerId] = Offer({seller: msg.sender, tick: tick, claimed: false, quantity: quantity});
        b.supplyByTick[id][tick] += quantity;
        t.escrowed += quantity;
        b.escrowedBuy += quantity;
        emit OfferPlaced(id, offerId, msg.sender, quantity, tick);
    }

    /// @notice Settle one offer of a settled or failed tender. Payment and unsold
    ///         tokens only ever go to the offer's seller.
    function claim(
        Book storage b,
        IERC20 payToken,
        IERC20 buyToken,
        uint8 buyDecimals,
        uint256 tenderId,
        uint32 offerId
    ) external returns (uint256 sold, uint256 paid, uint256 returned) {
        Tender storage t = b.tenders[tenderId];
        Offer storage o = b.offers[tenderId][offerId];
        if (o.seller == address(0)) revert NoSuchOffer(tenderId, offerId);
        if (o.claimed) revert AlreadyClaimed(tenderId, offerId);
        if (t.state != State.Settled && t.state != State.Failed) revert NotClaimable(tenderId, t.state);

        o.claimed = true;
        t.claimedCount += 1;
        t.escrowed -= o.quantity;
        b.escrowedBuy -= o.quantity;

        if (t.state == State.Settled) {
            sold = TenderClearing.allocationFor(_result(t), o.quantity, o.tick);
            paid = TenderClearing.costFloor(sold, t.price, buyDecimals);
            t.reserved -= paid;
            b.reservedPay -= paid;
            if (t.claimedCount == t.offerCount) {
                // Every seller is paid: rounding dust goes back to the treasury.
                b.reservedPay -= t.reserved;
                t.reserved = 0;
            }
        }
        returned = o.quantity - sold;

        if (paid > 0) payToken.safeTransfer(o.seller, paid);
        if (returned > 0) buyToken.safeTransfer(o.seller, returned);
        emit Claimed(tenderId, offerId, o.seller, sold, paid, returned);
    }

    // ------------------------------------------------------------------ views

    function getTender(Book storage b, uint256 tenderId) external view returns (Tender memory) {
        return b.tenders[tenderId];
    }

    function getOffer(Book storage b, uint256 tenderId, uint32 offerId) external view returns (Offer memory) {
        return b.offers[tenderId][offerId];
    }

    /// @notice What an offer sells, once its tender is settled.
    function allocationOf(Book storage b, uint256 tenderId, uint32 offerId) external view returns (uint256) {
        Tender storage t = b.tenders[tenderId];
        Offer storage o = b.offers[tenderId][offerId];
        if (t.state != State.Settled || o.seller == address(0)) return 0;
        return TenderClearing.allocationFor(_result(t), o.quantity, o.tick);
    }

    // ------------------------------------------------------------------ internals

    function _fail(Book storage b, uint256 id, Tender storage t, string memory reason) private {
        t.state = State.Failed;
        b.reservedPay -= t.reserved;
        t.reserved = 0;
        b.openTenderId = 0;
        emit TenderFailed(id, reason);
    }

    function _result(Tender storage t) private view returns (TenderClearing.Result memory r) {
        r.cleared = t.state == State.Settled;
        r.clearingTick = t.clearingTick;
        r.price = t.price;
        r.bought = t.bought;
        r.supplyAtClearingTick = t.supplyAtClearingTick;
        r.fillAtClearingTick = t.fillAtClearingTick;
    }
}

// src/PealTenderV2.sol

/// @title PealTenderV2
/// @notice A treasury buyback vault run by a t-of-n set of post-quantum (ML-DSA-87)
///         signers, with a timelock on the dangerous changes.
///
/// The treasury keeps its payment token (fUSD on the QoreChain testnet) here and
/// buys back its own token (PEAL-T) two ways:
///   - an open **tender** in this contract: holders offer tokens at a minimum
///     price, and the tender clears at one price (`TenderClearing`, from Peal).
///     Its code lives in the linked library `TenderBook`, which runs on this
///     contract's storage and balances (only to stay under the size limit);
///   - a **sealed sale** on Peal Sealed Auction: the vault is the auction's issuer
///     and sells fUSD for PEAL-T, so the forward auction clears the buyback.
///
/// ## Who can do what
///
/// | Action | Needs |
/// | --- | --- |
/// | `deposit`, `openTender`, `cancelTender`, `sweep` (within the daily cap) | quorum |
/// | `startSealedSale`, `cancelSealedSale` | quorum |
/// | `queue` a timelocked change (signer set, delay, daily cap, auction factory, a sweep above the cap) | quorum |
/// | `execute` a queued change once its delay has passed | anyone |
/// | `veto` a queued change | any ONE signer |
/// | `settle` a tender after its end, `claim`, `collectSealedSale` | anyone |
/// | `offer` | a holder, with their own tokens |
///
/// "Quorum" means ML-DSA-87 signatures by at least `threshold` distinct members of
/// the signer set over (chain id, this contract, member, action, set nonce,
/// deadline, argument hash), each checked by the `pqcKeyStatus` and `pqcVerify`
/// precompiles through `qore-pq-kit`'s `PqAuthSet`. `msg.sender` authorises
/// nothing: holding a member's classical secp256k1 key, or being the deployer,
/// gives no power here, and anyone may relay a signed action.
///
/// ## Bounding a key compromise
///
/// Even a quorum of stolen post-quantum keys is bounded and visible:
///   - Payment-token outflows that the quorum can start at once (sweeps, tender
///     budgets, sealed-sale supplies) draw on one per-token daily allowance,
///     `dailyCap`. Anything above it must be queued and wait `delay`.
///   - Changing the signer set, the delay, a cap or the auction factory is always
///     queued.
///   - During the delay any single member can veto with one signature.
///   - Executing a signer-set change voids every other queued change.
///
/// ## Accounting
///
/// `reservedPay` is payment owed to an open tender's budget or to unclaimed
/// sellers of a settled one; `escrowedBuy` is sellers' tokens held for unclaimed
/// offers. Only the balance above those is free to sweep, budget or sell. A sealed
/// sale's supply leaves the vault when it starts; whatever comes back (PEAL-T
/// proceeds, unsold fUSD) is free again. Funds that arrive by a plain transfer
/// (or a native-lane `MsgConvertCoin` straight to this address) are free.
contract PealTenderV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PqAuthSet for PqAuthSet.Set;
    using TenderBook for TenderBook.Book;

    // ------------------------------------------------------------------ constants

    bytes32 public constant ACTION_DEPOSIT = keccak256("PealTenderV2.deposit");
    bytes32 public constant ACTION_OPEN_TENDER = keccak256("PealTenderV2.openTender");
    bytes32 public constant ACTION_CANCEL_TENDER = keccak256("PealTenderV2.cancelTender");
    bytes32 public constant ACTION_SWEEP = keccak256("PealTenderV2.sweep");
    bytes32 public constant ACTION_QUEUE = keccak256("PealTenderV2.queue");
    bytes32 public constant ACTION_VETO = keccak256("PealTenderV2.veto");
    bytes32 public constant ACTION_START_SALE = keccak256("PealTenderV2.startSealedSale");
    bytes32 public constant ACTION_CANCEL_SALE = keccak256("PealTenderV2.cancelSealedSale");

    /// @notice How far ahead a signature's deadline may be.
    uint256 public constant MAX_AUTH_TTL = 1 days;
    uint64 public constant MIN_DELAY = 5 minutes;
    uint64 public constant MAX_DELAY = 30 days;
    /// @notice A queued change can be executed for this long after its delay, then it lapses.
    uint64 public constant EXECUTION_WINDOW = 7 days;

    // ------------------------------------------------------------------ types

    /// @notice Signatures for one quorum action. `signers` strictly ascending.
    struct Auth {
        uint256 deadline;
        address[] signers;
        bytes[] signatures;
    }

    /// @notice What a queued change does. `data` encodings:
    ///   SetSigners        abi.encode(address[] members, uint256 threshold)
    ///   SetDelay          abi.encode(uint64 delay)
    ///   SetDailyCap       abi.encode(address token, uint256 cap)     token 0 = native QOR
    ///   SetAuctionFactory abi.encode(address factory)                0 = sealed sales off
    ///   Sweep             abi.encode(address token, address to, uint256 amount)
    enum OpKind {
        SetSigners,
        SetDelay,
        SetDailyCap,
        SetAuctionFactory,
        Sweep
    }

    enum OpState {
        None,
        Queued,
        Executed,
        Vetoed
    }

    struct Op {
        OpKind kind;
        OpState state;
        uint64 eta; // executable from this time
        uint64 epoch; // signer-set epoch it was queued in
        bytes data;
    }

    struct Allowance {
        uint64 day; // block.timestamp / 1 days of the last spend
        uint192 spent; // spent on that day
    }

    enum SaleState {
        None,
        Active,
        Collected,
        Cancelled
    }

    struct Sale {
        SaleState state;
        uint64 startedAt;
        uint256 supply; // payment token sent to the auction
        uint256 proceeds; // bought token received back by collectSealedSale
        uint256 returned; // payment token received back by collectSealedSale
    }

    // ------------------------------------------------------------------ storage

    IERC20 public immutable payToken;
    IERC20 public immutable buyToken;
    uint8 public immutable buyDecimals;

    PqAuthSet.Set internal _set;
    /// @notice Bumped by every executed signer-set change; older queued changes are void.
    uint64 public setEpoch;
    uint64 public delay;
    address public auctionFactory;

    mapping(address token => uint256) public dailyCap;
    mapping(address token => Allowance) internal _allowance;

    uint256 public opCount;
    mapping(uint256 opId => Op) internal _ops;

    TenderBook.Book internal _book;

    address[] internal _saleList;
    mapping(address auction => Sale) internal _sales;

    // ------------------------------------------------------------------ events and errors

    event Deposited(address indexed from, uint256 amount);
    event NativeReceived(address indexed from, uint256 amount);
    event Swept(address indexed token, address indexed to, uint256 amount, bool timelocked);
    event Spent(address indexed token, uint256 amount, uint256 spentToday, uint256 cap);

    event OpQueued(uint256 indexed opId, OpKind kind, bytes data, uint64 eta, uint64 epoch);
    event OpExecuted(uint256 indexed opId, OpKind kind);
    event OpVetoed(uint256 indexed opId, address indexed by);
    event DelayChanged(uint64 delay);
    event DailyCapChanged(address indexed token, uint256 cap);
    event AuctionFactoryChanged(address indexed factory);
    event SignerSetChanged(uint64 epoch, address[] members, uint256 threshold);

    event SealedSaleStarted(address indexed auction, address indexed factory, uint256 supply, bytes32 committeeSetId);
    event SealedSaleCancelled(address indexed auction, uint256 returned);
    event SealedSaleCollected(
        address indexed auction, ISealedAuction.State auctionState, uint256 proceeds, uint256 returned
    );

    error ZeroAddress();
    error SameToken();
    error BadDecimals(uint8 decimals);
    error BadParams(string what);
    error BadDelay(uint64 delay);
    error OverDailyCap(address token, uint256 amount, uint256 remaining);
    error InsufficientFree(address token, uint256 wanted, uint256 free);
    error NativeSendFailed();
    error FeeOnTransfer(uint256 expected, uint256 received);
    error BadQuantity(uint256 quantity);

    error NoSuchOp(uint256 opId);
    error OpNotQueued(uint256 opId, OpState state);
    error OpNotReady(uint256 opId, uint64 eta);
    error OpLapsed(uint256 opId, uint256 lapsedAt);
    error OpVoid(uint256 opId, uint64 queuedEpoch, uint64 currentEpoch);

    error SalesDisabled();
    error BadSaleConfig(string what);
    error NotAnAuction(address auction);
    error SaleNotActive(address auction, SaleState state);
    error SaleNotFinished(address auction, ISealedAuction.State state);
    error SaleFundingMismatch(uint256 expected, uint256 sent);

    // ------------------------------------------------------------------ construction

    /// @param members_   the signer set, strictly ascending; each needs a usable ML-DSA-87 key
    /// @param threshold_ how many members must sign a quorum action
    /// @param delay_     the timelock delay, MIN_DELAY to MAX_DELAY
    /// @param factory_   the Peal Sealed Auction factory sealed sales may use (0 = none yet)
    /// @param payDailyCap_ the first daily allowance of the payment token
    constructor(
        IERC20 payToken_,
        IERC20 buyToken_,
        address[] memory members_,
        uint256 threshold_,
        uint64 delay_,
        address factory_,
        uint256 payDailyCap_
    ) {
        if (address(payToken_) == address(0) || address(buyToken_) == address(0)) revert ZeroAddress();
        if (address(payToken_) == address(buyToken_)) revert SameToken();
        uint8 d = IERC20Metadata(address(buyToken_)).decimals();
        if (d > 30) revert BadDecimals(d);
        if (delay_ < MIN_DELAY || delay_ > MAX_DELAY) revert BadDelay(delay_);
        payToken = payToken_;
        buyToken = buyToken_;
        buyDecimals = d;
        _set.init(members_, threshold_);
        delay = delay_;
        auctionFactory = factory_;
        dailyCap[address(payToken_)] = payDailyCap_;
        emit SignerSetChanged(0, members_, threshold_);
        emit DelayChanged(delay_);
        emit AuctionFactoryChanged(factory_);
        emit DailyCapChanged(address(payToken_), payDailyCap_);
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    // ------------------------------------------------------------------ quorum actions

    /// @notice Pull `amount` of the payment token from `from` (which approved this
    ///         vault). Gated, so nobody can spend another address's approval.
    function deposit(address from, uint256 amount, Auth calldata auth) external nonReentrant {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert BadQuantity(0);
        _quorum(ACTION_DEPOSIT, keccak256(abi.encode(from, amount)), auth);
        _pullExact(payToken, from, amount);
        emit Deposited(from, amount);
    }

    /// @notice Move free funds out now, within the token's daily allowance.
    ///         `token == address(0)` is native QOR. Larger sweeps go through `queue`.
    function sweep(address token, address to, uint256 amount, Auth calldata auth) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert BadQuantity(0);
        _requireFree(token, amount);
        _quorum(ACTION_SWEEP, keccak256(abi.encode(token, to, amount)), auth);
        _spend(token, amount);
        _send(token, to, amount);
        emit Swept(token, to, amount, false);
    }

    /// @notice Open a tender, reserving its budget from the free payment balance.
    ///         The budget draws on the payment token's daily allowance.
    function openTender(TenderBook.OpenParams calldata p, Auth calldata auth)
        external
        nonReentrant
        returns (uint256 tenderId)
    {
        _book.checkOpen(p);
        _requireFree(address(payToken), p.budget);
        _quorum(ACTION_OPEN_TENDER, keccak256(abi.encode(p)), auth);
        _spend(address(payToken), p.budget);
        tenderId = _book.open(p);
    }

    /// @notice Cancel the open tender before its end. Sellers reclaim their tokens.
    function cancelTender(Auth calldata auth) external nonReentrant {
        uint256 id = _book.checkCancel();
        _quorum(ACTION_CANCEL_TENDER, keccak256(abi.encode(id)), auth);
        _book.cancel();
    }

    /// @notice Sell `cfg.totalSupply` of the payment token for the bought-back token
    ///         in a sealed auction created by `auctionFactory`, with this vault as
    ///         the issuer. The supply draws on the payment token's daily allowance.
    /// @dev The vault approves exactly the supply to the factory and clears the
    ///      approval again in the same call. Proceeds and unsold supply can only be
    ///      paid to the issuer, which is this vault, and the fee must be zero.
    function startSealedSale(
        ISealedAuction.Config calldata cfg,
        string calldata name,
        string calldata details,
        Auth calldata auth
    ) external nonReentrant returns (address auction) {
        address factory = auctionFactory;
        if (factory == address(0)) revert SalesDisabled();
        if (cfg.issuer != address(this)) revert BadSaleConfig("issuer");
        if (cfg.saleToken != address(payToken)) revert BadSaleConfig("saleToken");
        if (cfg.quoteToken != address(buyToken)) revert BadSaleConfig("quoteToken");
        if (cfg.protocolFeeBps != 0) revert BadSaleConfig("fee");
        if (cfg.totalSupply == 0) revert BadSaleConfig("supply");
        _requireFree(address(payToken), cfg.totalSupply);

        _quorum(
            ACTION_START_SALE,
            keccak256(abi.encode(factory, cfg, keccak256(bytes(name)), keccak256(bytes(details)))),
            auth
        );
        _spend(address(payToken), cfg.totalSupply);

        uint256 before = payToken.balanceOf(address(this));
        payToken.forceApprove(factory, cfg.totalSupply);
        auction = ISealedAuctionFactory(factory).createAuction(cfg, name, details);
        payToken.forceApprove(factory, 0);
        uint256 sent = before - payToken.balanceOf(address(this));
        if (sent != cfg.totalSupply) revert SaleFundingMismatch(cfg.totalSupply, sent);
        if (!ISealedAuctionFactory(factory).isAuction(auction)) revert NotAnAuction(auction);
        if (_sales[auction].state != SaleState.None) revert SaleNotActive(auction, _sales[auction].state);

        _sales[auction] = Sale({
            state: SaleState.Active,
            startedAt: uint64(block.timestamp),
            supply: cfg.totalSupply,
            proceeds: 0,
            returned: 0
        });
        _saleList.push(auction);
        emit SealedSaleStarted(auction, factory, cfg.totalSupply, cfg.committeeSetId);
    }

    /// @notice Cancel a sealed sale that has no bids yet; the auction returns the supply.
    function cancelSealedSale(address auction, Auth calldata auth) external nonReentrant {
        Sale storage s = _sales[auction];
        if (s.state != SaleState.Active) revert SaleNotActive(auction, s.state);
        _quorum(ACTION_CANCEL_SALE, keccak256(abi.encode(auction)), auth);
        s.state = SaleState.Cancelled;
        uint256 before = payToken.balanceOf(address(this));
        ISealedAuction(auction).cancel();
        uint256 returned = payToken.balanceOf(address(this)) - before;
        s.returned = returned;
        emit SealedSaleCancelled(auction, returned);
    }

    // ------------------------------------------------------------------ timelock

    /// @notice Queue a change that must wait `delay` (see `OpKind` for `data`).
    function queue(OpKind kind, bytes calldata data, Auth calldata auth) external nonReentrant returns (uint256 opId) {
        _checkOp(kind, data);
        _quorum(ACTION_QUEUE, keccak256(abi.encode(kind, keccak256(data))), auth);
        opId = ++opCount;
        uint64 eta = uint64(block.timestamp) + delay;
        _ops[opId] = Op({kind: kind, state: OpState.Queued, eta: eta, epoch: setEpoch, data: data});
        emit OpQueued(opId, kind, data, eta, setEpoch);
    }

    /// @notice Anyone may execute a queued change once its delay has passed.
    function execute(uint256 opId) external nonReentrant {
        Op storage op = _ops[opId];
        _requireLive(opId, op);
        if (block.timestamp < op.eta) revert OpNotReady(opId, op.eta);
        if (block.timestamp > uint256(op.eta) + EXECUTION_WINDOW) {
            revert OpLapsed(opId, uint256(op.eta) + EXECUTION_WINDOW);
        }
        op.state = OpState.Executed;
        OpKind kind = op.kind;
        bytes memory data = op.data;

        if (kind == OpKind.SetSigners) {
            (address[] memory members_, uint256 threshold_) = abi.decode(data, (address[], uint256));
            _set.setMembers(members_, threshold_); // checks every member's key now
            uint64 epoch = ++setEpoch;
            emit SignerSetChanged(epoch, members_, threshold_);
        } else if (kind == OpKind.SetDelay) {
            uint64 d = abi.decode(data, (uint64));
            delay = d;
            emit DelayChanged(d);
        } else if (kind == OpKind.SetDailyCap) {
            (address token, uint256 cap) = abi.decode(data, (address, uint256));
            dailyCap[token] = cap;
            emit DailyCapChanged(token, cap);
        } else if (kind == OpKind.SetAuctionFactory) {
            address f = abi.decode(data, (address));
            auctionFactory = f;
            emit AuctionFactoryChanged(f);
        } else {
            (address token, address to, uint256 amount) = abi.decode(data, (address, address, uint256));
            _requireFree(token, amount);
            _send(token, to, amount);
            emit Swept(token, to, amount, true);
        }
        emit OpExecuted(opId, kind);
    }

    /// @notice Any single member may veto a queued change with one signature.
    function veto(uint256 opId, uint256 deadline, address member, bytes calldata signature) external nonReentrant {
        Op storage op = _ops[opId];
        _requireLive(opId, op);
        _set.authorizeAny(ACTION_VETO, keccak256(abi.encode(opId)), deadline, MAX_AUTH_TTL, member, signature);
        op.state = OpState.Vetoed;
        emit OpVetoed(opId, member);
    }

    // ------------------------------------------------------------------ permissionless

    /// @notice Settle the open tender at one clearing price, after its end. Anyone may
    ///         call it: the clearing is deterministic, and the money only goes to the
    ///         sellers the rule picks.
    function settle() external nonReentrant {
        _book.settle(buyDecimals);
    }

    /// @notice Offer `quantity` of the bought-back token at a minimum price tick.
    ///         The tokens are escrowed until the tender ends.
    function offer(uint256 quantity, uint16 tick) external nonReentrant returns (uint32 offerId) {
        offerId = _book.offer(buyToken, quantity, tick);
    }

    /// @notice Settle one offer of a settled or failed tender. Anyone may call it;
    ///         payment and unsold tokens only ever go to the offer's seller.
    function claim(uint256 tenderId, uint32 offerId)
        external
        nonReentrant
        returns (uint256 sold, uint256 paid, uint256 returned)
    {
        return _book.claim(payToken, buyToken, buyDecimals, tenderId, offerId);
    }

    /// @notice Bring a finished sealed sale's proceeds and unsold supply home. Anyone
    ///         may call it: the auction pays only its issuer, this vault.
    /// @dev Someone may already have called the auction's own `claimProceeds` or
    ///      `claimUnsold`; those funds are already here and only the rest is claimed.
    function collectSealedSale(address auction) external nonReentrant {
        Sale storage s = _sales[auction];
        if (s.state != SaleState.Active) revert SaleNotActive(auction, s.state);
        ISealedAuction a = ISealedAuction(auction);
        ISealedAuction.State st = a.state();
        if (st != ISealedAuction.State.Settled && st != ISealedAuction.State.Failed) {
            revert SaleNotFinished(auction, st);
        }
        s.state = SaleState.Collected;

        uint256 buyBefore = buyToken.balanceOf(address(this));
        uint256 payBefore = payToken.balanceOf(address(this));
        if (st == ISealedAuction.State.Settled && !a.proceedsClaimed()) a.claimProceeds();
        if (!a.unsoldClaimed()) a.claimUnsold();
        uint256 proceeds = buyToken.balanceOf(address(this)) - buyBefore;
        uint256 returned = payToken.balanceOf(address(this)) - payBefore;
        s.proceeds = proceeds;
        s.returned = returned;
        emit SealedSaleCollected(auction, st, proceeds, returned);
    }

    // ------------------------------------------------------------------ views

    function members() external view returns (address[] memory) {
        return _set.members;
    }

    function threshold() external view returns (uint256) {
        return _set.threshold;
    }

    function isMember(address account) external view returns (bool) {
        return _set.isMember(account);
    }

    /// @notice The signer set's next nonce. Every quorum action and every veto consumes one.
    function nonce() external view returns (uint256) {
        return _set.nonce;
    }

    /// @notice The exact bytes `member` signs as its share of a quorum for `action`.
    function quorumMessage(address member, bytes32 action, bytes32 argsHash, uint256 deadline)
        external
        view
        returns (bytes memory)
    {
        return _set.quorumMessage(member, action, deadline, argsHash);
    }

    /// @notice The exact bytes `member` signs to veto queued change `opId` alone.
    function vetoMessage(address member, uint256 opId, uint256 deadline) external view returns (bytes memory) {
        return PqAuth.message(
            address(this), member, PqAuthSet.anyAction(ACTION_VETO), _set.nonce, deadline, keccak256(abi.encode(opId))
        );
    }

    /// @notice What `token` can still leave today without the timelock.
    function remainingToday(address token) public view returns (uint256) {
        uint256 cap = dailyCap[token];
        Allowance memory a = _allowance[token];
        uint256 spent = a.day == _today() ? a.spent : 0;
        return cap > spent ? cap - spent : 0;
    }

    function getOp(uint256 opId) external view returns (Op memory) {
        return _ops[opId];
    }

    /// @notice What can be swept, budgeted or sold. `token == address(0)` is native QOR.
    function freeBalance(address token) public view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 locked = 0;
        if (token == address(payToken)) locked += _book.reservedPay;
        if (token == address(buyToken)) locked += _book.escrowedBuy;
        return bal > locked ? bal - locked : 0;
    }

    function tenderCount() external view returns (uint256) {
        return _book.tenderCount;
    }

    function openTenderId() external view returns (uint256) {
        return _book.openTenderId;
    }

    function reservedPay() external view returns (uint256) {
        return _book.reservedPay;
    }

    function escrowedBuy() external view returns (uint256) {
        return _book.escrowedBuy;
    }

    function supplyByTick(uint256 tenderId, uint256 tick) external view returns (uint256) {
        return _book.supplyByTick[tenderId][tick];
    }

    function getTender(uint256 tenderId) external view returns (TenderBook.Tender memory) {
        return _book.getTender(tenderId);
    }

    function getOffer(uint256 tenderId, uint32 offerId) external view returns (TenderBook.Offer memory) {
        return _book.getOffer(tenderId, offerId);
    }

    /// @notice What an offer sells, once its tender is settled.
    function allocationOf(uint256 tenderId, uint32 offerId) external view returns (uint256) {
        return _book.allocationOf(tenderId, offerId);
    }

    function saleCount() external view returns (uint256) {
        return _saleList.length;
    }

    function saleAt(uint256 index) external view returns (address) {
        return _saleList[index];
    }

    function getSale(address auction) external view returns (Sale memory) {
        return _sales[auction];
    }

    // ------------------------------------------------------------------ internals

    function _quorum(bytes32 action, bytes32 argsHash, Auth calldata auth) private {
        _set.authorizeQuorum(action, argsHash, auth.deadline, MAX_AUTH_TTL, auth.signers, auth.signatures);
    }

    function _today() private view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function _spend(address token, uint256 amount) private {
        uint256 remaining = remainingToday(token);
        if (amount > remaining) revert OverDailyCap(token, amount, remaining);
        Allowance storage a = _allowance[token];
        uint64 today = _today();
        uint256 spent = (a.day == today ? a.spent : 0) + amount; // <= cap, so it fits
        a.day = today;
        a.spent = uint192(spent);
        emit Spent(token, amount, spent, dailyCap[token]);
    }

    function _requireFree(address token, uint256 amount) private view {
        uint256 free = freeBalance(token);
        if (amount > free) revert InsufficientFree(token, amount, free);
    }

    function _send(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeSendFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _requireLive(uint256 opId, Op storage op) private view {
        if (op.state == OpState.None) revert NoSuchOp(opId);
        if (op.state != OpState.Queued) revert OpNotQueued(opId, op.state);
        if (op.epoch != setEpoch) revert OpVoid(opId, op.epoch, setEpoch);
    }

    /// @dev Shape checks at queue time, so a malformed change never sits in the queue.
    ///      Member keys are checked again at execution, when they matter.
    function _checkOp(OpKind kind, bytes calldata data) private view {
        if (kind == OpKind.SetSigners) {
            (address[] memory m, uint256 t) = abi.decode(data, (address[], uint256));
            if (m.length == 0 || m.length > PqAuthSet.MAX_MEMBERS) revert BadParams("members");
            if (t == 0 || t > m.length) revert BadParams("threshold");
            for (uint256 i = 0; i < m.length; ++i) {
                if (m[i] == address(0)) revert ZeroAddress();
                if (i > 0 && m[i] <= m[i - 1]) revert BadParams("members order");
                PqAuth.keyOf(m[i]);
            }
        } else if (kind == OpKind.SetDelay) {
            uint64 d = abi.decode(data, (uint64));
            if (d < MIN_DELAY || d > MAX_DELAY) revert BadDelay(d);
        } else if (kind == OpKind.SetDailyCap) {
            (, uint256 cap) = abi.decode(data, (address, uint256)); // any token; 0 = native QOR
            if (cap > type(uint192).max) revert BadParams("cap");
        } else if (kind == OpKind.SetAuctionFactory) {
            abi.decode(data, (address)); // 0 switches sealed sales off
        } else {
            (, address to, uint256 amount) = abi.decode(data, (address, address, uint256));
            if (to == address(0)) revert ZeroAddress();
            if (amount == 0) revert BadQuantity(0);
        }
    }

    function _pullExact(IERC20 token, address from, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert FeeOnTransfer(amount, received);
    }
}

