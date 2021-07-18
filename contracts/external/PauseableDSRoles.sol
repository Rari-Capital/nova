// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@rari-capital/dappsys/src/DSRoles.sol";

/// @notice DSRoles contract with an additional pause capability to quickly shutdown all interactions to the contract.
contract PauseableDSRoles is DSRoles {
    /// @notice Bool which indicates whether the contract is in a paused state or not.
    bool public isPaused = false;

    /*///////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    event Paused();
    event Resumed();

    /*///////////////////////////////////////////////////////////////
                         STATE MUTATING FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Pause all interactions with this contract.
    /// @dev Must be authorized to call this function.
    function pause() external auth {
        isPaused = true;
        emit Paused();
    }

    /// @notice Resume all interactions with this contract.
    /// @dev Must be authorized to call this function.
    function resume() external auth {
        isPaused = false;
        emit Resumed();
    }

    /*///////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function canCall(
        address caller,
        address code,
        bytes4 sig
    ) public view override returns (bool) {
        if (isPaused) {
            // No one can call the DSAuth
            // contract if a pause is active.
            return false;
        }

        return super.canCall(caller, code, sig);
    }
}
