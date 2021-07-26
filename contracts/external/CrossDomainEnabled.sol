// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import {iOVM_CrossDomainMessenger} from "@eth-optimism/contracts/iOVM/bridge/messaging/iOVM_CrossDomainMessenger.sol";

/// @notice Helper contract for contracts performing cross-domain communications.
/// @author Modified from OptimismPBC (https://github.com/ethereum-optimism/optimism)
contract CrossDomainEnabled {
    /// @notice Messenger contract used to send and receive messages from the other domain.
    iOVM_CrossDomainMessenger public immutable xDomainMessenger;

    /// @param _xDomainMessenger Address of the CrossDomainMessenger on the current layer.
    constructor(iOVM_CrossDomainMessenger _xDomainMessenger) {
        xDomainMessenger = _xDomainMessenger;
    }

    /// @dev Enforces that the modified function is only callable by a specific cross-domain account.
    /// @param sourceDomainAccount The only account on the originating domain which is authenticated to call this function.
    modifier onlyFromCrossDomainAccount(address sourceDomainAccount) {
        require(msg.sender == address(xDomainMessenger), "NOT_CROSS_DOMAIN_MESSENGER");

        require(xDomainMessenger.xDomainMessageSender() == sourceDomainAccount, "WRONG_CROSS_DOMAIN_SENDER");

        _;
    }
}
