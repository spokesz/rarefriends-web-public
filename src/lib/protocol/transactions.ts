import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, maxUint256, parseAbi, parseUnits, toHex, zeroAddress, type Address } from "viem";
import type { ActionQuote, SwapQuote } from "@/src/features/protocol/model";
import type { PreparedPlan, PrepareRequest } from "@/src/features/protocol/types";
import { contractRead, ProtocolError, type ChainContext } from "@/src/lib/protocol/chain-context";
import { chainIndex, mapBounded, supportsFriendRewards, units, type IndexedNft } from "./indexer";
import { callSwapQuote } from "./quotes";
import { readReserveStatus } from "./reserve";

type Step = PreparedPlan["steps"][number];
const nonzero = (address: Address) => address.toLowerCase() !== zeroAddress;
const format = (value: bigint) => units(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
const tokenSymbols = { RF: "$RAREFRIENDS", WETH: "WETH", ETH: "ETH" };
const friendWalletAbi = parseAbi([
  "function token() view returns (uint256 chainId, address tokenContract, uint256 tokenId)",
  "function owner() view returns (address)",
  "function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes result)",
]);

export function prepareInput(value: unknown): PrepareRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProtocolError("Invalid transaction request.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["address", "action", "swap"].includes(key))) throw new ProtocolError("Unknown transaction request field.");
  if (typeof body.address !== "string" || !isAddress(body.address)) throw new ProtocolError("A valid wallet address is required.");
  if (Boolean(body.action) === Boolean(body.swap)) throw new ProtocolError("Provide one action or one swap.");
  const address = getAddress(body.address);
  if (body.swap) {
    if (typeof body.swap !== "object" || Array.isArray(body.swap)) throw new ProtocolError("Invalid swap request.");
    const swap = body.swap as Record<string, unknown>;
    if (Object.keys(swap).some((key) => !["buy", "amount", "slippageBps", "payWith"].includes(key)) || typeof swap.buy !== "boolean" || typeof swap.amount !== "string" || !/^\d+(\.\d{1,18})?$/.test(swap.amount) || swap.amount.length > 64 || !Number.isInteger(swap.slippageBps) || Number(swap.slippageBps) < 0 || Number(swap.slippageBps) > 1000) throw new ProtocolError("Enter a decimal amount and slippage between 0 and 10%.");
    if (swap.payWith !== undefined && swap.payWith !== "ETH" && swap.payWith !== "WETH") throw new ProtocolError("Invalid swap currency.");
    // WETH is a buy-side choice only; sells always receive and unwrap WETH.
    return { address, swap: { buy: swap.buy, amount: swap.amount, slippageBps: Number(swap.slippageBps), ...(swap.buy && swap.payWith === "WETH" ? { payWith: "WETH" as const } : {}) } };
  }
  if (!nonzero(address)) throw new ProtocolError("Connect a wallet before preparing an action.");
  if (!body.action || typeof body.action !== "object" || Array.isArray(body.action)) throw new ProtocolError("Invalid action.");
  const action = body.action as Record<string, unknown>;
  if (Object.keys(action).some((key) => !["kind", "friendId", "collection", "asset"].includes(key))) throw new ProtocolError("Unknown action field.");
  if (!["hardwire", "promote", "upgrade", "activate", "convert", "claim", "withdraw"].includes(String(action.kind))) throw new ProtocolError("Unsupported friend action.");
  if (action.friendId !== undefined && (!Number.isSafeInteger(action.friendId) || Number(action.friendId) < 0)) throw new ProtocolError("Invalid friend identifier.");
  if (action.collection !== undefined && action.collection !== "Genesis" && action.collection !== "Generations") throw new ProtocolError("Select the friend’s collection.");
  if (action.kind === "claim" && (action.collection !== undefined) !== (action.friendId !== undefined)) throw new ProtocolError("Select both the friend and its collection.");
  if (action.kind !== "claim" && action.collection !== "Genesis" && action.collection !== "Generations") throw new ProtocolError("Select the friend’s collection.");
  if (action.kind !== "claim" && action.kind !== "hardwire" && action.friendId === undefined) throw new ProtocolError("Select a friend.");
  if (action.kind === "withdraw" && action.asset === undefined) throw new ProtocolError("Select the wallet asset to withdraw.");
  if (action.asset !== undefined && action.asset !== "RF" && action.asset !== "WETH" && !(action.kind === "withdraw" && action.asset === "ETH")) throw new ProtocolError("Invalid asset for this action.");
  return { address, action: action as unknown as PrepareRequest["action"] };
}

function transaction(context: ChainContext, sender: Address, contract: string, label: string, functionName: string, args: readonly unknown[], value = 0n): Step {
  const target = context.manifest.contracts[contract];
  return { label, transaction: { from: sender, to: target.address, data: encodeFunctionData({ abi: target.abi, functionName, args }), value: toHex(value), chainId: toHex(context.chainId) } };
}

async function approval(context: ChainContext, sender: Address, token: "RF" | "WETH", spender: Address, amount: bigint, block: bigint): Promise<Step[]> {
  const current = await contractRead<bigint>(context, token, "allowance", [sender, spender], block);
  return current >= amount ? [] : [transaction(context, sender, token, `Approve unlimited ${tokenSymbols[token]}`, "approve", [spender, maxUint256])];
}

async function ownedClaimFriends(context: ChainContext, sender: Address, block: bigint): Promise<IndexedNft[]> {
  const snapshot = await context.client.getBlock({ blockNumber: block });
  const index = await chainIndex(context, { number: block, timestamp: snapshot.timestamp, hash: snapshot.hash });
  const owned = [...index.nfts.values()].filter((nft) => nft.owner.toLowerCase() === sender.toLowerCase());
  if (owned.length > 1500) throw new ProtocolError("This wallet requires paginated NFT indexing.", 503);
  const friends = await mapBounded(owned, async (nft) => {
    const [owner, generation] = await Promise.all([
      contractRead<Address>(context, nft.collection, "ownerOf", [nft.id], block),
      nft.collection === "Generations" ? contractRead<number>(context, nft.collection, "generation", [nft.id], block) : Promise.resolve(0),
    ]);
    if (owner.toLowerCase() !== sender.toLowerCase()) throw new ProtocolError("Friend ownership changed. Refresh your portfolio.", 409);
    return nft.collection === "Generations" && Number(generation) === 0 ? null : nft;
  }, 8);
  return friends.filter((friend): friend is IndexedNft => friend !== null);
}

function basePlan(context: ChainContext, request: PrepareRequest, block: bigint, quote: ActionQuote, cost: bigint, receive: bigint): PreparedPlan {
  return { quote, steps: [], chainId: context.chainId, address: request.address, blockNumber: String(block), request,
    exact: { cost: String(cost), receive: String(receive) },
  };
}

export async function prepareProtocol(request: PrepareRequest, context: ChainContext): Promise<PreparedPlan> {
  const block = await context.client.getBlock();
  if (block.number === null) throw new ProtocolError("A confirmed block is unavailable.", 503);
  if (request.swap) return prepareSwap(context, request, block.number, block.timestamp);
  return prepareAction(context, request, block.number);
}

async function prepareAction(context: ChainContext, request: PrepareRequest, block: bigint): Promise<PreparedPlan> {
  const action = request.action!;
  if (action.kind === "withdraw") return prepareWithdrawal(context, request, block);
  if (action.asset === "ETH") throw new ProtocolError("ETH is only supported for NFT wallet withdrawals.");
  const sender = request.address;
  const manager = context.manifest.contracts.ActivationManager.address;
  const friendRewards = supportsFriendRewards(context);
  const balance = await contractRead<bigint>(context, "RF", "balanceOf", [sender], block);
  const asset = action.kind === "claim" ? action.asset ?? "RF" : "RF";
  let cost = 0n;
  let receive = 0n;
  let title = "";
  let description = "";
  let reason: string | undefined;
  let expectedGeneration: number | undefined;
  let target = "ActivationManager";
  let functionName: string = action.kind;
  let args: readonly unknown[] = [];
  let claimSteps: Step[] | undefined;
  const collection = action.collection;
  const id = BigInt(action.friendId ?? 0);

  if (action.kind === "claim") {
    title = `Claim ${tokenSymbols[asset]} rewards`;
    const assetAddress = context.manifest.contracts[asset].address;
    if (friendRewards) {
      description = `Recipient: each NFT’s wallet · ${tokenSymbols[asset]} rewards`;
      if (collection && action.friendId !== undefined) {
        title = `Claim ${tokenSymbols[asset]} · ${collection} #${id}`;
        description = `${collection} #${id} rewards → its NFT wallet`;
        const owner = await contractRead<Address>(context, collection, "ownerOf", [id], block);
        if (owner.toLowerCase() !== sender.toLowerCase()) throw new ProtocolError("The connected wallet does not own this friend.", 403);
        if (collection === "Generations" && Number(await contractRead<number>(context, collection, "generation", [id], block)) === 0) throw new ProtocolError("Hardwire this temporary friend first.");
        args = [assetAddress, context.manifest.contracts[collection].address, id];
        receive = await contractRead<bigint>(context, "ActivationManager", "earned", args, block);
      } else {
        const friends = await ownedClaimFriends(context, sender, block);
        const amounts = await mapBounded(friends, (friend) => contractRead<bigint>(context, "ActivationManager", "earned", [assetAddress, context.manifest.contracts[friend.collection].address, friend.id], block), 8);
        receive = amounts.reduce((sum, amount) => sum + amount, 0n);
        claimSteps = [];
        for (let offset = 0; offset < friends.length; offset += 100) {
          const batch = friends.slice(offset, offset + 100);
          claimSteps.push(transaction(context, sender, "ActivationManager", friends.length > 100 ? `${title} · batch ${Math.floor(offset / 100) + 1}` : title, "claimBatch", [assetAddress, batch.map((friend) => context.manifest.contracts[friend.collection].address), batch.map((friend) => friend.id)]));
        }
      }
    } else {
      if (collection !== undefined || action.friendId !== undefined) throw new ProtocolError("This deployment only supports holder-level reward claims.");
      receive = await contractRead<bigint>(context, "ActivationManager", "earned", [assetAddress, sender], block);
      description = `Recipient: connected wallet · ${tokenSymbols[asset]} holder rewards only`;
      args = [assetAddress];
    }
    if (receive === 0n) reason = "No claimable rewards for this asset";
  } else if (action.kind === "hardwire") {
    if (collection !== "Generations") throw new ProtocolError("Only a temporary Generations friend can be hardwired.");
    const temporaryId = await contractRead<bigint>(context, "Generations", "temporaryFriend", [sender], block);
    if (temporaryId === 0n || (action.friendId !== undefined && temporaryId !== id)) throw new ProtocolError("The selected temporary friend is no longer available. Refresh your portfolio.", 409);
        const denominations = await Promise.all(
      Array.from({ length: 6 }, (_, i) => contractRead<bigint>(context, "Generations", "denomination", [i + 1], block))
    );
    for (let generation = 1; generation <= 6; generation++) {
      const amount = denominations[generation - 1];
      if (balance >= amount) { expectedGeneration = generation; cost = amount; break; }
    }
    if (expectedGeneration === undefined) throw new ProtocolError("Hold at least one full $RAREFRIENDS to hardwire.");
    title = `Hardwire Generation ${expectedGeneration}`;
    description = `Permanent Generation ${expectedGeneration} · NFT wallet · tier 0 · generation checked before payment · 50% burned · 50% rewards`;
    args = [expectedGeneration];
  } else {
    if (!collection) throw new ProtocolError("The friend collection is required.");
    const collectionAddress = context.manifest.contracts[collection].address;
    const owner = await contractRead<Address>(context, collection, "ownerOf", [id], block);
    if (owner.toLowerCase() !== sender.toLowerCase()) throw new ProtocolError("The connected wallet does not own this friend.", 403);
    const [position, generation] = await Promise.all([
      contractRead<readonly [Address, number, bigint] | readonly [number, bigint]>(context, "ActivationManager", "positions", [collectionAddress, id], block),
      collection === "Generations" ? contractRead<number>(context, collection, "generation", [id], block) : Promise.resolve(0),
    ]);
    if (collection === "Generations" && Number(generation) === 0) throw new ProtocolError("Hardwire this temporary friend first.");
    const denomination = collection === "Genesis" ? await contractRead<bigint>(context, "ActivationManager", "GENESIS_DENOMINATION", [], block) : await contractRead<bigint>(context, "Generations", "denomination", [Number(generation)], block);
    const active = friendRewards ? BigInt(position[1]) > 0n : String(position[0]).toLowerCase() === sender.toLowerCase();
    const tier = Number(position[friendRewards ? 0 : 1]);
    args = [collectionAddress, id];
    if (action.kind === "activate") {
      cost = denomination / 10n;
      title = `Activate ${collection}`;
      description = "Tier 0 · $RAREFRIENDS + WETH rewards · 50% burned · 50% rewards · activation cleared on transfer";
      if (active) reason = "Already activated";
    } else if (action.kind === "upgrade") {
      title = `Upgrade to tier ${Math.min(4, tier + 1)}`;
      description = "Higher reward weight · tier difference charged · 50% burned · 50% rewards";
      if (!active) reason = "Activation required";
      else if (friendRewards && collection === "Genesis") reason = "Genesis reward weight is fixed";
      else if (tier >= 4) reason = "Tier 4 · maximum";
      else {
        const [current, next] = await Promise.all([contractRead<bigint>(context, "ActivationManager", "cumulativeBps", [tier], block), contractRead<bigint>(context, "ActivationManager", "cumulativeBps", [tier + 1], block)]);
        cost = denomination * (next - current) / 10_000n;
      }
    } else if (action.kind === "promote") {
      if (collection !== "Generations") throw new ProtocolError("Only Generations friends can be promoted.");
      if (Number(generation) <= 1) reason = "Generation 1 · maximum";
      else cost = await contractRead<bigint>(context, "Generations", "denomination", [Number(generation) - 1], block) - denomination;
      title = `Promote to Generation ${Math.max(1, Number(generation) - 1)}`;
      description = `Generation ${generation} → ${Math.max(1, Number(generation) - 1)} · tier reset → 0 · previous upgrades nonrefundable · 50% burned · 50% rewards`;
      args = [id];
    } else if (action.kind === "convert") {
      if (collection !== "Genesis") throw new ProtocolError("Only Genesis can be converted.");
      const reserve = await readReserveStatus(context, block);
      cost = BigInt(reserve.conversionFee); receive = BigInt(reserve.conversionPayout); target = "Reserve"; functionName = "deposit"; args = [id];
      title = "Convert Genesis";
      description = `Genesis, wallet control and contents → reserve · upfront fee: ${format(cost)} $RAREFRIENDS · future rewards surrendered · ${friendRewards ? "accrued rewards remain with Genesis" : "accrued holder rewards retained"}`;
      if (!reserve.conversionAvailable) reason = reserve.conversionReasons.join(" ");
    }
  }
  if (!reason && balance < cost) reason = `Shortfall: ${format(cost - balance)} $RAREFRIENDS`;
  const quote: ActionQuote = { title, description, cost: units(cost), receive: units(receive), asset, enabled: !reason, ...(reason ? { reason } : {}), ...(action.kind === "claim" ? { rewardDestination: friendRewards ? "friend-wallet" : "connected-wallet" } : {}) };
  const plan = basePlan(context, request, block, quote, cost, receive);
  if (expectedGeneration !== undefined) plan.exact.expectedGeneration = expectedGeneration;
  if (reason) return plan;
  if (cost > 0n) plan.steps.push(...await approval(context, sender, "RF", target === "Reserve" ? context.manifest.contracts.Reserve.address : manager, cost, block));
  if (action.kind === "convert") {
    const reserve = context.manifest.contracts.Reserve.address;
    const [approved, operator] = await Promise.all([contractRead<Address>(context, "Genesis", "getApproved", [id], block), contractRead<boolean>(context, "Genesis", "isApprovedForAll", [sender, reserve], block)]);
    if (!operator && approved.toLowerCase() !== reserve.toLowerCase()) plan.steps.push(transaction(context, sender, "Genesis", "Approve this Genesis for conversion", "approve", [reserve, id]));
  }
  const final = claimSteps ?? [transaction(context, sender, target, title, functionName, args)];
  // Once approvals already exist, simulate the real sender at the exact snapshot.
  if (plan.steps.length === 0) await mapBounded(final, (step) => context.client.call({ account: sender, to: step.transaction.to, data: step.transaction.data, blockNumber: block }), 4);
  plan.steps.push(...final);
  return plan;
}

async function prepareWithdrawal(context: ChainContext, request: PrepareRequest, block: bigint): Promise<PreparedPlan> {
  const action = request.action!;
  const sender = request.address;
  const collection = action.collection;
  const asset = action.asset;
  if (!collection || action.friendId === undefined) throw new ProtocolError("Select the friend and its collection.");
  if (!asset || !["RF", "WETH", "ETH"].includes(asset)) throw new ProtocolError("Select the wallet asset to withdraw.");
  const id = BigInt(action.friendId);
  const collectionAddress = context.manifest.contracts[collection].address;
  const [owner, generation, walletAddress] = await Promise.all([
    contractRead<Address>(context, collection, "ownerOf", [id], block),
    collection === "Generations" ? contractRead<number>(context, collection, "generation", [id], block) : Promise.resolve(0),
    contractRead<Address>(context, collection, "tokenBoundAccount", [id], block),
  ]);
  if (owner.toLowerCase() !== sender.toLowerCase()) throw new ProtocolError("The connected wallet does not own this friend.", 403);
  if (collection === "Generations" && Number(generation) === 0) throw new ProtocolError("Hardwire this temporary friend first.");
  if (!nonzero(walletAddress) || !await context.client.getCode({ address: walletAddress, blockNumber: block })) throw new ProtocolError("This NFT wallet is not deployed.", 409);
  const [binding, walletOwner, receive] = await Promise.all([
    context.client.readContract({ address: walletAddress, abi: friendWalletAbi, functionName: "token", blockNumber: block }),
    context.client.readContract({ address: walletAddress, abi: friendWalletAbi, functionName: "owner", blockNumber: block }),
    asset === "ETH" ? context.client.getBalance({ address: walletAddress, blockNumber: block }) : contractRead<bigint>(context, asset, "balanceOf", [walletAddress], block),
  ]);
  if (binding[0] !== BigInt(context.chainId) || binding[1].toLowerCase() !== collectionAddress.toLowerCase() || binding[2] !== id) throw new ProtocolError("The wallet does not belong to this NFT on the connected chain.", 409);
  if (walletOwner.toLowerCase() !== sender.toLowerCase()) throw new ProtocolError("The connected wallet does not control this NFT wallet.", 403);
  const title = `Withdraw ${tokenSymbols[asset]} · ${collection} #${id}`;
  const quote: ActionQuote = { title, description: `${collection} #${id} wallet → connected wallet · full ${tokenSymbols[asset]} balance`, cost: 0, receive: units(receive), asset, enabled: receive > 0n,
    ...(receive > 0n ? {} : { reason: `No ${tokenSymbols[asset]} in this NFT wallet` }) };
  const plan = basePlan(context, request, block, quote, 0n, receive);
  if (receive === 0n) return plan;
  const target = asset === "ETH" ? sender : context.manifest.contracts[asset].address;
  const transfer = asset === "ETH" ? "0x" : encodeFunctionData({ abi: context.manifest.contracts[asset].abi, functionName: "transfer", args: [sender, receive] });
  const data = encodeFunctionData({ abi: friendWalletAbi, functionName: "execute", args: [target, asset === "ETH" ? receive : 0n, transfer, 0] });
  // Funds come from the NFT wallet; the connected owner pays only the network fee.
  await context.client.call({ account: sender, to: walletAddress, data, blockNumber: block });
  plan.steps.push({ label: title, transaction: { from: sender, to: walletAddress, data, value: toHex(0n), chainId: toHex(context.chainId) } });
  return plan;
}

async function prepareSwap(context: ChainContext, request: PrepareRequest, block: bigint, timestamp: bigint): Promise<PreparedPlan> {
  const swap = request.swap!;
  const amount = parseUnits(swap.amount, 18);
  if (amount <= 0n || amount >= (1n << 127n)) throw new ProtocolError("Enter a positive amount within the market’s supported range.");
  if (!await contractRead<boolean>(context, "Market", "seedComplete", [], block)) throw new ProtocolError("The market has not been seeded yet.", 409);
  const market = context.manifest.contracts.Market;
  const sender = request.address;
  const simulationSender = nonzero(sender) ? sender : "0x000000000000000000000000000000000000dEaD" as Address;
  const deadline = timestamp + 1200n;
  const callData = encodeFunctionData({ abi: market.abi, functionName: "swapExactInput", args: [swap.buy, amount, 0n, simulationSender, deadline] });
  const inputToken = swap.buy ? "WETH" : "RF";
  const payWeth = swap.buy && swap.payWith === "WETH";
  const result = await callSwapQuote(context, inputToken, simulationSender, amount, block, callData);
  const output = decodeFunctionResult({ abi: market.abi, functionName: "swapExactInput", data: result }) as bigint;
  const minimum = output * BigInt(10_000 - swap.slippageBps) / 10_000n;
  const [native, rf, weth, feeBps] = await Promise.all([
    context.client.getBalance({ address: sender, blockNumber: block }), contractRead<bigint>(context, "RF", "balanceOf", [sender], block),
    payWeth ? contractRead<bigint>(context, "WETH", "balanceOf", [sender], block) : Promise.resolve(0n),
    contractRead<bigint>(context, "Hook", "FEE_BPS", [], block),
  ]);
  const enough = (swap.buy ? payWeth ? weth : native : rf) >= amount;
  const reason = !nonzero(sender) ? "Connect a wallet to swap." : !enough ? `Insufficient ${swap.buy ? payWeth ? "WETH" : "ETH" : "$RAREFRIENDS"} balance.` : output === 0n ? "This amount produces no output." : undefined;
  const fee = swap.buy ? amount * feeBps / 10_000n : output * feeBps / (10_000n - feeBps);
  const swapQuote: SwapQuote = { buy: swap.buy, amountIn: units(amount), amountOut: units(output), output: units(output), fee: units(fee), minimumReceived: units(minimum), enabled: !reason, ...(reason ? { reason } : {}) };
  const quote: ActionQuote = { title: swap.buy ? "Buy $RAREFRIENDS" : "Sell $RAREFRIENDS", asset: swap.buy ? "WETH" : "RF", cost: units(amount), receive: units(output), enabled: !reason,
    description: swap.buy ? payWeth ? "Approve the market and swap your WETH into $RAREFRIENDS using the live pool quote." : "Wrap native ETH, approve the market and swap into $RAREFRIENDS using the live pool quote." : "Swap $RAREFRIENDS into WETH. Unwrap only the WETH actually received after the swap confirms.", ...(reason ? { reason } : {}) };
  const plan = basePlan(context, request, block, quote, amount, output);
  plan.swapQuote = swapQuote;
  plan.quoteMethod = "eth_call";
  plan.exact = { ...plan.exact, amountIn: String(amount), amountOut: String(output), minimumReceived: String(minimum), deadline: String(deadline) };
  if (!swap.buy) plan.unwrap = { wethAddress: context.manifest.contracts.WETH.address };
  if (reason) return plan;
  if (swap.buy && !payWeth) plan.steps.push(transaction(context, sender, "WETH", "Wrap ETH", "deposit", [], amount));
  plan.steps.push(...await approval(context, sender, inputToken, market.address, amount, block));
  plan.steps.push(transaction(context, sender, "Market", swap.buy ? "Buy $RAREFRIENDS" : "Sell $RAREFRIENDS", "swapExactInput", [swap.buy, amount, minimum, sender, deadline]));
  return plan;
}
