import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import dotenv from 'dotenv';
import { defineConfig } from 'hardhat/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: resolve(fileURLToPath(new URL('../.env', import.meta.url))) });

const accounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: { sources: './contracts', tests: './test', cache: './cache', artifacts: './artifacts' },
  networks: {
    localhost: {
      type: 'http',
      chainType: 'l1',
      url: process.env.RPC_URL ?? 'http://127.0.0.1:8545',
    },
    ...(process.env.SEPOLIA_RPC_URL
      ? {
          sepolia: {
            type: 'http',
            chainType: 'l1',
            url: process.env.SEPOLIA_RPC_URL,
            accounts,
            chainId: 11155111,
          },
        }
      : {}),
  },
});
