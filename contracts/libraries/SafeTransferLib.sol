// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

/// @notice Utility library to transfer ETH safely.
/// @dev We cannot use the payable.transfer() function on Optimism as calling another
/// account on Optimism consumes more gas than stipend payable.transfer() enforces.
library SafeTransferLib {
    /// @notice Transfers ETH safely and reverts if the transfer fails.
    /// @param to The address to receive the ETH.
    /// @param value The amount of wei to send.
    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }
}
