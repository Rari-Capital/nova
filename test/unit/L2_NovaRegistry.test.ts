import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  getFactory,
  snapshotGasCost,
  fakeExecutionManagerAddress,
  createRequest,
  assertInputTokensMatch,
  fakeStrategyAddress,
  computeExecHash,
  increaseTimeAndMine,
  completeRequest,
  speedUpRequest,
  checkAllFunctionsForAuth,
  checkpointERC20Balance,
  checkpointETHBalance,
  getETHPaidForTx,
  latestBlockTimestamp,
} from "../../utils/testUtils";

import {
  L2NovaRegistry__factory,
  MockCrossDomainMessenger,
  MockCrossDomainMessenger__factory,
  MockERC20,
  MockAuthority__factory,
  MockERC20__factory,
  L2NovaRegistry,
} from "../../typechain";
import { BigNumber } from "@ethersproject/bignumber";

describe("L2_NovaRegistry", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  // Nova Contracts:
  let L2_NovaRegistry: L2NovaRegistry;

  /// Mocks:
  let MockCrossDomainMessenger: MockCrossDomainMessenger;
  let MockERC20: MockERC20;

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      MockCrossDomainMessenger = await (
        await getFactory<MockCrossDomainMessenger__factory>("MockCrossDomainMessenger")
      ).deploy();

      MockERC20 = await (await getFactory<MockERC20__factory>("MockERC20")).deploy();
    });

    it("should properly deploy the registry", async function () {
      L2_NovaRegistry = await (
        await getFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
      ).deploy(MockCrossDomainMessenger.address);
    });

    it("should not allow calling authed functions before permitted", async function () {
      const [, nonDeployer] = signers;

      await checkAllFunctionsForAuth(L2_NovaRegistry, nonDeployer, ["execCompleted"]);
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
      const { tx, execHash } = await createRequest(L2_NovaRegistry, {});

      await snapshotGasCost(tx);

      // Assert that there are no input tokens attached.
      await L2_NovaRegistry.getRequestInputTokens(execHash).should.eventually.have.lengthOf(0);
    });

    it("allows making a simple request with one input token", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointERC20Balance(MockERC20, user.address);

      const { tx, execHash, inputTokens } = await createRequest(L2_NovaRegistry, {
        inputTokens: [{ l2Token: MockERC20.address, amount: 5 }],
      });

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(5);

      // Assert that it properly ingested input tokens.
      assertInputTokensMatch(inputTokens, await L2_NovaRegistry.getRequestInputTokens(execHash));
    });

    it("allows a simple request with 2 input tokens", async function () {
      const [user] = signers;

      const [, calcBalanceDecrease] = await checkpointERC20Balance(MockERC20, user.address);

      const { tx, execHash, inputTokens } = await createRequest(L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockERC20.address, amount: 1337 },
          { l2Token: MockERC20.address, amount: 6969 },
        ],
      });

      await snapshotGasCost(tx);

      // Assert that it took the tokens we approved to it.
      await calcBalanceDecrease().should.eventually.equal(1337 + 6969);

      // Assert that it properly ingested input tokens.
      assertInputTokensMatch(inputTokens, await L2_NovaRegistry.getRequestInputTokens(execHash));
    });

    it("does not allow making a request with more than the max input tokens", async function () {
      await createRequest(L2_NovaRegistry, {
        inputTokens: Array(
          // length == MAX_INPUT_TOKENS + 1
          (await L2_NovaRegistry.MAX_INPUT_TOKENS()).add(1).toNumber()
        ).fill({
          l2Token: MockERC20.address,
          amount: 1,
        }),
      }).should.be.revertedWith("TOO_MANY_INPUTS");
    });

    it("does not allow underpaying", async function () {
      await createRequest(L2_NovaRegistry, { value: 1 }).should.be.revertedWith("BAD_ETH_VALUE");
    });
  });

  describe("requestExecWithTimeout", function () {
    it("should allow a simple request with minimum timeout", async function () {
      const gasPrice = 5;
      const gasLimit = 10;
      const calldata = "0x00";
      const strategy = fakeStrategyAddress;
      const unlockDelaySeconds = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      await snapshotGasCost(
        L2_NovaRegistry.requestExecWithTimeout(
          strategy,
          calldata,
          gasLimit,
          gasPrice,
          0,
          [],
          unlockDelaySeconds,
          { value: gasLimit * gasPrice }
        )
      );

      await L2_NovaRegistry.getRequestUnlockTimestamp(
        computeExecHash({
          nonce: await (await L2_NovaRegistry.systemNonce()).toNumber(),
          strategy,
          calldata,
          gasLimit,
          gasPrice,
        })
      ).should.eventually.equal((await latestBlockTimestamp()) + unlockDelaySeconds.toNumber());
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
      ).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("does not allow unlocking requests if not creator", async function () {
      const [, nonCreator] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await L2_NovaRegistry.connect(nonCreator)
        .unlockTokens(
          execHash,
          // 1 second less than the min delay
          (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).sub(1)
        )
        .should.be.revertedWith("NOT_CREATOR");
    });

    it("does not allow unlocking requests with a small delay", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await L2_NovaRegistry.unlockTokens(
        execHash,
        // 1 second less than the min delay
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).sub(1)
      ).should.be.revertedWith("DELAY_TOO_SMALL");
    });

    it("does not allow unlocking requests already scheduled to unlock", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

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
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay).should.be.revertedWith(
        "REQUEST_HAS_NO_TOKENS"
      );
    });

    it("allows unlocking a valid request", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await snapshotGasCost(
        L2_NovaRegistry.unlockTokens(execHash, await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS())
      );
    });

    it("allows unlocking a valid request with input tokens", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {
        inputTokens: [{ l2Token: MockERC20.address, amount: 1337 }],
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
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(
        execHash,
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
      );

      await L2_NovaRegistry.withdrawTokens(execHash).should.be.revertedWith("NOT_UNLOCKED");
    });

    it("allows withdrawing tokens from a simple request", async function () {
      const [user] = signers;

      const { execHash, weiOwed } = await createRequest(L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      const [calcUserIncrease] = await checkpointETHBalance(user.address);

      // Withdraw tokens from the request.
      const ethPaid = await getETHPaidForTx(
        snapshotGasCost(L2_NovaRegistry.withdrawTokens(execHash))
      );

      // Balance should properly increase.
      await calcUserIncrease().should.eventually.equal(weiOwed.sub(ethPaid));
    });

    it("allows withdrawing from a request with input tokens", async function () {
      const [user] = signers;

      const { execHash, weiOwed } = await createRequest(L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockERC20.address, amount: 1337 },
          { l2Token: MockERC20.address, amount: 6969 },
        ],
      });

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      const [calcUserETHIncrease] = await checkpointETHBalance(user.address);
      const [calcUserERC20Increase] = await checkpointERC20Balance(MockERC20, user.address);

      // Withdraw tokens from the request.
      const ethPaid = await getETHPaidForTx(
        snapshotGasCost(L2_NovaRegistry.withdrawTokens(execHash))
      );

      // Balance of ETH should properly increase.
      await calcUserETHIncrease().should.eventually.equal(weiOwed.sub(ethPaid));

      // Balance of ERC20 should properly increase.
      await calcUserERC20Increase().should.eventually.equal(1337 + 6969);
    });

    it("does not allow withdrawing after tokens removed", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.withdrawTokens(execHash).should.be.revertedWith(
        "REQUEST_HAS_NO_TOKENS"
      );
    });
  });

  describe("relockTokens", function () {
    it("does not allow relocking random requests", async function () {
      await L2_NovaRegistry.relockTokens(
        ethers.utils.solidityKeccak256([], [])
      ).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("does not allow relocking requests if not creator", async function () {
      const [, nonCreator] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await L2_NovaRegistry.connect(nonCreator)
        .relockTokens(execHash)
        .should.be.revertedWith("NOT_CREATOR");
    });

    it("does not allow relocking a request that is not scheduled to unlock", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await L2_NovaRegistry.relockTokens(execHash).should.be.revertedWith("NO_UNLOCK_SCHEDULED");
    });

    it("does not allow relocking tokens on a request with tokens removed", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      // Withdraw tokens so the request has no tokens.
      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.relockTokens(execHash).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("allows relocking tokens", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

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
      ).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("does not allow speeding up requests if not creator", async function () {
      const [, nonCreator] = signers;

      const { execHash, gasPrice } = await createRequest(L2_NovaRegistry, {});

      await L2_NovaRegistry.connect(nonCreator)
        .speedUpRequest(execHash, gasPrice + 1)
        .should.be.revertedWith("NOT_CREATOR");
    });

    it("does not allow speeding up requests with tokens removed", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      await L2_NovaRegistry.withdrawTokens(execHash);

      await L2_NovaRegistry.speedUpRequest(execHash, unlockDelay).should.be.revertedWith(
        "REQUEST_HAS_NO_TOKENS"
      );
    });

    it("does not allow slowing down a request", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await L2_NovaRegistry.speedUpRequest(
        execHash,
        // 1 second less than the min delay
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).sub(1)
      ).should.be.revertedWith("GAS_PRICE_MUST_BE_HIGHER");
    });

    it("does now allow speeding up a request scheduled to unlock soon", async function () {
      const { execHash, gasPrice } = await createRequest(L2_NovaRegistry, {});

      // Unlock tokens for the request.
      await L2_NovaRegistry.unlockTokens(
        execHash,
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
      );

      await L2_NovaRegistry.speedUpRequest(execHash, gasPrice + 1).should.be.revertedWith(
        "UNLOCK_BEFORE_SWITCH"
      );
    });

    it("does not allow underpaying", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await speedUpRequest(L2_NovaRegistry, {
        execHash,
        value: 1,
      }).should.be.revertedWith("BAD_ETH_VALUE");
    });

    it("allows speeding up a request scheduled to unlock after switch", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      // This unlock is scheduled far after the min delay
      // meaning the speedUpRequest switch will happen after
      // and the speedUpRequest call will NOT revert.
      await L2_NovaRegistry.unlockTokens(
        execHash,
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).mul(2)
      );

      const { tx } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      await snapshotGasCost(tx);
    });

    it("allows speeding up a simple request", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { tx } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      await snapshotGasCost(tx);
    });

    it("should not allow speeding up a request multiple times", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      // Speed up the request once.
      await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      // Speeding up the request a second time should revert.
      await speedUpRequest(L2_NovaRegistry, {
        execHash,
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
      }).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("does not allow completing a request with tokens removed", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

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
      }).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("does not allow completing a request with a null rewardRecipient", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: ethers.constants.AddressZero,
        reverted: false,
        gasUsed: 50000,
      }).should.be.revertedWith("INVALID_RECIPIENT");
    });

    it("does not allow completing a resubmitted request with an alive uncle", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { resubmittedExecHash } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: resubmittedExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      }).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("allows completing a simple request", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit, tip } = await createRequest(L2_NovaRegistry, {});

      const [calcUserIncrease] = await checkpointETHBalance(user.address);
      const [calcRecipientIncrease] = await checkpointETHBalance(rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const ethPaid = await getETHPaidForTx(snapshotGasCost(tx));

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal(
        (gasLimit - gasUsed) * gasPrice - ethPaid.toNumber()
      );

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(gasUsed * gasPrice + tip);
    });

    it("does not allow completing an already completed request", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

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
      await executeRequest().should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("allows completing a request that overflows gas usage", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasLimit, gasPrice, tip } = await createRequest(L2_NovaRegistry, {});

      const [calcUserIncrease] = await checkpointETHBalance(user.address);
      const [calcRecipientIncrease] = await checkpointETHBalance(rewardRecipient.address);

      const { tx } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: gasLimit * 10000,
      });

      const ethPaid = await getETHPaidForTx(snapshotGasCost(tx));

      // Ensure the balance of the user remained the same (besides gas paid to complete the request).
      await calcUserIncrease().should.eventually.equal(0 - ethPaid.toNumber());

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(
        // We use gasLimit instead of gasUsed here because gasUsed is over the limit.
        gasLimit * gasPrice + tip
      );
    });

    it("allows completing a request with input tokens", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasLimit, gasPrice, tip } = await createRequest(L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockERC20.address, amount: 1337 },
          { l2Token: MockERC20.address, amount: 6969 },
        ],
      });

      const [calcUserIncrease] = await checkpointETHBalance(user.address);
      const [calcRecipientIncrease] = await checkpointETHBalance(rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const ethPaid = await getETHPaidForTx(snapshotGasCost(tx));

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal(
        (gasLimit - gasUsed) * gasPrice - ethPaid.toNumber()
      );

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(gasUsed * gasPrice + tip);
    });

    it("allows completing a reverted request with input tokens", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasLimit, gasPrice, tip } = await createRequest(L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockERC20.address, amount: 1337 },
          { l2Token: MockERC20.address, amount: 6969 },
        ],
      });

      const [calcUserIncrease] = await checkpointETHBalance(user.address);
      const [calcRecipientIncrease] = await checkpointETHBalance(rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: true,
        gasUsed: 50000,
      });

      const ethPaid = await getETHPaidForTx(snapshotGasCost(tx));

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal(
        (gasLimit - gasUsed) * gasPrice + tip - ethPaid.toNumber()
      );

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(gasUsed * gasPrice);
    });

    it("allows completing an uncled request before it dies", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasPrice, gasLimit, tip } = await createRequest(L2_NovaRegistry, {});

      const { uncleExecHash } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      const [calcUserIncrease] = await checkpointETHBalance(user.address);
      const [calcRecipientIncrease] = await checkpointETHBalance(rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: uncleExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const ethPaid = await getETHPaidForTx(snapshotGasCost(tx));

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal(
        (gasLimit - gasUsed) * gasPrice - ethPaid.toNumber()
      );

      // Ensure the balance of the reward recipient increased properly.
      await calcRecipientIncrease().should.eventually.equal(gasUsed * gasPrice + tip);
    });

    it("does not allow completing an uncled request after it dies", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { uncleExecHash } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      // Forward time to be after the delay.
      await increaseTimeAndMine(await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS());
      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: uncleExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 0,
      }).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("does not allow completing a resubmitted request with an uncle that has no tokens", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { resubmittedExecHash, uncleExecHash } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

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
      }).should.be.revertedWith("REQUEST_HAS_NO_TOKENS");
    });

    it("allows completing a resubmitted request", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash, gasLimit, tip } = await createRequest(L2_NovaRegistry, {});

      const { resubmittedExecHash, newGasPrice } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      // Forward time to be after the delay.
      await increaseTimeAndMine(await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS());

      const [calcUserIncrease] = await checkpointETHBalance(user.address);
      const [calcRecipientIncrease] = await checkpointETHBalance(rewardRecipient.address);

      const { tx, gasUsed } = await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash: resubmittedExecHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const ethPaid = await getETHPaidForTx(snapshotGasCost(tx));

      // Ensure the balance of the user increased properly.
      await calcUserIncrease().should.eventually.equal(
        // Have to use BigNumbers here or else equal will complain that the number is too big.
        BigNumber.from(gasLimit).sub(gasUsed).mul(newGasPrice).sub(ethPaid.toNumber())
      );

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
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await L2_NovaRegistry.claimInputTokens(execHash).should.be.revertedWith("NO_RECIPIENT");
    });

    it("allows claiming input tokens for an executed request", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockERC20.address, amount: 1337 },
          { l2Token: MockERC20.address, amount: 6969 },
        ],
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const [calcRecipientERC20Increase] = await checkpointERC20Balance(
        MockERC20,
        rewardRecipient.address
      );

      await snapshotGasCost(L2_NovaRegistry.claimInputTokens(execHash));

      // Ensure the balance of the reward recipient increased properly.
      calcRecipientERC20Increase().should.eventually.equal(1337 + 6969);
    });

    it("allows claiming input tokens for a reverted request", async function () {
      const [user, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {
        inputTokens: [
          { l2Token: MockERC20.address, amount: 1337 },
          { l2Token: MockERC20.address, amount: 6969 },
        ],
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: true,
        gasUsed: 50000,
      });

      const [calcUserERC20Increase] = await checkpointERC20Balance(MockERC20, user.address);

      await snapshotGasCost(L2_NovaRegistry.claimInputTokens(execHash));

      // Ensure the balance of the user increased properly.
      calcUserERC20Increase().should.eventually.equal(1337 + 6969);
    });

    it("does not allow claiming a request that is already claimed", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {
        inputTokens: [{ l2Token: MockERC20.address, amount: 420 }],
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

  describe("hasTokens", function () {
    it("should return false if the request is executed", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(execHash);

      requestHasTokens.should.equal(false);
      changeTimestamp.should.equal(0);
    });

    it("should return false for a dead uncle", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      // Forward time to be after the delay.
      await increaseTimeAndMine(await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS());

      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(execHash);

      requestHasTokens.should.equal(false);
      changeTimestamp.should.equal(0);
    });

    it("should return true for an alive uncle", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(execHash);

      requestHasTokens.should.equal(true);
      changeTimestamp.should.equal(
        (await latestBlockTimestamp()) +
          (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).toNumber()
      );
    });

    it("should return true for a normal request", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(execHash);

      requestHasTokens.should.equal(true);
      changeTimestamp.should.equal(0);
    });

    it("should return false for a nonexistent request", async function () {
      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(
        ethers.utils.solidityKeccak256([], [])
      );

      requestHasTokens.should.equal(false);
      changeTimestamp.should.equal(0);
    });

    it("should return false for a resubmitted request with an uncle that died early", async function () {
      const [, rewardRecipient] = signers;

      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { resubmittedExecHash } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      await completeRequest(MockCrossDomainMessenger, L2_NovaRegistry, {
        execHash,
        rewardRecipient: rewardRecipient.address,
        reverted: false,
        gasUsed: 50000,
      });

      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(
        resubmittedExecHash
      );

      requestHasTokens.should.equal(false);
      changeTimestamp.should.equal(0);
    });

    it("should return false for a resubmitted request waiting for tokens", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { resubmittedExecHash } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(
        resubmittedExecHash
      );

      requestHasTokens.should.equal(false);
      changeTimestamp.should.equal(
        (await latestBlockTimestamp()) +
          (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).toNumber()
      );
    });

    it("should return true for a resubmitted request with an uncle that died correctly", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { resubmittedExecHash } = await speedUpRequest(L2_NovaRegistry, {
        execHash,
      });

      // Forward time to be after the delay.
      await increaseTimeAndMine(await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS());

      const { requestHasTokens, changeTimestamp } = await L2_NovaRegistry.hasTokens(
        resubmittedExecHash
      );

      requestHasTokens.should.equal(true);
      changeTimestamp.should.equal(0);
    });
  });

  describe("areTokensUnlocked", function () {
    it("returns false for a nonexistent request", async function () {
      const { unlocked, changeTimestamp } = await L2_NovaRegistry.areTokensUnlocked(
        ethers.utils.solidityKeccak256([], [])
      );

      unlocked.should.equal(false);
      changeTimestamp.should.equal(0);
    });

    it("returns false for a request that exists but not unlocked", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const { unlocked, changeTimestamp } = await L2_NovaRegistry.areTokensUnlocked(execHash);

      unlocked.should.equal(false);
      changeTimestamp.should.equal(0);
    });

    it("returns false for a request that has an unlock scheduled but not reached", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      const { unlocked, changeTimestamp } = await L2_NovaRegistry.areTokensUnlocked(execHash);

      unlocked.should.equal(false);
      changeTimestamp.should.equal((await latestBlockTimestamp()) + unlockDelay.toNumber());
    });

    it("returns true for a request that has an unlock reached", async function () {
      const { execHash } = await createRequest(L2_NovaRegistry, {});

      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

      // Unlock the request.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time to be after the delay.
      await increaseTimeAndMine(unlockDelay);

      const { unlocked, changeTimestamp } = await L2_NovaRegistry.areTokensUnlocked(execHash);

      unlocked.should.equal(true);
      changeTimestamp.should.equal(0);
    });
  });
});
