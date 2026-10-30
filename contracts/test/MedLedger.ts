import { expect } from 'chai';
import hre from 'hardhat';
import { describe, it } from 'mocha';
import {
  ConsentRegistry__factory,
  CredentialRegistry__factory,
  MedicalRecordRegistry__factory,
} from '../typechain-types/index.js';

const { ethers } = await hre.network.create();

describe('MedLedger registries', () => {
  async function deploy() {
    const [admin, institutionAdmin, staff, patient, provider, outsider] = await ethers.getSigners();
    const credentials = await new CredentialRegistry__factory(admin).deploy(admin.address);
    const records = await new MedicalRecordRegistry__factory(admin).deploy(admin.address, await credentials.getAddress());
    const consent = await new ConsentRegistry__factory(patient).deploy();
    const institutionId = ethers.id('institution-random-id');
    await credentials.connect(institutionAdmin).registerInstitution(institutionId, ethers.id('metadata'), institutionAdmin.address);
    return { admin, institutionAdmin, staff, patient, provider, outsider, credentials, records, consent, institutionId };
  }

  it('requires platform verification before an institution can issue records', async () => {
    const { admin, institutionAdmin, records, patient, institutionId, credentials } = await deploy();
    await expect(records.connect(institutionAdmin).issueRecord(ethers.id('pseudonymous-patient'), institutionId, ethers.id('file'), ethers.id('category'), 0))
      .to.be.revertedWithCustomError(records, 'UnauthorizedIssuer');
    await credentials.connect(admin).setInstitutionVerified(institutionId, true);
    await records.connect(institutionAdmin).issueRecord(ethers.id('pseudonymous-patient'), institutionId, ethers.id('file'), ethers.id('category'), 0);
    expect(await records.recordCount()).to.equal(1);
    void patient;
    void credentials;
  });

  it('authorizes institution staff only after platform verification', async () => {
    const { admin, institutionAdmin, staff, credentials, records, institutionId } = await deploy();
    await credentials.connect(institutionAdmin).setStaff(institutionId, staff.address, true);
    expect(await credentials.isAuthorizedIssuer(institutionId, staff.address)).to.equal(false);
    await credentials.connect(admin).setInstitutionVerified(institutionId, true);
    expect(await credentials.isAuthorizedIssuer(institutionId, staff.address)).to.equal(true);
    await credentials.connect(admin).setSuspended(institutionId, true);
    expect(await credentials.isAuthorizedIssuer(institutionId, staff.address)).to.equal(false);
    await expect(records.connect(staff).issueRecord(
      ethers.id('patient-ref'), institutionId, ethers.id('record-hash'), ethers.id('category'), 0,
    )).to.be.revertedWithCustomError(records, 'UnauthorizedIssuer');
  });

  it('detects changed document bytes and preserves supersession history', async () => {
    const { admin, institutionAdmin, records, institutionId, credentials } = await deploy();
    await credentials.connect(admin).setInstitutionVerified(institutionId, true);
    const patientRef = ethers.id('patient-ref-random');
    const originalHash = ethers.id('original-document');
    await records.connect(institutionAdmin).issueRecord(patientRef, institutionId, originalHash, ethers.id('category'), 0);
    expect(await records.isRecordHash(1, originalHash)).to.equal(true);
    expect(await records.isRecordHash(1, ethers.id('changed-document'))).to.equal(false);
    await records.connect(institutionAdmin).issueRecord(patientRef, institutionId, ethers.id('corrected-document'), ethers.id('category'), 1);
    const second = await records.records(2);
    expect(second.supersedes).to.equal(1);
  });

  it('supports patient consent grant, expiry, and revocation', async () => {
    const { patient, provider, outsider, consent } = await deploy();
    const patientRef = ethers.id('private-random-patient-reference');
    const category = ethers.id('lab');
    await consent.connect(patient).registerPatientController(patientRef, patient.address);
    const expiresAt = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 3600);
    await consent.connect(patient).grantAccess(patientRef, provider.address, ethers.ZeroHash, category, expiresAt);
    expect(await consent.hasAccess(1, patientRef, provider.address, ethers.id('record'), category)).to.equal(true);
    expect(await consent.hasAccess(1, patientRef, outsider.address, ethers.id('record'), category)).to.equal(false);
    await consent.connect(patient).revokeAccess(1, patientRef);
    expect(await consent.hasAccess(1, patientRef, provider.address, ethers.id('record'), category)).to.equal(false);
  });

  it('prevents a different patient from revoking another patient permission', async () => {
    const { patient, provider, outsider, consent } = await deploy();
    const patientRef = ethers.id('random-patient-one');
    const otherPatientRef = ethers.id('random-patient-two');
    await consent.connect(patient).registerPatientController(patientRef, patient.address);
    await consent.connect(outsider).registerPatientController(otherPatientRef, outsider.address);
    const expiresAt = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 3600);
    await consent.connect(patient).grantAccess(patientRef, provider.address, ethers.id('record'), ethers.ZeroHash, expiresAt);
    await expect(consent.connect(outsider).revokeAccess(1, otherPatientRef))
      .to.be.revertedWithCustomError(consent, 'PermissionNotFound');
    expect(await consent.hasAccess(1, otherPatientRef, provider.address, ethers.id('record'), ethers.id('category'))).to.equal(false);
  });

  it('denies access after a consent grant expires', async () => {
    const { patient, provider, consent } = await deploy();
    const patientRef = ethers.id('expiring-patient-ref');
    await consent.connect(patient).registerPatientController(patientRef, patient.address);
    const expiresAt = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 60);
    await consent.connect(patient).grantAccess(patientRef, provider.address, ethers.id('record'), ethers.ZeroHash, expiresAt);
    await ethers.provider.send('evm_increaseTime', [61]);
    await ethers.provider.send('evm_mine', []);
    expect(await consent.hasAccess(1, patientRef, provider.address, ethers.id('record'), ethers.id('category'))).to.equal(false);
  });
});
