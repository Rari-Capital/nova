// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import "./DSAuth.sol";

/// @notice A DSAuthority for up to 256 roles.
/// @author DappHub (https://github.com/dapphub/ds-roles)
contract DSRoles is DSAuth, DSAuthority {
    mapping(address => bool) internal _root_users;
    mapping(address => bytes32) internal _user_roles;
    mapping(address => mapping(bytes4 => bytes32)) internal _capability_roles;
    mapping(address => mapping(bytes4 => bool)) internal _public_capabilities;

    /*///////////////////////////////////////////////////////////////
                        USER ROLE GETTER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function isUserRoot(address who) public view returns (bool) {
        return _root_users[who];
    }

    function getUserRoles(address who) public view returns (bytes32) {
        return _user_roles[who];
    }

    function getCapabilityRoles(address code, bytes4 sig) public view returns (bytes32) {
        return _capability_roles[code][sig];
    }

    function isCapabilityPublic(address code, bytes4 sig) public view returns (bool) {
        return _public_capabilities[code][sig];
    }

    function hasUserRole(address who, uint8 role) public view returns (bool) {
        bytes32 roles = getUserRoles(who);
        bytes32 shifted = bytes32(uint256(uint256(2)**uint256(role)));
        return bytes32(0) != roles & shifted;
    }

    function canCall(
        address caller,
        address code,
        bytes4 sig
    ) public view override returns (bool) {
        if (isCapabilityPublic(code, sig) || isUserRoot(caller)) {
            return true;
        } else {
            bytes32 has_roles = getUserRoles(caller);
            bytes32 needs_one_of = getCapabilityRoles(code, sig);
            return bytes32(0) != has_roles & needs_one_of;
        }
    }

    /*///////////////////////////////////////////////////////////////
                         ROLE MODIFIER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setRootUser(address who, bool enabled) external auth {
        _root_users[who] = enabled;
    }

    function setUserRole(
        address who,
        uint8 role,
        bool enabled
    ) public auth {
        bytes32 last_roles = _user_roles[who];
        bytes32 shifted = bytes32(uint256(uint256(2)**uint256(role)));
        if (enabled) {
            _user_roles[who] = last_roles | shifted;
        } else {
            _user_roles[who] = last_roles & BITNOT(shifted);
        }
    }

    function setPublicCapability(
        address code,
        bytes4 sig,
        bool enabled
    ) public auth {
        _public_capabilities[code][sig] = enabled;
    }

    function setRoleCapability(
        uint8 role,
        address code,
        bytes4 sig,
        bool enabled
    ) public auth {
        bytes32 last_roles = _capability_roles[code][sig];
        bytes32 shifted = bytes32(uint256(uint256(2)**uint256(role)));
        if (enabled) {
            _capability_roles[code][sig] = last_roles | shifted;
        } else {
            _capability_roles[code][sig] = last_roles & BITNOT(shifted);
        }
    }

    /*///////////////////////////////////////////////////////////////
                               INTERNAL UTILS
    //////////////////////////////////////////////////////////////*/

    function BITNOT(bytes32 input) internal pure returns (bytes32 output) {
        return (input ^ bytes32(uint256(-1)));
    }
}
