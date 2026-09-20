import { decodeErrorResult, decodeEventLog, encodeFunctionData, erc20Abi, parseAbi, toHex, type Abi, type Address, type Hex } from "viem";
import type { PortfolioAction } from "./model";
import type { ProtocolConfig, PreparedPlan, ProtocolState } from "./types";
import { walletChainContext } from "../../wallet/wallet-chain";
import { walletRpcClient, type WalletRpc } from "../../wallet/wallet-rpc";

export type PrepareInput = { address: string; action?: PortfolioAction; swap?: { buy: boolean; amount: string; slippageBps: number; payWith?: "ETH" | "WETH" } };
export type TransactionProgress = { title: string; label: string; step: number; total: number; hash?: string };
type Wallet = WalletRpc;
const pendingTransactions = new Map<string, string>();

export async function prepareTransaction(input: PrepareInput, config: ProtocolConfig, wallet: WalletRpc, signal?: AbortSignal): Promise<PreparedPlan> {
  signal?.throwIfAborted();
  const normalized = input.swap ? { ...input, swap: { ...input.swap, amount: input.swap.amount.replace(/^\./, "0.").replace(/\.$/, "") } } : input;
  if (normalized.swap) {
    const query = new URLSearchParams({ address: normalized.address, buy: String(normalized.swap.buy), amount: normalized.swap.amount, slippageBps: String(normalized.swap.slippageBps) });
    if (normalized.swap.payWith) query.set("payWith", normalized.swap.payWith);
    const response = await fetch(`/api/protocol/quote?${query}`, { signal, cache: "no-store", headers: { accept: "application/json" } });
    const body = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The swap quote could not be completed.");
    return body as unknown as PreparedPlan;
  }
  const context = walletChainContext(config, wallet);
  const { prepareInput, prepareProtocol } = await import("@/src/lib/protocol/transactions");
  const plan = await prepareProtocol(prepareInput(normalized), context);
  signal?.throwIfAborted();
  return plan;
}

/** Encode claims and withdrawals from the displayed snapshot without any RPC reads. */
export function portfolioTransferPlan(address: Address, action: PortfolioAction, config: ProtocolConfig, snapshot: ProtocolState): PreparedPlan {
  const account = snapshot.account;
  const friend = account?.friends.find(friend => friend.id === action.friendId && friend.collection === action.collection);
  if (!account || account.address?.toLowerCase() !== address.toLowerCase() || !friend?.wallet || !friend.hardwired) throw new Error("Refresh your portfolio to load this friend's wallet.");
  const asset = action.asset ?? "RF";
  const title = `${action.kind === "claim" ? "Claim" : "Withdraw"} ${asset} · ${friend.collection} #${friend.id}`;
  let to: Address;
  let data: Hex;
  let receive = "0";
  if (action.kind === "claim") {
    if (asset === "ETH" || account.rewardAccounting !== "friend") throw new Error("This friend does not support these rewards.");
    to = config.contracts.ActivationManager;
    data = encodeFunctionData({ abi: parseAbi(["function claim(address asset, address collection, uint256 tokenId)"]), functionName: "claim",
      args: [config.contracts[asset], config.contracts[friend.collection], BigInt(friend.id)] });
  } else if (action.kind === "withdraw") {
    const token = friend.wallet.tokens.find(token => token.symbol === asset || asset === "RF" && token.symbol === "$RAREFRIENDS");
    if (!token?.rawBalance || BigInt(token.rawBalance) <= 0n) throw new Error("Refresh your portfolio to load the withdrawal balance.");
    receive = token.rawBalance;
    to = friend.wallet.address as Address;
    const transfer = asset === "ETH" ? "0x" : encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [address, BigInt(receive)] });
    data = encodeFunctionData({ abi: parseAbi(["function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes)"]), functionName: "execute",
      args: [asset === "ETH" ? address : config.contracts[asset], asset === "ETH" ? BigInt(receive) : 0n, transfer, 0] });
  } else throw new Error("Unsupported portfolio transfer.");
  return { address, chainId: config.chainId, blockNumber: snapshot.blockNumber, request: { address, action }, exact: { cost: "0", receive },
    quote: { title, description: title, asset, cost: 0, receive: 0, enabled: true },
    steps: [{ label: title, transaction: { from: address, to, data, value: "0x0", chainId: toHex(config.chainId) } }] };
}

export function transactionError(cause: unknown): string {
  const error = cause as { shortMessage?: string; message?: string; code?: number; cause?: { code?: number } };
  if (error?.code === 4001 || error?.cause?.code === 4001 || /user rejected|user denied/i.test(error?.message ?? "")) return "Transaction cancelled in your wallet. Confirmed earlier steps remain complete; you can review and continue.";
  return error?.shortMessage ?? error?.message?.split("\n")[0] ?? "The transaction could not be completed.";
}

type RevertStep = { from: string; to: string; data: string; value?: string };

/** Replays a reverted step at its block so the wallet's node returns the contract's revert data. Nothing is sent. */
async function replayRevertReason(client: ReturnType<typeof walletRpcClient>, transaction: RevertStep, blockNumber: bigint | undefined, abi: Abi | undefined) {
  if (!abi || blockNumber === undefined) return undefined;
  try {
    await client.call({ account: transaction.from as Address, to: transaction.to as Address, data: transaction.data as Hex, value: BigInt(transaction.value ?? "0x0"), blockNumber });
    return undefined;
  } catch (error) {
    let current: unknown = error;
    for (let depth = 0; current && typeof current === "object" && depth < 8; depth++) {
      const data = (current as { data?: unknown }).data;
      if (typeof data === "string" && /^0x[0-9a-fA-F]{8}/.test(data)) {
        try { return decodeErrorResult({ abi, data: data as Hex }).errorName; } catch { return undefined; }
      }
      current = (current as { cause?: unknown }).cause;
    }
    return undefined;
  }
}

export function revertMessage(label: string, reason: string | undefined) {
  if (reason === "SlippageExceeded" || reason === "PartialFill") {
    return `${label} reverted: the pool price moved past your max. slippage before it confirmed. Earlier steps such as approvals remain complete; raise max. slippage in the swap settings and retry.`;
  }
  if (reason === "DeadlineExpired") return `${label} reverted: the quote's deadline passed before it confirmed. Earlier steps remain complete; review again for a fresh quote.`;
  return `${label} reverted${reason ? ` (${reason})` : ""}. Confirmed earlier steps remain complete; review before retrying.`;
}

export async function submitPlan({ wallet, config, input, plan, onProgress, onReceipt, onStepConfirmed }: {
  wallet: Wallet; config: ProtocolConfig; input: PrepareInput; plan: PreparedPlan;
  onProgress(progress: TransactionProgress): void; onReceipt(blockNumber: bigint): Promise<void>;
  onStepConfirmed?(remaining: PreparedPlan["steps"]): void;
}) {
  if (plan.chainId !== config.chainId || plan.address.toLowerCase() !== input.address.toLowerCase()) throw new Error("The transaction belongs to a different wallet or network. Review again.");
  if (!plan.quote.enabled) throw new Error(plan.quote.reason ?? "This action is unavailable.");
  const targetChain = toHex(config.chainId);
  const immediate = input.action?.kind === "claim" || input.action?.kind === "withdraw";
  const actualChain = immediate ? wallet.chainId : await wallet.request("eth_chainId");
  if (typeof actualChain !== "string" || BigInt(actualChain) !== BigInt(config.chainId)) {
    if (immediate) throw new Error(`Switch to ${config.chainName} in your wallet.`);
    onProgress({ title: plan.quote.title, label: `Switch to ${config.chainName} in your wallet`, step: 0, total: plan.steps.length });
    try { await wallet.request("wallet_switchEthereumChain", [{ chainId: targetChain }]); }
    catch (cause) {
      if ((cause as { code?: number }).code !== 4902) throw cause;
      await wallet.request("wallet_addEthereumChain", [{ chainId: targetChain, chainName: config.chainName,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [config.rpcUrl],
        ...(config.explorerUrl ? { blockExplorerUrls: [config.explorerUrl] } : {}) }]);
      await wallet.request("wallet_switchEthereumChain", [{ chainId: targetChain }]);
    }
  }
  const session = wallet.getSession();
  const client = walletRpcClient(wallet, config.chainId);
  const revertReason = (transaction: RevertStep, blockNumber: bigint | undefined) =>
    replayRevertReason(client, transaction, blockNumber, config.deployment?.contracts.Market?.abi);
  const owner = input.address.toLowerCase();
  async function checkWallet() {
    if (wallet.getSession() !== session) throw new Error("Wallet changed. Review the transaction again.");
    if (immediate) {
      if (wallet.address?.toLowerCase() !== owner || !wallet.chainId || BigInt(wallet.chainId) !== BigInt(config.chainId)) throw new Error("Wallet or network changed.");
      return;
    }
    const [accounts, chain] = await Promise.all([wallet.request("eth_accounts"), wallet.request("eth_chainId")]);
    if (!Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== owner || typeof chain !== "string" || BigInt(chain) !== BigInt(config.chainId) || wallet.getSession() !== session) {
      throw new Error("Wallet or network changed. Review the transaction again.");
    }
  }
  const pendingKey = `rarefriends.pending.${config.chainId}.${owner}`;
  // Claims and withdrawals are repeatable, so they neither set nor obey the pending-payment guard.
  const rememberHash = (hash: string | null) => {
    if (immediate) return;
    if (hash) pendingTransactions.set(pendingKey, hash); else pendingTransactions.delete(pendingKey);
    try { if (hash) localStorage.setItem(pendingKey, hash); else localStorage.removeItem(pendingKey); } catch {}
  };
  async function waitForConfirmation(initialHash: Hex, label: string, step: number, total: number) {
    let hash = initialHash;
    let replacedWithDifferentCall = false;
    const started = Date.now();
    // Once broadcast, a read timeout must never make the same payment retryable.
    for (;;) {
      let receipt;
      try {
        receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000, onReplaced: replacement => {
          hash = replacement.transaction.hash;
          rememberHash(hash);
          replacedWithDifferentCall ||= replacement.reason !== "repriced";
        } });
      } catch {
        if (immediate && (wallet.getSession() !== session || Date.now() - started >= 60_000)) throw new Error(`${label} is not confirmed yet. Check your wallet's activity; you can submit it again at any time.`);
        if (wallet.getSession() !== session) throw new Error(`Your wallet or network changed while transaction ${hash} was pending. Reconnect this wallet on ${config.chainName} to check its receipt; do not resend it.`);
        onProgress({ title: plan.quote.title, label: `${label} · still awaiting its receipt${immediate ? "" : "; do not resend"}`, step, total, hash });
        await new Promise(resolve => setTimeout(resolve, 3_000));
        continue;
      }
      rememberHash(null);
      if (replacedWithDifferentCall) throw new Error(`${label} was cancelled or replaced in your wallet. Review again before continuing.`);
      return receipt;
    }
  }
  await checkWallet();
  let earlierHash: string | null = immediate ? null : pendingTransactions.get(pendingKey) ?? null;
  try { if (!immediate) earlierHash = localStorage.getItem(pendingKey) ?? earlierHash; } catch {}
  if (earlierHash && /^0x[0-9a-fA-F]{64}$/.test(earlierHash)) {
    onProgress({ title: plan.quote.title, label: "Checking your previously submitted transaction", step: 0, total: plan.steps.length, hash: earlierHash });
    const receipt = await waitForConfirmation(earlierHash as Hex, "Previous transaction", 0, plan.steps.length);
    await onReceipt(receipt.blockNumber);
    throw new Error("Your previous transaction has settled. Review the updated balances and remaining steps before continuing.");
  }
  if (!plan.steps.length) throw new Error("No transaction is ready to submit. Refresh and review again.");
  let receivedWeth = 0n;
  const weth = config.contracts.WETH as Address;
  const total = plan.steps.length + (input.swap && !input.swap.buy ? 1 : 0);
  for (const [index, step] of plan.steps.entries()) {
    await checkWallet();
    // Re-check the action's current generation/tier and token cost before its final call.
    // The reviewed calldata and its onchain limits remain the user's approved terms.
    if (!immediate && input.action && input.action.kind !== "convert" && index === plan.steps.length - 1) {
      const current = await prepareTransaction(input, config, wallet);
      if (!current.quote.enabled || current.exact.cost !== plan.exact.cost || current.quote.title !== plan.quote.title) {
        throw new Error("This friend's action or cost has changed. Review its updated quote to continue.");
      }
    }
    const transaction = step.transaction;
    if (transaction.from.toLowerCase() !== owner) throw new Error("Transaction wallet does not match the connected account.");
    onProgress({ title: plan.quote.title, label: `${step.label} · confirm in wallet`, step: index + 1, total });
    const gas = immediate ? undefined : await client.estimateGas({ account: transaction.from as Address, to: transaction.to as Address,
      data: transaction.data as Hex, value: BigInt(transaction.value ?? "0x0") });
    if (input.action?.kind === "convert") {
      // Re-read live Reserve gates before EVERY signature, including RF/NFT approvals.
      // A disabled, retired, unseeded or drained Reserve must stop a reviewed plan.
      const current = await prepareTransaction(input, config, wallet);
      if (!current.quote.enabled) throw new Error(current.quote.reason ?? "Genesis conversion is unavailable.");
      const reviewedDeposit = plan.steps.at(-1)?.transaction;
      const currentDeposit = current.steps.at(-1)?.transaction;
      if (current.chainId !== plan.chainId || current.address.toLowerCase() !== owner
        || current.exact.cost !== plan.exact.cost || current.exact.receive !== plan.exact.receive
        || !reviewedDeposit || !currentDeposit
        || currentDeposit.to.toLowerCase() !== reviewedDeposit.to.toLowerCase()
        || currentDeposit.data !== reviewedDeposit.data || currentDeposit.value !== reviewedDeposit.value) {
        throw new Error("The Reserve conversion terms have changed. Review the updated quote to continue.");
      }
    }
    await checkWallet();
    const hash = await wallet.request("eth_sendTransaction", [{ ...transaction, chainId: targetChain, ...(gas === undefined ? {} : { gas: toHex(gas * 120n / 100n) }) }]);
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Your wallet did not return a transaction hash.");
    rememberHash(hash);
    onProgress({ title: plan.quote.title, label: `${step.label} · waiting for confirmation`, step: index + 1, total, hash });
    const receipt = await waitForConfirmation(hash as Hex, step.label, index + 1, total);
    if (receipt.status !== "success") throw new Error(revertMessage(step.label, immediate ? undefined : await revertReason(transaction, receipt.blockNumber)));
    if (input.swap && !input.swap.buy && weth) {
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== weth.toLowerCase()) continue;
        try {
          const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
          if (event.eventName === "Transfer") {
            if (event.args.to.toLowerCase() === owner) receivedWeth += event.args.value;
            if (event.args.from.toLowerCase() === owner) receivedWeth -= event.args.value;
          }
        } catch { /* Only WETH transfers determine the swap's received amount. */ }
      }
    }
    onStepConfirmed?.(plan.steps.slice(index + 1));
    await onReceipt(receipt.blockNumber);
  }
  if (input.swap && !input.swap.buy && receivedWeth > 0n) {
    try {
      await checkWallet();
      const data = encodeFunctionData({ abi: parseAbi(["function withdraw(uint256 wad)"]), functionName: "withdraw", args: [receivedWeth] });
      const transaction = { from: input.address as Address, to: weth, data, chainId: targetChain };
      onProgress({ title: plan.quote.title, label: "Unwrap received WETH into ETH · confirm in wallet", step: total, total });
      const gas = await client.estimateGas({ account: transaction.from, to: weth, data });
      await checkWallet();
      const hash = await wallet.request("eth_sendTransaction", [{ ...transaction, gas: toHex(gas * 120n / 100n) }]) as Hex;
      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet did not return an unwrap transaction hash.");
      rememberHash(hash);
      onProgress({ title: plan.quote.title, label: "Unwrap WETH · waiting for confirmation", step: total, total, hash });
      const receipt = await waitForConfirmation(hash, "Unwrap WETH", total, total);
      if (receipt.status !== "success") throw new Error("Unwrap reverted.");
      await onReceipt(receipt.blockNumber);
    } catch (error) {
      return { notice: `The swap succeeded. Its proceeds are WETH in your wallet because unwrapping did not complete. ${transactionError(error)}` };
    }
  }
  return { notice: null };
}
