// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

/// @notice Utility library to compute a Nova execHash from a nonce, strategy address, calldata and gas price.
library NovaExecHashLib {
    /// @dev Computes a Nova execHash from a nonce, strategy address, calldata and gas price.
    /// @return A Nova execHash: keccak256(nonce, strategy, l1Calldata, gasPrice)
    function compute(
        uint256 nonce,
        address strategy,
        bytes memory l1Calldata,
        uint256 gasPrice
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(nonce, strategy, l1Calldata, gasPrice));
    }
}
