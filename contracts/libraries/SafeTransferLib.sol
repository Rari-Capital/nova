// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

/// @notice Library for safely transferring Ether.
/// @dev This is used as a replacement for payable.transfer().
library SafeTransferLib {
    /// @dev Attempts to transfer ETH and reverts on failure.
    /// @param to The address to receive the ETH.
    /// @param value The amount of wei to send.
    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }
}
