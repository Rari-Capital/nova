// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract L1_NovaApprovalEscrow {
    /// @notice The address who is authorized to transfer tokens from the approval escrow.
    /// @dev Initializing it as msg.sender here is equivalent setting it in the constructor.
    address public immutable ESCROW_ADMIN = msg.sender;

    /// @notice Transfers a token approved to the escrow.
    /// @notice Only the escrow admin can call this function.
    /// @param token The token to transfer.
    /// @param amount The amount of the token to transfer.
    /// @param sender The user who approved the token to the escrow.
    /// @param recipient The address to transfer the approved tokens to.
    /// @return A bool indicating if the transfer succeeded or not.
    function transferApprovedToken(
        address token,
        uint256 amount,
        address sender,
        address recipient
    ) external returns (bool) {
        // Ensure the caller is the escrow admin.
        require(ESCROW_ADMIN == msg.sender, "UNAUTHORIZED");

        // Transfer tokens from the sender to the recipient.
        (bool success, bytes memory returnData) =
            address(token).call(
                abi.encodeWithSelector(
                    // The token to transfer:
                    IERC20(token).transferFrom.selector,
                    // The address who approved tokens to the escrow:
                    sender,
                    // The address who should receive the tokens:
                    recipient,
                    // The amount of tokens to transfer to the recipient:
                    amount
                )
            );

        if (!success) {
            // If it reverted, return false
            // to indicate the transfer failed.
            return false;
        }

        if (returnData.length > 0) {
            // An abi-encoded bool takes up 32 bytes.
            if (returnData.length == 32) {
                // Return false to indicate failure if
                // the return data was not a positive bool.
                return abi.decode(returnData, (bool));
            } else {
                // It returned some data that was not a bool,
                // return false to indicate the transfer failed.
                return false;
            }
        }

        // If there was no failure,
        // return true to indicate success.
        return true;
    }
}
