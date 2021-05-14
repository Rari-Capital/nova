// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.4.23;

import "./DSAuth.sol";

/// @notice Permissions whitelist with a medium level of granularity.
/// @author Rari Capital + DappHub (https://github.com/dapphub/ds-guard)
contract MinimalDSGuard is DSAuth, DSAuthority {
    event LogPermit(bytes32 indexed src, bytes32 indexed sig);

    event LogForbid(bytes32 indexed src, bytes32 indexed sig);

    bytes32 public constant ANY = bytes32(uint256(-1));

    mapping(bytes32 => mapping(bytes32 => bool)) acl;

    function canCall(
        address src_,
        address, // We don't care about the destination
        bytes4 sig
    ) external view override returns (bool) {
        bytes32 src = bytes32(bytes20(src_));

        return acl[src][sig] || acl[src][ANY] || acl[ANY][sig] || acl[ANY][ANY];
    }

    // Permit //

    function permitBytes(bytes32 src, bytes32 sig) public auth {
        acl[src][sig] = true;
        emit LogPermit(src, sig);
    }

    function permit(address src, bytes32 sig) external {
        permitBytes(bytes32(bytes20(src)), sig);
    }

    function permitAnySource(bytes32 sig) external {
        permitBytes(ANY, sig);
    }

    // Forbid //

    function forbidBytes(bytes32 src, bytes32 sig) public auth {
        acl[src][sig] = false;
        emit LogForbid(src, sig);
    }

    function forbid(address src, bytes32 sig) external {
        permitBytes(bytes32(bytes20(src)), sig);
    }

    function forbidAnySource(bytes32 sig) external {
        forbidBytes(ANY, sig);
    }
}
