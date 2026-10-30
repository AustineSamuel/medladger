// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {CredentialRegistry} from "./CredentialRegistry.sol";

contract MedicalRecordRegistry is AccessControl {
    bytes32 public constant RECORD_OPERATOR_ROLE = keccak256("RECORD_OPERATOR_ROLE");

    struct RecordCommitment {
        bytes32 patientRef;
        bytes32 institutionId;
        bytes32 contentHash;
        bytes32 categoryHash;
        uint64 issuedAt;
        uint256 supersedes;
    }

    CredentialRegistry public immutable credentials;
    uint256 public recordCount;
    mapping(uint256 => RecordCommitment) public records;
    mapping(bytes32 => uint256) public recordIdByHash;

    error InvalidRecord();
    error UnauthorizedIssuer(bytes32 institutionId, address issuer);
    error RecordAlreadyRegistered(bytes32 contentHash);
    error RecordNotFound(uint256 recordId);

    event RecordIssued(uint256 indexed recordId, bytes32 indexed patientRef, bytes32 indexed institutionId, bytes32 contentHash, uint256 supersedes);
    event RecordVerified(uint256 indexed recordId, bool matches);
    event RecordSuperseded(uint256 indexed previousRecordId, uint256 indexed replacementRecordId);

    constructor(address platformAdmin, address credentialRegistry) {
        if (platformAdmin == address(0) || credentialRegistry == address(0)) revert InvalidRecord();
        _grantRole(DEFAULT_ADMIN_ROLE, platformAdmin);
        credentials = CredentialRegistry(credentialRegistry);
    }

    function issueRecord(
        bytes32 patientRef,
        bytes32 institutionId,
        bytes32 contentHash,
        bytes32 categoryHash,
        uint256 supersedes
    ) external returns (uint256 recordId) {
        if (patientRef == bytes32(0) || contentHash == bytes32(0) || categoryHash == bytes32(0)) revert InvalidRecord();
        if (!credentials.isAuthorizedIssuer(institutionId, msg.sender)) {
            revert UnauthorizedIssuer(institutionId, msg.sender);
        }
        bytes32 commitmentKey = keccak256(abi.encode(patientRef, institutionId, contentHash));
        if (recordIdByHash[commitmentKey] != 0) revert RecordAlreadyRegistered(contentHash);
        if (supersedes != 0 && records[supersedes].issuedAt == 0) revert RecordNotFound(supersedes);

        recordId = ++recordCount;
        records[recordId] = RecordCommitment(
            patientRef, institutionId, contentHash, categoryHash, uint64(block.timestamp), supersedes
        );
        recordIdByHash[commitmentKey] = recordId;
        emit RecordIssued(recordId, patientRef, institutionId, contentHash, supersedes);
        if (supersedes != 0) emit RecordSuperseded(supersedes, recordId);
    }

    function verifyRecord(uint256 recordId, bytes32 candidateHash) external returns (bool matches) {
        RecordCommitment storage record = records[recordId];
        if (record.issuedAt == 0) revert RecordNotFound(recordId);
        matches = record.contentHash == candidateHash;
        emit RecordVerified(recordId, matches);
    }

    function isRecordHash(uint256 recordId, bytes32 candidateHash) external view returns (bool) {
        RecordCommitment storage record = records[recordId];
        if (record.issuedAt == 0) revert RecordNotFound(recordId);
        return record.contentHash == candidateHash;
    }
}
