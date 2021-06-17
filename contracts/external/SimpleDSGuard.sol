// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "./DSAuth.sol";

/// @notice Permissions whitelist with a reasonable level of granularity.
/// @author Rari Capital + DappHub (https://github.com/dapphub/ds-guard)
contract SimpleDSGuard is DSAuth, DSAuthority {
    event LogPermit(bytes32 indexed src, bytes32 indexed sig);

    event LogForbid(bytes32 indexed src, bytes32 indexed sig);

    bytes4 public constant ANY = 0xffffffff;

    mapping(bytes32 => mapping(bytes4 => bool)) internal acl;

    function canCall(
        address src_,
        address, // We don't care about the destination
        bytes4 sig
    ) external view override returns (bool) {
        bytes32 src = addressToBytes32(src_);

        return acl[ANY][sig] || acl[src][sig] || acl[src][ANY] || acl[ANY][ANY];
    }

    // Internal Utils //

    function addressToBytes32(address src) internal pure returns (bytes32) {
        return bytes32(bytes20(src));
    }

    function permitBytes(bytes32 src, bytes4 sig) internal auth {
        acl[src][sig] = true;
        emit LogPermit(src, sig);
    }

    function forbidBytes(bytes32 src, bytes4 sig) internal auth {
        acl[src][sig] = false;
        emit LogForbid(src, sig);
    }

    // Permit Public API //

    function permit(address src, bytes4 sig) public {
        permitBytes(addressToBytes32(src), sig);
    }

    function permitAnySource(bytes4 sig) external {
        permitBytes(ANY, sig);
    }

    function permitSourceToCallAny(address src) external {
        permit(src, ANY);
    }

    // Forbid Public API //

    function forbid(address src, bytes4 sig) public {
        forbidBytes(addressToBytes32(src), sig);
    }

    function forbidAnySource(bytes4 sig) external {
        forbidBytes(ANY, sig);
    }

    function forbidSourceToCallAny(address src) external {
        forbid(src, ANY);
    }
}
