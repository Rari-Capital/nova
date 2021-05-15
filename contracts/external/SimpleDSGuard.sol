// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.4.23;

import "./DSAuth.sol";

/// @notice Permissions whitelist with a reasonable level of granularity.
/// @author Rari Capital + DappHub (https://github.com/dapphub/ds-guard)
contract SimpleDSGuard is DSAuth, DSAuthority {
    event LogPermit(bytes32 indexed src, bytes32 indexed sig);

    event LogForbid(bytes32 indexed src, bytes32 indexed sig);

    bytes4 public constant ANY = 0xffffffff;

    mapping(bytes32 => mapping(bytes4 => bool)) acl;

    function canCall(
        address src_,
        address, // We don't care about the destination
        bytes4 sig
    ) external view override returns (bool) {
        bytes32 src = bytes32(bytes20(src_));

        return acl[ANY][sig] || acl[src][sig] || acl[src][ANY] || acl[ANY][ANY];
    }

    // Permit //

    function permitBytes(bytes32 src, bytes4 sig) public auth {
        acl[src][sig] = true;
        emit LogPermit(src, sig);
    }

    function permit(address src, bytes4 sig) public {
        permitBytes(bytes32(bytes20(src)), sig);
    }

    function permitAnySource(bytes4 sig) external {
        permitBytes(ANY, sig);
    }

    function permitSourceToCallAny(address src) external {
        permit(src, ANY);
    }

    // Forbid //

    function forbidBytes(bytes32 src, bytes4 sig) public auth {
        acl[src][sig] = false;
        emit LogForbid(src, sig);
    }

    function forbid(address src, bytes4 sig) public {
        forbidBytes(bytes32(bytes20(src)), sig);
    }

    function forbidAnySource(bytes4 sig) external {
        forbidBytes(ANY, sig);
    }

    function forbidSourceToCallAny(address src) external {
        forbid(src, ANY);
    }
}
