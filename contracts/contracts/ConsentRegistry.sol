// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ConsentRegistry {
    struct Permission {
        bytes32 patientRef;
        address provider;
        bytes32 recordScope;
        bytes32 categoryScope;
        uint64 expiresAt;
        bool revoked;
    }

    uint256 public permissionCount;
    mapping(uint256 => Permission) public permissions;
    mapping(bytes32 => address) public patientController;

    error InvalidPermission();
    error UnauthorizedPatient(bytes32 patientRef, address caller);
    error PermissionNotFound(uint256 permissionId);

    event PatientControllerRegistered(bytes32 indexed patientRef, address indexed controller);
    event ConsentGranted(uint256 indexed permissionId, bytes32 indexed patientRef, address indexed provider, bytes32 recordScope, bytes32 categoryScope, uint64 expiresAt);
    event ConsentRevoked(uint256 indexed permissionId, address indexed patientController);

    function registerPatientController(bytes32 patientRef, address controller) external {
        if (patientRef == bytes32(0) || controller == address(0)) revert InvalidPermission();
        address current = patientController[patientRef];
        if (current != address(0) && current != msg.sender) revert UnauthorizedPatient(patientRef, msg.sender);
        if (controller != msg.sender) revert UnauthorizedPatient(patientRef, msg.sender);
        patientController[patientRef] = controller;
        emit PatientControllerRegistered(patientRef, controller);
    }

    function grantAccess(
        bytes32 patientRef,
        address provider,
        bytes32 recordScope,
        bytes32 categoryScope,
        uint64 expiresAt
    ) external returns (uint256 permissionId) {
        _requirePatient(patientRef);
        if (provider == address(0) || expiresAt <= block.timestamp || (recordScope == bytes32(0) && categoryScope == bytes32(0))) {
            revert InvalidPermission();
        }
        permissionId = ++permissionCount;
        permissions[permissionId] = Permission(patientRef, provider, recordScope, categoryScope, expiresAt, false);
        emit ConsentGranted(permissionId, patientRef, provider, recordScope, categoryScope, expiresAt);
    }

    function revokeAccess(uint256 permissionId, bytes32 patientRef) external {
        _requirePatient(patientRef);
        Permission storage permission = permissions[permissionId];
        if (permission.expiresAt == 0) revert PermissionNotFound(permissionId);
        if (permission.patientRef != patientRef) revert PermissionNotFound(permissionId);
        permission.revoked = true;
        emit ConsentRevoked(permissionId, msg.sender);
    }

    function hasAccess(uint256 permissionId, bytes32 patientRef, address provider, bytes32 recordId, bytes32 categoryHash)
        external view returns (bool)
    {
        Permission storage permission = permissions[permissionId];
        if (permission.expiresAt == 0 || permission.patientRef != patientRef || permission.revoked || permission.expiresAt <= block.timestamp) return false;
        if (patientController[patientRef] == address(0)) return false;
        if (permission.provider != provider) return false;
        return (permission.recordScope != bytes32(0) && permission.recordScope == recordId)
            || (permission.categoryScope != bytes32(0) && permission.categoryScope == categoryHash);
    }

    function _requirePatient(bytes32 patientRef) private view {
        if (patientController[patientRef] != msg.sender) revert UnauthorizedPatient(patientRef, msg.sender);
    }
}
