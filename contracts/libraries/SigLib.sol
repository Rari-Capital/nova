// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

/// @notice Utility library used to extract the function signature (first 4 bytes) from abi encoded calldata.
library SigLib {
    /// @notice Extracts the function signature (first 4 bytes) from abi encoded calldata.
    /// @param inputCalldata Abi encoded calldata.
    /// @return sig The function signature/selector/sighash.
    function fromCalldata(bytes memory inputCalldata) internal pure returns (bytes4 sig) {
        assembly {
            // Slices the first 4 bytes and loads them into `sig`.
            sig := mload(add(inputCalldata, 0x20))
        }
    }
}
