import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  L2NovaRegistry__factory,
  MockCrossDomainMessenger,
  MockCrossDomainMessenger__factory,
  MockERC20,
  MockAuthority__factory,
  MockERC20__factory,
  L2NovaRegistry,
} from "../../typechain";

import {
  getFactory,
  snapshotGasCost,
  fakeExecutionManagerAddress,
  checkpointBalance,
  createRequest,
  assertInputTokensMatch,
  fakeStrategyAddress,
  computeExecHash,
  increaseTimeAndMine,
  completeRequest,
  speedUpRequest,
} from "../../utils/testUtils";
import { BigNumber } from "ethers";

describe("L2_NovaRegistry", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  let L2_NovaRegistry: L2NovaRegistry;

  /// Mocks
  let MockETH: MockERC20;
  let MockCrossDomainMessenger: MockCrossDomainMessenger;

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      MockETH = await (await getFactory<MockERC20__factory>("MockERC20")).deploy();

      MockCrossDomainMessenger = await (
        await getFactory<MockCrossDomainMessenger__factory>("MockCrossDomainMessenger")
      ).deploy();
    });

    it("should properly deploy the registry", async function () {
      L2_NovaRegistry = await (
        await getFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
      ).deploy(MockETH.address, MockCrossDomainMessenger.address);
    });

    it("should allow changing the registry's authority", async function () {
      // Set the authority to a MockAuthority that always returns true.
      await L2_NovaRegistry.setAuthority(
        (
          await (await getFactory<MockAuthority__factory>("MockAuthority")).deploy()
        ).address
      );
    });

    it("should properly use constructor arguments", async function () {
      // Make sure the constructor params were properly entered.
      await L2_NovaRegistry.CROSS_DOMAIN_MESSENGER().should.eventually.equal(
        MockCrossDomainMessenger.address
      );

      await L2_NovaRegistry.ETH().should.eventually.equal(MockETH.address);
    });

    it("should allow connecting to an execution manager", async function () {
      await L2_NovaRegistry.connectExecutionManager(fakeExecutionManagerAddress);

      await L2_NovaRegistry.L1_NovaExecutionManagerAddress().should.eventually.equal(
        fakeExecutionManagerAddress
      );
    });
  });

  describe("requestExec", function () {
    it("allows making a simple request", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointBalance(MockETH, user.address);

      const { tx, execHash, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {});

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(weiOwed);

      // Assert that there are no input tokens attached.
      await L2_NovaRegistry.getRequestInputTokens(execHash).should.eventually.have.lengthOf(0);
    });

    it("allows making a simple request with one input token", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointBalance(MockETH, user.address);

      const { tx, execHash, inputTokens, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [{ l2Token: MockETH.address, amount: 5 }],
      });

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(weiOwed);

      // Assert that it properly ingested input tokens.
      assertInputTokensMatch(inputTokens, await L2_NovaRegistry.getRequestInputTokens(execHash));
    });

    it("allows a simple request with 2 input tokens", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointBalance(MockETH, user.address);

      const { tx, execHash, inputTokens, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1337 },
          { l2Token: MockETH.address, amount: 6969 },
        ],
      });

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(weiOwed);

      // Assert that it properly ingested input tokens.
      assertInputTokensMatch(inputTokens, await L2_NovaRegistry.getRequestInputTokens(execHash));
    });

    it("does not allow making a request with more than the max input tokens", async function () {
      await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: Array(
          // length == MAX_INPUT_TOKENS + 1
          (await L2_NovaRegistry.MAX_INPUT_TOKENS()).add(1).toNumber()
        ).fill({
          l2Token: MockETH.address,
          amount: 1,
        }),
      }).should.be.revertedWith("TOO_MANY_INPUTS");
    });
  });

  describe("requestExecWithTimeout", function () {
    it("should allow a simple request with minimum timeout", async function () {
      const unlockDelaySeconds = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      await snapshotGasCost(
        L2_NovaRegistry.requestExecWithTimeout(
          fakeStrategyAddress,
          "0x00",
          0,
          0,
          0,
          [],
          unlockDelaySeconds
        )
      );

      await L2_NovaRegistry.getRequestUnlockTimestamp(
        computeExecHash({
          nonce: await (await L2_NovaRegistry.systemNonce()).toNumber(),
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 0,
        })
      ).should.eventually.equal(
        (await ethers.provider.getBlock("latest")).timestamp + unlockDelaySeconds.toNumber()
      );
    });

    it("should revert if delay is too small", async function () {
      L2_NovaRegistry.requestExecWithTimeout(
        fakeStrategyAddress,
        "0x00",
        0,
        0,
        0,
        [],
        // 1 second less than the min delay
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).sub(1)
      ).should.be.revertedWith("DELAY_TOO_SMALL");
    });
  });

  describe("unlockTokens", function () {
    it("does not allow unlocking random requests", async function () {
      await L2_NovaRegistry.unlockTokens(
        ethers.utils.solidityKeccak256([], []),
        999999999999
      ).should.be.revertedWith("NOT_CREATOR");
    });

    it("does not allow unlocking requests with a small delay", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      await L2_NovaRegistry.unlockTokens(
        execHash,
        // 1 second less than the min delay
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).sub(1)
      ).should.be.revertedWith("DELAY_TOO_SMALL");
    });

    it("does not allow unlocking requests already scheduled to unlock", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      await L2_NovaRegistry.unlockTokens(
        execHash,
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
      );

      await L2_NovaRegistry.unlockTokens(
        execHash,
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
      ).should.be.revertedWith("UNLOCK_ALREADY_SCHEDULED");
    });

    it("does not allow unlocking requests with tokens removed", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay).should.be.revertedWith(
        "TOKENS_REMOVED"
      );
    });

    it("allows unlocking a valid request", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      await snapshotGasCost(
        L2_NovaRegistry.unlockTokens(execHash, await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS())
      );
    });

    it("allows unlocking a valid request with input tokens", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [{ l2Token: MockETH.address, amount: 1337 }],
      });

      await snapshotGasCost(
        L2_NovaRegistry.unlockTokens(execHash, await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS())
      );
    });
  });

  describe("withdrawTokens", function () {
    it("does not allow withdrawing from a random request", async function () {
      await L2_NovaRegistry.withdrawTokens(
        ethers.utils.solidityKeccak256([], [])
      ).should.be.revertedWith("NOT_UNLOCKED");
    });

    it("does not allow withdrawing from a request before the unlock delay", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(
        execHash,
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
      );

      await L2_NovaRegistry.withdrawTokens(execHash).should.be.revertedWith("NOT_UNLOCKED");
    });

    it("allows withdrawing tokens from a simple request", async function () {
      const [user] = signers;

      const { execHash, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);

      await snapshotGasCost(L2_NovaRegistry.withdrawTokens(execHash));

      // Balance should properly increase.
      await calcUserIncrease().should.eventually.equal(weiOwed);
    });

    it("allows withdrawing from a request with input tokens", async function () {
      const [user] = signers;

      const { execHash, weiOwed } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1337 },
          { l2Token: MockETH.address, amount: 6969 },
        ],
      });

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);

      await snapshotGasCost(L2_NovaRegistry.withdrawTokens(execHash));

      // Balance should properly increase.
      await calcUserIncrease().should.eventually.equal(weiOwed);
    });

    it("does not allow withdrawing after tokens removed", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.withdrawTokens(execHash).should.be.revertedWith("TOKENS_REMOVED");
    });
  });

  describe("relockTokens", function () {
    it("does not allow relocking random requests", async function () {
      await L2_NovaRegistry.relockTokens(
        ethers.utils.solidityKeccak256([], [])
      ).should.be.revertedWith("NOT_CREATOR");
    });

    it("does not allow relocking a request that is not scheduled to unlock", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      await L2_NovaRegistry.relockTokens(execHash).should.be.revertedWith("NO_UNLOCK_SCHEDULED");
    });

    it("does not allow relocking tokens on a requst with tokens removed", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      // Withdraw tokens so the request has no tokens.
      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.relockTokens(execHash).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("allows relocking tokens", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      await snapshotGasCost(L2_NovaRegistry.relockTokens(execHash));

      // Should be able to schedule an unlock again.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay).should.not.be.reverted;
    });
  });

  describe("speedUpRequest", function () {
    it("does not allow speeding up random requests", async function () {
      await L2_NovaRegistry.speedUpRequest(
        ethers.utils.solidityKeccak256([], []),
        999999999
      ).should.be.revertedWith("NOT_CREATOR");
    });

    it("does not allow speeding up rquests with tokens removed", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.speedUpRequest(execHash, unlockDelay).should.be.revertedWith(
        "TOKENS_REMOVED"
      );
    });

    it("does not allow slowing down a request", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      await L2_NovaRegistry.speedUpRequest(
        execHash,
        // 1 second less than the min delay
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).sub(1)
      ).should.be.revertedWith("LESS_THAN_PREVIOUS_GAS_PRICE");
    });

    it("does now allow speeding up a request scheduled to unlock soon", async function () {
      const { execHash, gasPrice } = await createRequest(MockETH, L2_NovaRegistry, {});

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(
        execHash,
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
      );

      await L2_NovaRegistry.speedUpRequest(execHash, gasPrice + 1).should.be.revertedWith(
        "UNLOCK_BEFORE_SWITCH"
      );
    });

    it("allows speeding up a request scheduled to unlock after switch", async function () {
      const { execHash, gasPrice, gasLimit } = await createRequest(MockETH, L2_NovaRegistry, {});

      // This unlock is scheduled far after the min delay
      // meaning the speedUpRequest switch will happen after
      // and the speedUpRequest call will NOT revert.
      await L2_NovaRegistry.unlockTokens(
        execHash,
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).mul(2)
      );

      await MockETH.approve(
        L2_NovaRegistry.address,
        // We're increasing gas price by 1x
        gasLimit
      );

      await snapshotGasCost(L2_NovaRegistry.speedUpRequest(execHash, gasPrice + 1));
    });

    it("allows speeding up a simple request", async function () {
      const { execHash, gasPrice, gasLimit } = await createRequest(MockETH, L2_NovaRegistry, {});

      const { tx } = await speedUpRequest(MockETH, L2_NovaRegistry, {
        execHash,
        gasPrice,
        gasLimit,
      });

      await snapshotGasCost(tx);
    });

    it("should not allow speeding up a request multiple times", async function () {
      const { execHash, gasPrice, gasLimit } = await createRequest(MockETH, L2_NovaRegistry, {});

      // Speed up the request once.
      await speedUpRequest(MockETH, L2_NovaRegistry, {
        execHash,
        gasPrice,
        gasLimit,
      });

      // Speeding up the request a second time should revert.
      await speedUpRequest(MockETH, L2_NovaRegistry, {
        execHash,
        gasPrice,
        gasLimit,
      }).should.be.revertedWith("ALREADY_SPED_UP");
    });
  });

  describe("execCompleted", function () {
    it("does not allow calling execCompleted if not messenger", async function () {
      await L2_NovaRegistry.execCompleted(
        ethers.utils.solidityKeccak256([], []),
        ethers.constants.AddressZero,
        false,
        0
      ).should.revertedWith("NOT_CROSS_DOMAIN_MESSENGER");
    });

    it("does not allow calling execCompleted if wrong cross domain sender", async function () {
      const [, rewardRecipient, randomUser] = signers;

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: ethers.utils.solidityKeccak256([], []),
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,

        // This causes the revert:
        sender: randomUser.address,
      }).should.be.revertedWith("WRONG_CROSS_DOMAIN_SENDER");
    });

    it("does not allow completing a random request", async function () {
      const [, rewardRecipient] = signers;

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: ethers.utils.solidityKeccak256([], []),
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      }).should.be.revertedWith("NOT_CREATED");
    });

    it("does not allow completing a request with tokens removed", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      await L2_NovaRegistry.withdrawTokens(execHash);

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      }).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("does not allow completing a resubmitted request with an alive uncle", async function () {
      const [, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit } = await createRequest(MockETH, L2_NovaRegistry, {});

      const { resubmittedExecHash } = await speedUpRequest(MockETH, L2_NovaRegistry, {
        execHash,
        gasPrice,
        gasLimit,
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: resubmittedExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      }).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("allows completing a simple request", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit, tip } = await createRequest(
        MockETH,
        L2_NovaRegistry,
        {}
      );

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);
      const [calcRecipientIncrease] = await checkpointBalance(MockETH, rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      await snapshotGasCost(tx);

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal((gasLimit - gasUsed) * gasPrice);

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(gasUsed * gasPrice + tip);
    });

    it("does not allow completing an already completed request", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      const executeRequest = () =>
        completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
          execHash,
          rewardRecipient: rewardRecipient.address,
          reverted: false,
          gasUsed: 50000,
        });

      // Execute the request once.
      await executeRequest();

      // Execute the same request a second time.
      await executeRequest().should.be.revertedWith("TOKENS_REMOVED");
    });

    it("allows completing a request that overflows gas usage", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasLimit, gasPrice, tip } = await createRequest(
        MockETH,
        L2_NovaRegistry,
        {}
      );

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);
      const [calcRecipientIncrease] = await checkpointBalance(MockETH, rewardRecipient.address);

      const { tx } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: gasLimit * 10000,
      });

      await snapshotGasCost(tx);

      // Ensure the balance of the user remained the same.
      await calcUserIncrease().should.eventually.equal(0);

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(
        // We use gasLimit instead of gasUsed here because gasUsed is over the limit.
        gasLimit * gasPrice + tip
      );
    });

    it("allows completing a request with input tokens", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasLimit, gasPrice, tip } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1337 },
          { l2Token: MockETH.address, amount: 6969 },
        ],
      });

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);
      const [calcRecipientIncrease] = await checkpointBalance(MockETH, rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      await snapshotGasCost(tx);

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal((gasLimit - gasUsed) * gasPrice);

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(
        // Input tokens are claimed using `claimInputTokens`, not sent right after.
        gasUsed * gasPrice + tip
      );
    });

    it("allows completing a reverted request with input tokens", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasLimit, gasPrice, tip } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1337 },
          { l2Token: MockETH.address, amount: 6969 },
        ],
      });

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);
      const [calcRecipientIncrease] = await checkpointBalance(MockETH, rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: true,
        gasUsed: 50000,
      });

      await snapshotGasCost(tx);

      // We need to simulate using Solidity's unsigned ints.
      const BNtip = BigNumber.from(tip);

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(
        gasUsed * gasPrice + BNtip.div(2).toNumber()
      );

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal(
        (gasLimit - gasUsed) * gasPrice +
          // Solidity rounds down so user may get slightly more as it uses the difference from the total.
          BNtip.sub(BNtip.div(2)).toNumber()
      );
    });

    it("allows completing an uncled request before it dies", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit, tip } = await createRequest(
        MockETH,
        L2_NovaRegistry,
        {}
      );

      const { uncleExecHash } = await speedUpRequest(MockETH, L2_NovaRegistry, {
        execHash,
        gasPrice,
        gasLimit,
      });

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);
      const [calcRecipientIncrease] = await checkpointBalance(MockETH, rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: uncleExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      await snapshotGasCost(tx);

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal((gasLimit - gasUsed) * gasPrice);

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(gasUsed * gasPrice + tip);
    });

    it("does not allow completing an uncled request after it dies", async function () {
      const [, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit } = await createRequest(MockETH, L2_NovaRegistry, {});

      const { uncleExecHash } = await speedUpRequest(MockETH, L2_NovaRegistry, {
        execHash,
        gasPrice,
        gasLimit,
      });

      // Forward time to be after the delay.
      await increaseTimeAndMine(await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS());
      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: uncleExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 0,
      }).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("does not allow completing a resubmitted request with an uncle that has no tokens", async function () {
      const [, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit } = await createRequest(MockETH, L2_NovaRegistry, {});

      const { resubmittedExecHash, uncleExecHash } = await speedUpRequest(
        MockETH,
        L2_NovaRegistry,
        {
          execHash,
          gasPrice,
          gasLimit,
        }
      );

      // Execute the uncle
      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: uncleExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      // Forward time to be after the delay.
      await increaseTimeAndMine(await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS());

      // Completing the resubmitted request should fail.
      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: resubmittedExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      }).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("allows completing a resubmitted request", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit, tip } = await createRequest(
        MockETH,
        L2_NovaRegistry,
        {}
      );

      const { resubmittedExecHash, newGasPrice } = await speedUpRequest(MockETH, L2_NovaRegistry, {
        execHash,
        gasPrice,
        gasLimit,
      });

      // Forward time to be after the delay.
      await increaseTimeAndMine(await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS());

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);
      const [calcRecipientIncrease] = await checkpointBalance(MockETH, rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: resubmittedExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      await snapshotGasCost(tx);

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal((gasLimit - gasUsed) * newGasPrice);

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(gasUsed * newGasPrice + tip);
    });
  });

  describe("claimInputTokens", function () {
    it("does not allow claiming a random request", async function () {
      await L2_NovaRegistry.claimInputTokens(
        ethers.utils.solidityKeccak256([], [])
      ).should.be.revertedWith("NO_RECIPIENT");
    });

    it("does not allow claiming a request not executed yet", async function () {
      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {});

      await L2_NovaRegistry.claimInputTokens(execHash).should.be.revertedWith("NO_RECIPIENT");
    });

    it("allows claiming input tokens for an executed request", async function () {
      const [, rewardRecipient] = signers;

      const { execHash, inputTokens } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1337 },
          { l2Token: MockETH.address, amount: 6969 },
        ],
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const [calcRecipientIncrease] = await checkpointBalance(MockETH, rewardRecipient.address);

      await snapshotGasCost(L2_NovaRegistry.claimInputTokens(execHash));

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(
        inputTokens.reduce((a, inputToken) => a + inputToken.amount, 0)
      );
    });

    it("allows claiming input tokens for a reverted request", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, inputTokens } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockETH.address, amount: 1337 },
          { l2Token: MockETH.address, amount: 6969 },
        ],
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: true,
        gasUsed: 50000,
      });

      const [calcUserIncrease] = await checkpointBalance(MockETH, user.address);

      await snapshotGasCost(L2_NovaRegistry.claimInputTokens(execHash));

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal(
        inputTokens.reduce((a, inputToken) => a + inputToken.amount, 0)
      );
    });

    it("does not allow claiming a request that is already claimed", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(MockETH, L2_NovaRegistry, {
        inputTokens: [{ l2Token: MockETH.address, amount: 420 }],
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      // Claim once.
      await L2_NovaRegistry.claimInputTokens(execHash);

      // Try claiming again.
      await L2_NovaRegistry.claimInputTokens(execHash).should.be.revertedWith("ALREADY_CLAIMED");
    });
  });
});
