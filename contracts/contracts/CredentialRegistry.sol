// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CredentialRegistry is AccessControl {
    bytes32 public constant INSTITUTION_ADMIN_ROLE = keccak256("INSTITUTION_ADMIN_ROLE");

    struct Institution {
        address administrator;
        bytes32 metadataHash;
        bool verified;
        bool suspended;
    }

    mapping(bytes32 => Institution) public institutions;
    mapping(bytes32 => mapping(address => bool)) public authorizedStaff;

    error InvalidIdentifier();
    error InvalidAddress();
    error InstitutionAlreadyRegistered(bytes32 institutionId);
    error InstitutionNotVerified(bytes32 institutionId);
    error InstitutionSuspended(bytes32 institutionId);

    event InstitutionRegistered(bytes32 indexed institutionId, address indexed administrator, bytes32 metadataHash);
    event InstitutionVerificationChanged(bytes32 indexed institutionId, bool verified);
    event StaffAuthorizationChanged(bytes32 indexed institutionId, address indexed staff, bool authorized);
    event InstitutionMetadataUpdated(bytes32 indexed institutionId, bytes32 metadataHash);
    event InstitutionSuspendedChanged(bytes32 indexed institutionId, bool suspended);

    constructor(address platformAdmin) {
        if (platformAdmin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, platformAdmin);
    }

    function registerInstitution(bytes32 institutionId, bytes32 metadataHash, address administrator) external {
        if (institutionId == bytes32(0)) revert InvalidIdentifier();
        if (metadataHash == bytes32(0) || administrator == address(0)) revert InvalidAddress();
        if (institutions[institutionId].administrator != address(0)) {
            revert InstitutionAlreadyRegistered(institutionId);
        }
        institutions[institutionId] = Institution(administrator, metadataHash, false, false);
        _grantRole(INSTITUTION_ADMIN_ROLE, administrator);
        emit InstitutionRegistered(institutionId, administrator, metadataHash);
    }

    function setInstitutionVerified(bytes32 institutionId, bool verified) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Institution storage institution = _institution(institutionId);
        institution.verified = verified;
        emit InstitutionVerificationChanged(institutionId, verified);
    }

    function setSuspended(bytes32 institutionId, bool suspended) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Institution storage institution = _institution(institutionId);
        institution.suspended = suspended;
        emit InstitutionSuspendedChanged(institutionId, suspended);
    }

    function updateMetadata(bytes32 institutionId, bytes32 metadataHash) external {
        Institution storage institution = _institution(institutionId);
        if (msg.sender != institution.administrator) revert AccessControlUnauthorizedAccount(msg.sender, INSTITUTION_ADMIN_ROLE);
        if (metadataHash == bytes32(0)) revert InvalidIdentifier();
        institution.metadataHash = metadataHash;
        emit InstitutionMetadataUpdated(institutionId, metadataHash);
    }

    function setStaff(bytes32 institutionId, address staff, bool authorized) external {
        Institution storage institution = _institution(institutionId);
        if (msg.sender != institution.administrator) revert AccessControlUnauthorizedAccount(msg.sender, INSTITUTION_ADMIN_ROLE);
        if (staff == address(0)) revert InvalidAddress();
        authorizedStaff[institutionId][staff] = authorized;
        emit StaffAuthorizationChanged(institutionId, staff, authorized);
    }

    function isAuthorizedIssuer(bytes32 institutionId, address account) external view returns (bool) {
        Institution storage institution = institutions[institutionId];
        return institution.verified && !institution.suspended
            && (account == institution.administrator || authorizedStaff[institutionId][account]);
    }

    function institutionStatus(bytes32 institutionId) external view returns (bool exists, bool verified, bool suspended) {
        Institution storage institution = institutions[institutionId];
        return (institution.administrator != address(0), institution.verified, institution.suspended);
    }

    function _institution(bytes32 institutionId) private view returns (Institution storage institution) {
        institution = institutions[institutionId];
        if (institution.administrator == address(0)) revert InvalidIdentifier();
    }
}
