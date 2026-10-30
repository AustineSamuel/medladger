import { network } from 'hardhat';

const { ethers, networkName } = await network.create();
const [deployer] = await ethers.getSigners();
const admin = process.env.PLATFORM_ADMIN_ADDRESS || deployer.address;
const CredentialRegistry = await ethers.getContractFactory('CredentialRegistry');
const credentials = await CredentialRegistry.deploy(admin);
await credentials.waitForDeployment();

const MedicalRecordRegistry = await ethers.getContractFactory('MedicalRecordRegistry');
const records = await MedicalRecordRegistry.deploy(admin, await credentials.getAddress());
await records.waitForDeployment();

const ConsentRegistry = await ethers.getContractFactory('ConsentRegistry');
const consent = await ConsentRegistry.deploy();
await consent.waitForDeployment();

console.log(JSON.stringify({
  network: networkName,
  chainId: (await ethers.provider.getNetwork()).chainId.toString(),
  deployer: deployer.address,
  platformAdmin: admin,
  credentialRegistry: await credentials.getAddress(),
  medicalRecordRegistry: await records.getAddress(),
  consentRegistry: await consent.getAddress(),
}, null, 2));
