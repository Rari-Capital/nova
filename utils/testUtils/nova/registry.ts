import { ContractTransaction } from "ethers";

import { L2NovaRegistry, MockCrossDomainMessenger } from "../../../typechain";

export const fakeStrategyAddress = "0x4200000000000000000000000000000000000069";
export const fakeExecutionManagerAddress =
  "0xDeADBEEF1337caFEBAbE1337CacAfACe1337C0dE";
export async function forceExecCompleted(
  mockCrossDomainMessenger: MockCrossDomainMessenger,
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
  await mockCrossDomainMessenger.sendMessageWithSender(
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

  return mockCrossDomainMessenger.relayCurrentMessage();
}
