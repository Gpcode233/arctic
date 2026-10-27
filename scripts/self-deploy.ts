import fs from 'fs';

import {
  initiateDeveloperControlledWalletsClient,
  type Blockchain,
  type CircleDeveloperControlledWalletsClient,
  type TestnetBlockchain,
} from '@circle-fin/developer-controlled-wallets';
import {
  initiateSmartContractPlatformClient,
  type Blockchain as ScpBlockchain,
  type CircleSmartContractPlatformClient,
} from '@circle-fin/smart-contract-platform';

const DEFAULT_CHAIN = 'ARC-TESTNET';

const WORK_DIR = '/home/user/app';
const CONTRACTS_ROOT_DIR = `${WORK_DIR}/contracts`;
const CONTRACT_SOURCES_DIR = CONTRACTS_ROOT_DIR;
const FOUNDRY_OUT_DIR = `${CONTRACTS_ROOT_DIR}/out`;
const CONTRACT_METADATA_DIR = `${CONTRACTS_ROOT_DIR}/contract-metadata`;

const ONCHAIN_FACTS_PATH = `${WORK_DIR}/src/onchain-facts.ts`;
const ONCHAIN_FACTS_IMPORT: string = '@/onchain-facts';

interface ChainFact {
  chainId: number;
  name: string;
  isTestnet: boolean;
  explorerBase: string;
  nativeCurrency: { symbol: string; decimals: number; isUsdc: boolean };
  usdc?: { symbol: string; address: string; decimals: number };
  scpBlockchain?: string;
}

interface OnchainFactsModule {
  ONCHAIN_CHAINS: readonly ChainFact[];
  requireChainByScpBlockchain(blockchain: string): ChainFact;
}

async function loadOnchainFacts(): Promise<OnchainFactsModule> {
  if (!fs.existsSync(ONCHAIN_FACTS_PATH)) {
    throw new Error(
      `Onchain facts module not found at ${ONCHAIN_FACTS_PATH}. Arc Studio injects that file into the sandbox, ` +
        'and this script reads every chain fact from it, so the deploy cannot pick a chain without it. ' +
        'The facts module was not injected into this sandbox. Send one more chat message to trigger the ' +
        'injection, then run this script again. Do not write the file by hand: Arc Studio generates it.',
    );
  }

  return (await import(ONCHAIN_FACTS_IMPORT)) as OnchainFactsModule;
}

function listSupportedChains(facts: OnchainFactsModule): string[] {
  return facts.ONCHAIN_CHAINS.flatMap((chain) => (chain.isTestnet && chain.scpBlockchain ? [chain.scpBlockchain] : []));
}

function defaultFoundryArtifactPath(contractName: string): string {
  return `${FOUNDRY_OUT_DIR}/${contractName}.sol/${contractName}.json`;
}
const FUNDING_WAIT_MS = 2_000;
const FUNDING_WAIT_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 90;

interface CliOptions {
  name: string;
  constructorArgs: unknown[];
  artifactPath: string;
  chain: string;
  walletId?: string;
  walletAddress?: string;
  skipFunding: boolean;
}

interface CompiledArtifact {
  abi: unknown[];
  bytecode: string;
}

interface DeploymentEntry {
  chain: string;
  address: string;
  explorerUrl: string;
  txHash?: string;
  deployedAt: string;
}

interface ContractMetadata {
  contractAddress: string;
  network: string;
  deployerWalletId: string;
  deployerAddress?: string;
  contract_code_path: string;
  contract_compiled_code_path: string;
  contract_network_and_links: Record<string, string>;
  contract_deployments: DeploymentEntry[];
}

function usage(supportedChains: string[]): string {
  return [
    'Usage:',
    '  bun run deploy:self <ContractName> [constructorArgsJson] [--chain <blockchain>] [--artifact <path>] [--wallet-id <id>] [--wallet-address <address>] [--skip-funding]',
    '',
    `  --chain <blockchain>  Circle SDK chain enum. Default ${DEFAULT_CHAIN}. One of: ${supportedChains.join(', ')}`,
    '',
    'Environment variables:',
    '  CIRCLE_DEVELOPER_CONTROLLED_API_KEY or CIRCLE_API_KEY or CIRCLE_SCP_API_KEY',
    '  CIRCLE_ENTITY_SECRET or ENTITY_SECRET or CIRCLE_SCP_ENTITY_SECRET',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function stringifyForLog(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try { return JSON.stringify(value) ?? ''; } catch { return '[unserializable]'; }
}

function sanitizeForLog(value: unknown): string {
  return stringifyForLog(value)
    .replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, '[redacted]')
    .replace(/(api[_-]?key|secret|token|entity[_-]?secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function requireEnv(names: string[]): string {
  for (const name of names) {
    const value = coerceString(process.env[name]);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`);
}

function requireArgValue(flag: string, argv: string[], index: number): { value: string; nextIndex: number } {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return { value, nextIndex: index + 1 };
}

function validateContractName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Contract name must be a valid Solidity identifier.');
  return name;
}

function validateChain(value: string, supportedChains: string[]): string {
  const chain = value.toUpperCase();
  if (!supportedChains.includes(chain)) throw new Error(`Unsupported --chain "${value}". Expected one of: ${supportedChains.join(', ')}.`);
  return chain;
}

function assertNumbersSurviveJsonParse(value: unknown, path: string): void {
  if (Array.isArray(value)) { value.forEach((entry, index) => assertNumbersSurviveJsonParse(entry, `${path}[${index}]`)); return; }
  if (isRecord(value)) { for (const [key, entry] of Object.entries(value)) assertNumbersSurviveJsonParse(entry, `${path}.${key}`); return; }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error(`Constructor arg ${path} (${value}) is not an exact integer. Pass large integers as decimal strings.`);
}

function parseConstructorArgs(raw: string | undefined): unknown[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (error: unknown) { throw new Error(`Constructor args must be a JSON array: ${error instanceof Error ? error.message : String(error)}`); }
  if (!Array.isArray(parsed)) throw new Error('Constructor args must be a JSON array.');
  assertNumbersSurviveJsonParse(parsed, 'args');
  return parsed;
}

function parseArgs(argv: string[], supportedChains: string[]): CliOptions {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(usage(supportedChains));
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const positional: string[] = [];
  let artifactPath: string | undefined;
  let chain: string = DEFAULT_CHAIN;
  let walletId: string | undefined;
  let walletAddress: string | undefined;
  let skipFunding = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--skip-funding') { skipFunding = true; continue; }
    if (arg.startsWith('--artifact=')) { artifactPath = arg.slice('--artifact='.length); continue; }
    if (arg === '--artifact') { const r = requireArgValue(arg, argv, index); artifactPath = r.value; index = r.nextIndex; continue; }
    if (arg.startsWith('--chain=')) { chain = validateChain(arg.slice('--chain='.length), supportedChains); continue; }
    if (arg === '--chain') { const r = requireArgValue(arg, argv, index); chain = validateChain(r.value, supportedChains); index = r.nextIndex; continue; }
    if (arg.startsWith('--wallet-id=')) { walletId = arg.slice('--wallet-id='.length); continue; }
    if (arg === '--wallet-id') { const r = requireArgValue(arg, argv, index); walletId = r.value; index = r.nextIndex; continue; }
    if (arg.startsWith('--wallet-address=')) { walletAddress = arg.slice('--wallet-address='.length); continue; }
    if (arg === '--wallet-address') { const r = requireArgValue(arg, argv, index); walletAddress = r.value; index = r.nextIndex; continue; }
    if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    positional.push(arg);
  }

  if (positional.length === 0) throw new Error('Contract name is required.');
  if (positional.length > 2) throw new Error('Too many positional arguments.');
  if (walletId && !skipFunding && !walletAddress) throw new Error('--wallet-address is required when reusing a wallet without --skip-funding.');

  const name = validateContractName(positional[0]);
  const constructorArgs = parseConstructorArgs(positional[1]);

  return { name, constructorArgs, artifactPath: artifactPath ?? defaultFoundryArtifactPath(name), chain, ...(walletId ? { walletId } : {}), ...(walletAddress ? { walletAddress } : {}), skipFunding };
}

function readCompiledArtifact(artifactPath: string): CompiledArtifact {
  let raw: string;
  try { raw = fs.readFileSync(artifactPath, 'utf8'); } catch (error: unknown) { throw new Error(`Failed to read compiled artifact at "${artifactPath}": ${error instanceof Error ? error.message : String(error)}`); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (error: unknown) { throw new Error(`Compiled artifact at "${artifactPath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (!isRecord(parsed) || !Array.isArray(parsed.abi)) throw new Error(`Compiled artifact at "${artifactPath}" must contain an "abi" array.`);
  const rawBytecode = isRecord(parsed.bytecode) ? parsed.bytecode.object : parsed.bytecode;
  if (typeof rawBytecode !== 'string' || !/^0x[0-9a-fA-F]+$/.test(rawBytecode)) throw new Error(`Compiled artifact at "${artifactPath}" has invalid bytecode.`);
  return { abi: parsed.abi as unknown[], bytecode: rawBytecode };
}

function coerceNetworkLinks(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const links: Record<string, string> = {};
  for (const [network, link] of Object.entries(value)) { if (typeof link === 'string' && link.trim().length > 0) links[network] = link; }
  return links;
}

function coerceDeployments(value: unknown): DeploymentEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is DeploymentEntry => isRecord(entry) && typeof entry.chain === 'string' && typeof entry.address === 'string' && typeof entry.explorerUrl === 'string' && typeof entry.deployedAt === 'string');
}

function readExistingMetadata(metadataPath: string): Partial<ContractMetadata> {
  if (!fs.existsSync(metadataPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as unknown;
    if (!isRecord(parsed)) return {};
    return {
      contractAddress: typeof parsed.contractAddress === 'string' ? parsed.contractAddress : undefined,
      network: typeof parsed.network === 'string' ? parsed.network : undefined,
      deployerWalletId: typeof parsed.deployerWalletId === 'string' ? parsed.deployerWalletId : undefined,
      deployerAddress: typeof parsed.deployerAddress === 'string' ? parsed.deployerAddress : undefined,
      contract_code_path: typeof parsed.contract_code_path === 'string' ? parsed.contract_code_path : undefined,
      contract_compiled_code_path: typeof parsed.contract_compiled_code_path === 'string' ? parsed.contract_compiled_code_path : undefined,
      contract_network_and_links: coerceNetworkLinks(parsed.contract_network_and_links),
      contract_deployments: coerceDeployments(parsed.contract_deployments),
    };
  } catch { return {}; }
}

function upsertContractMetadata(input: { name: string; chain: string; displayName: string; artifactPath: string; contractAddress: string; explorerUrl: string; txHash?: string; deployerWalletId: string; deployerAddress?: string; }): { metadataPath: string; metadata: ContractMetadata } {
  const metadataPath = `${CONTRACT_METADATA_DIR}/${input.name}.json`;
  const existing = readExistingMetadata(metadataPath);
  fs.mkdirSync(CONTRACT_METADATA_DIR, { recursive: true });
  const entry: DeploymentEntry = { chain: input.displayName, address: input.contractAddress, explorerUrl: input.explorerUrl, ...(input.txHash ? { txHash: input.txHash } : {}), deployedAt: new Date().toISOString() };
  const metadata: ContractMetadata = {
    contractAddress: input.contractAddress,
    network: input.chain,
    deployerWalletId: input.deployerWalletId,
    ...(input.deployerAddress ? { deployerAddress: input.deployerAddress } : {}),
    contract_code_path: existing.contract_code_path ?? `${CONTRACT_SOURCES_DIR}/${input.name}.sol`,
    contract_compiled_code_path: input.artifactPath,
    contract_network_and_links: { ...(existing.contract_network_and_links ?? {}), [input.displayName]: input.explorerUrl },
    contract_deployments: [entry, ...(existing.contract_deployments ?? [])],
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { metadataPath, metadata };
}

function createCircleClients(): { walletsClient: CircleDeveloperControlledWalletsClient; scpClient: CircleSmartContractPlatformClient } {
  const apiKey = requireEnv(['CIRCLE_DEVELOPER_CONTROLLED_API_KEY', 'CIRCLE_API_KEY', 'CIRCLE_SCP_API_KEY']);
  const entitySecret = requireEnv(['CIRCLE_ENTITY_SECRET', 'ENTITY_SECRET', 'CIRCLE_SCP_ENTITY_SECRET']);
  return { walletsClient: initiateDeveloperControlledWalletsClient({ apiKey, entitySecret }), scpClient: initiateSmartContractPlatformClient({ apiKey, entitySecret }) };
}

async function createDeploymentWallet(walletsClient: CircleDeveloperControlledWalletsClient, chain: string): Promise<{ walletSetId: string; walletId: string; walletAddress: string }> {
  const walletSetRes = await walletsClient.createWalletSet({ name: `studio-self-deploy-${Date.now()}` });
  const walletSetId = walletSetRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Circle did not return a wallet set id.');
  const walletRes = await walletsClient.createWallets({ accountType: 'EOA', blockchains: [chain as Blockchain], count: 1, walletSetId });
  const wallet = walletRes.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) throw new Error('Circle did not return a wallet id and address.');
  return { walletSetId, walletId: wallet.id, walletAddress: wallet.address };
}

async function requestTestnetTokens(walletsClient: CircleDeveloperControlledWalletsClient, walletAddress: string, chain: ChainFact): Promise<void> {
  try {
    await walletsClient.requestTestnetTokens({ address: walletAddress, blockchain: chain.scpBlockchain as TestnetBlockchain, ...(chain.usdc ? { usdc: true } : {}), ...(chain.nativeCurrency.isUsdc ? {} : { native: true }) });
  } catch (error: unknown) {
    throw new Error(`Circle faucet request failed: ${sanitizeForLog(error)}. Fund ${walletAddress} via https://faucet.circle.com then rerun with --wallet-id, --wallet-address, --skip-funding.`);
  }
}

async function waitForFunding(walletsClient: CircleDeveloperControlledWalletsClient, walletId: string): Promise<unknown[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < FUNDING_WAIT_ATTEMPTS; attempt++) {
    await sleep(FUNDING_WAIT_MS);
    try {
      const balanceRes = await walletsClient.getWalletTokenBalance({ id: walletId });
      const balances = balanceRes.data?.tokenBalances ?? [];
      if (balances.length > 0) return balances;
      lastError = undefined;
    } catch (error: unknown) { lastError = error; }
  }
  if (lastError !== undefined) console.log(`Warning: balance check failed (last error: ${sanitizeForLog(lastError)}).`);
  return [];
}

async function deployContract(input: { scpClient: CircleSmartContractPlatformClient; name: string; chain: string; walletId: string; artifact: CompiledArtifact; constructorArgs: unknown[] }): Promise<{ contractId: string; transactionId?: string }> {
  const response = await input.scpClient.deployContract({ name: input.name, blockchain: input.chain as ScpBlockchain, walletId: input.walletId, abiJson: JSON.stringify(input.artifact.abi), bytecode: input.artifact.bytecode, constructorParameters: input.constructorArgs, fee: { type: 'level', config: { feeLevel: 'MEDIUM' } } });
  const contractId = response.data?.contractId;
  if (!contractId) throw new Error('Circle did not return a contract id.');
  return { contractId, ...(response.data?.transactionId ? { transactionId: response.data.transactionId } : {}) };
}

async function pollForCompletion(scpClient: CircleSmartContractPlatformClient, contractId: string): Promise<{ status?: string; contractAddress?: string; txHash?: string }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const response = await scpClient.getContract({ id: contractId });
    const contract = response.data?.contract;
    if (!contract) throw new Error(`Contract ${contractId} not found while polling.`);
    if (contract.status === 'COMPLETE') return { status: contract.status, contractAddress: contract.contractAddress, txHash: contract.txHash };
    if (contract.status === 'FAILED') throw new Error(`Contract deployment failed: ${contract.deploymentErrorReason ?? 'unknown'}. ${contract.deploymentErrorDetails ?? ''}`.trim());
    console.log(`Polling contract ${contractId}: ${contract.status ?? 'UNKNOWN'} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`);
  }
  throw new Error(`Contract deployment timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s.`);
}

async function main(): Promise<void> {
  const facts = await loadOnchainFacts();
  const options = parseArgs(process.argv.slice(2), listSupportedChains(facts));
  const chainFact = facts.requireChainByScpBlockchain(options.chain);
  const artifact = readCompiledArtifact(options.artifactPath);
  const { walletsClient, scpClient } = createCircleClients();

  let walletId = options.walletId;
  let walletAddress = options.walletAddress;
  let walletSetId: string | undefined;

  if (walletId && walletAddress) {
    console.log(`Reusing wallet ${walletId} (${walletAddress})`);
  } else if (walletId) {
    console.log(`Reusing wallet ${walletId}`);
  } else {
    const created = await createDeploymentWallet(walletsClient, options.chain);
    walletSetId = created.walletSetId;
    walletId = created.walletId;
    walletAddress = created.walletAddress;
    console.log(`Created wallet set ${walletSetId}`);
    console.log(`Created deployer wallet ${walletId} (${walletAddress})`);
  }

  if (!walletId) throw new Error('Missing deployer wallet id.');

  if (!options.skipFunding) {
    if (!walletAddress) throw new Error('Missing wallet address needed for faucet funding.');
    console.log(`Requesting ${chainFact.name} faucet funds for wallet ${walletId} (${walletAddress})...`);
    await requestTestnetTokens(walletsClient, walletAddress, chainFact);
    const balances = await waitForFunding(walletsClient, walletId);
    if (balances.length > 0) console.log(`Wallet ${walletId} has ${balances.length} reported token balance(s) after funding.`);
    else console.log('Funding requested, but token balances are not visible yet. Continuing with fee estimation.');
  } else {
    console.log('Skipping faucet funding.');
  }

  const feeEstimate = await scpClient.estimateContractDeploymentFee({ walletId, abiJson: JSON.stringify(artifact.abi), bytecode: artifact.bytecode, constructorParameters: options.constructorArgs });
  console.log(JSON.stringify({ walletId, ...(walletAddress ? { walletAddress } : {}), feeEstimate: feeEstimate.data ?? {} }, null, 2));

  console.log(`Deploying ${options.name} to ${chainFact.name}...`);
  const deployment = await deployContract({ scpClient, name: options.name, chain: options.chain, walletId, artifact, constructorArgs: options.constructorArgs });
  const contract = await pollForCompletion(scpClient, deployment.contractId);

  if (!contract.contractAddress) throw new Error(`Contract ${deployment.contractId} completed without a contract address.`);

  const explorerUrl = `${chainFact.explorerBase}/address/${contract.contractAddress}`;
  const { metadataPath, metadata } = upsertContractMetadata({ name: options.name, chain: options.chain, displayName: chainFact.name, artifactPath: options.artifactPath, contractAddress: contract.contractAddress, explorerUrl, txHash: contract.txHash, deployerWalletId: walletId, ...(walletAddress ? { deployerAddress: walletAddress } : {}) });

  console.log(JSON.stringify({ status: 'success', chain: chainFact.name, blockchain: options.chain, walletSetId, walletId, walletAddress, contractId: deployment.contractId, transactionId: deployment.transactionId, contractAddress: contract.contractAddress, txHash: contract.txHash, explorerUrl, contractMetadataPath: metadataPath, contractMetadata: metadata }, null, 2));
}

if ((import.meta as unknown as { main?: boolean }).main) {
  main().catch((error: unknown) => {
    console.error(sanitizeForLog(error));
    process.exit(1);
  });
}
