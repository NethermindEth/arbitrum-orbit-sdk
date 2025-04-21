import { createPublicClient, http, Address, createWalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import {
  prepareChainConfig,
  createRollupPrepareDeploymentParamsConfig,
  createRollupPrepareTransactionRequest,
  createRollupPrepareTransactionReceipt,
  setValidKeysetPrepareTransactionRequest,
} from '@arbitrum/orbit-sdk';
import { sanitizePrivateKey, generateChainId } from '@arbitrum/orbit-sdk/utils';
import { config } from 'dotenv';
config();

function withFallbackPrivateKey(privateKey: string | undefined): `0x${string}` {
  if (typeof privateKey === 'undefined' || privateKey === '') {
    return generatePrivateKey();
  }

  return sanitizePrivateKey(privateKey);
}

if (typeof process.env.DEPLOYER_PRIVATE_KEY === 'undefined') {
  throw new Error(`Please provide the "DEPLOYER_PRIVATE_KEY" environment variable`);
}

if (typeof process.env.CUSTOM_FEE_TOKEN_ADDRESS === 'undefined') {
  throw new Error(`Please provide the "CUSTOM_FEE_TOKEN_ADDRESS" environment variable`);
}

if (typeof process.env.PARENT_CHAIN_RPC === 'undefined' || process.env.PARENT_CHAIN_RPC === '') {
  console.warn(
    `Warning: you may encounter timeout errors while running the script with the default rpc endpoint. Please provide the "PARENT_CHAIN_RPC" environment variable instead.`,
  );
}

// load or generate a random batch poster account
const batchPosterPrivateKey = withFallbackPrivateKey(process.env.BATCH_POSTER_PRIVATE_KEY);
const batchPoster = privateKeyToAccount(batchPosterPrivateKey).address;

// load or generate a random validator account
const validatorPrivateKey = withFallbackPrivateKey(process.env.VALIDATOR_PRIVATE_KEY);
const validator = privateKeyToAccount(validatorPrivateKey).address;

// set the parent chain and create a public client for it
const parentChain = arbitrumSepolia;
const parentChainPublicClient = createPublicClient({
  chain: parentChain,
  transport: http(process.env.PARENT_CHAIN_RPC),
});

// load the deployer account
const deployer = privateKeyToAccount(sanitizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY));

// create a wallet client for signing transactions
const walletClient = createWalletClient({
  account: deployer,
  chain: parentChain,
  transport: http(process.env.PARENT_CHAIN_RPC),
});

async function main() {
  // generate a random chain id
  const chainId = generateChainId();
  // set the custom fee token
  const nativeToken: Address = process.env.CUSTOM_FEE_TOKEN_ADDRESS as `0x${string}`;

  const createRollupConfig = createRollupPrepareDeploymentParamsConfig(parentChainPublicClient, {
    chainId: BigInt(chainId),
    owner: deployer.address,
    chainConfig: prepareChainConfig({
      chainId,
      arbitrum: {
        InitialChainOwner: deployer.address,
        DataAvailabilityCommittee: true,
      },
    }),
  });

  let request;
  let parentChainId;

  try {
    // Prepare the transaction request
    const txRequest = await createRollupPrepareTransactionRequest({
      params: {
        config: createRollupConfig,
        batchPosters: [batchPoster],
        validators: [validator],
        nativeToken,
      },
      account: deployer.address,
      publicClient: parentChainPublicClient,
    });
    
    parentChainId = txRequest.chainId;
    console.log('Transaction request prepared successfully');
    console.log('Parent Chain ID:', parentChainId);
    
    // Sign and send the transaction
    console.log(`Creating rollup...`);
    const txHash = await walletClient.sendTransaction(txRequest);
    
    // Wait for the transaction to be mined
    console.log(`Transaction sent. Waiting for confirmation...`);
    const receipt = await parentChainPublicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`Transaction confirmed: ${receipt.transactionHash}`);
    
    // Get the core contracts from the receipt
    const txReceipt = createRollupPrepareTransactionReceipt(receipt);
    const coreContracts = txReceipt.getCoreContracts();
    console.log('Core contracts:', coreContracts);
    
    // Log the rollup address for future reference
    console.log(`Rollup address: ${coreContracts.rollup}`);
    console.log(`Inbox address: ${coreContracts.inbox}`);
    
  } catch (error) {
    console.error(`Rollup creation failed with error: ${error}`);
  }

  try {
    const keyset = "0x000000000000000100000000000000010121600e6aaa4020e004ce635a088fff55a10e2e53cdb6bff78b48b37e7d3ab93c8167e4c719a123cd051726132b3c35b113380606924fddcb816562ae7616fc7f3f310cc65a605b687157340647613f449471434a86fd528b1b68dccd91ab18ee7eb116db8475834d9c7577b034db754bfdd69f3b4f4e37599b9691fba1bf973777e49ed7b01fa6bbc06f41db6e8d85268a7b01912b627c19bb9baac20cd13fca76d08a9783b54c2c50fb8f513760114cd0b73161c2aaa8042e7dc5d5406720e31cde018fa7068a474ba985d6b9690cfd3cd3b88b1b9cb680b59ef089eddbc2fa875d0b01457688b3d7b7eabe4fb4018a812c03e19e84c802f5b12d619715a8ac920831510636a641417adf8650f697bbe10457d5bd06ca261b4194efa9fc5b42eaaa";
    const txRequest = await setValidKeysetPrepareTransactionRequest({
      coreContracts: {
      upgradeExecutor: '0x15b5BDf7a5e0305B9a4bE413383C9b1500C8FCF2',
      sequencerInbox: '0x6c97864CE4bEf387dE0b3310A44230f7E3F1be0D',
      },
      keyset,
      account: deployer.address,
      publicClient: parentChainPublicClient,
    });
  } catch (error) {
    
  }

}

main();
