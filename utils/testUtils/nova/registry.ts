import { BigNumber, BigNumberish, ContractTransaction } from "ethers";
import { computeExecHash } from ".";
import { getFactory } from "..";
import { gweiToWei } from "../..";

import {
  L2NovaRegistry,
  MockCrossDomainMessenger,
  MockERC20,
  MockERC20__factory,
} from "../../../typechain";

export const fakeStrategyAddress = "0x4200000000000000000000000000000000000069";
export const fakeExecutionManagerAddress =
  "0xDeADBEEF1337caFEBAbE1337CacAfACe1337C0dE";

/** Checks that locally generated input tokens array matches one returned from ethers
 * Difficult to compare BNs in an array like this to numbers which is why you need this function.
 */
export function assertInputTokensMatch(
  inputTokens: {
    l2Token: string;
    amount: BigNumberish;
  }[],
  requestInputTokens: {
    l2Token: string;
    amount: BigNumber;
  }[]
) {
  inputTokens.length.should.equal(requestInputTokens.length);

  for (let i = 0; i < inputTokens.length; i++) {
    const inputToken = inputTokens[i];
    const requestInputToken = requestInputTokens[i];

    inputToken.amount
      .toString()
      .should.equal(requestInputToken.amount.toString());

    inputToken.l2Token.should.equal(requestInputToken.l2Token);
  }
}

/** Small helper function to create a request and return its execHash.
 * Will revert if creating the request reverts.
 */
export async function createRequest(
  MockETH: MockERC20,
  L2_NovaRegistry: L2NovaRegistry,

  requestConfig: {
    calldata?: string;
    strategy?: string;
    gasLimit?: number;
    gasPrice?: number;
    tip?: number;
    inputTokens?: {
      l2Token: string;
      amount: BigNumberish;
    }[];
  }
) {
  const {
    calldata = "0x00",
    strategy = fakeStrategyAddress,
    gasLimit = 500_000,
    gasPrice = gweiToWei(15),
    tip = 1e15, // 0.0001 ETH default tip
    inputTokens = [],
  } = requestConfig;

  // Approve ETH to pay for the gas and tip.
  let weiOwed = gasLimit * gasPrice + tip;
  await MockETH.approve(L2_NovaRegistry.address, weiOwed);

  // Approve and store input tokens if necessary.
  let inputTokenERC20s: MockERC20[] = [];
  if (inputTokens.length > 0) {
    // Get a factory to link to input token ERC20.
    const erc20Factory = await getFactory<MockERC20__factory>("MockERC20");

    for (const inputToken of inputTokens) {
      const inputTokenERC20 = erc20Factory.attach(inputToken.l2Token);

      if (inputTokenERC20.address === MockETH.address) {
        // Add the amount to the existing approval.
        weiOwed += parseInt(inputToken.amount.toString());
        inputTokenERC20.approve(L2_NovaRegistry.address, weiOwed);
      } else {
        // Approve the input token to the registry.
        await inputTokenERC20.approve(
          L2_NovaRegistry.address,
          inputToken.amount
        );
      }

      inputTokenERC20s.push(inputTokenERC20);
    }
  }

  // Make the request.
  const tx = L2_NovaRegistry.requestExec(
    strategy,
    calldata,
    gasLimit,
    gasPrice,
    tip,
    inputTokens
  );

  // Wait for the request to terminate.
  await tx;

  // Get the nonce associated with the request.
  const nonce = await (await L2_NovaRegistry.systemNonce()).toNumber();

  // Get the execHash associated with the request
  const execHash = computeExecHash({
    nonce,
    strategy,
    calldata,
    gasPrice,
  });

  return {
    tx,
    execHash,
    nonce,
    inputTokenERC20s,
    weiOwed,
    ...requestConfig,
  };
}

/** Small harness function to simplify calling execCompleted
 * as though you were the execution manager.
 */
export async function completeRequest(
  MockCrossDomainMessenger: MockCrossDomainMessenger,
  L2_NovaRegistry: L2NovaRegistry,

  {
    execHash,
    rewardRecipient,
    reverted,
    gasUsed,
  }: {
    execHash: string;
    rewardRecipient: string;
    reverted: boolean;
    gasUsed: number;
  }
): Promise<ContractTransaction> {
  await MockCrossDomainMessenger.sendMessageWithSender(
    L2_NovaRegistry.address,
    L2_NovaRegistry.interface.encodeFunctionData("execCompleted", [
      execHash,
      rewardRecipient,
      reverted,
      gasUsed,
    ]),
    1_000_000,
    fakeExecutionManagerAddress
  );

  return MockCrossDomainMessenger.relayCurrentMessage();
}
