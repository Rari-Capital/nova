import {
  computeExecHash,
  forceExecCompleted,
  getFactory,
  increaseTimeAndMine,
  snapshotGasCost,
} from "../../utils/testUtils";

import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  L2NovaRegistry__factory,
  MockCrossDomainMessenger,
  MockCrossDomainMessenger__factory,
  MockERC20,
  SimpleDSGuard,
  SimpleDSGuard__factory,
  MockERC20__factory,
  L2NovaRegistry,
  MockStrategy,
} from "../../typechain";
import { BigNumber } from "ethers";

describe("L2_NovaRegistry", function () {
  let signers: SignerWithAddress[];
  before(async () => {
    signers = await ethers.getSigners();
  });

  let L2_NovaRegistry: L2NovaRegistry;
  let SimpleDSGuard: SimpleDSGuard;

  /// Mocks
  let MockETH: MockERC20;
  let MockCrossDomainMessenger: MockCrossDomainMessenger;

  const fakeStrategyAddress = "0x4200000000000000000000000000000000000069";
  const fakeExecutionManagerAddress =
    "0xDeADBEEF1337caFEBAbE1337CacAfACe1337C0dE";

  describe("constructor/setup", function () {
    it("should properly deploy mocks", async function () {
      MockETH = await (
        await getFactory<MockERC20__factory>("MockERC20")
      ).deploy();

      MockCrossDomainMessenger = await (
        await getFactory<MockCrossDomainMessenger__factory>(
          "MockCrossDomainMessenger"
        )
      ).deploy();
    });

    it("should properly deploy the registry", async function () {
      L2_NovaRegistry = await (
        await getFactory<L2NovaRegistry__factory>("L2_NovaRegistry")
      ).deploy(MockETH.address, MockCrossDomainMessenger.address);
    });

    it("should allow connecting to an execution manager", async function () {
      await L2_NovaRegistry.connectExecutionManager(
        fakeExecutionManagerAddress
      );

      await L2_NovaRegistry.L1_NovaExecutionManagerAddress().should.eventually.equal(
        fakeExecutionManagerAddress
      );
    });

    it("should properly use constructor arguments", async function () {
      // Make sure the constructor params were properly entered.
      await L2_NovaRegistry.messenger().should.eventually.equal(
        MockCrossDomainMessenger.address
      );

      await L2_NovaRegistry.ETH().should.eventually.equal(MockETH.address);
    });

    it("should contain constants that match expected values", async function () {
      // Make sure that the MIN_UNLOCK_DELAY_SECONDS is as expected.
      await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS().should.eventually.equal(
        300
      );
    });

    describe("simpleDSGuard", function () {
      it("should properly deploy a SimpleDSGuard", async function () {
        SimpleDSGuard = await (
          await getFactory<SimpleDSGuard__factory>("SimpleDSGuard")
        ).deploy();
      });

      it("should properly init the owner", async function () {
        const [deployer] = signers;

        await SimpleDSGuard.owner().should.eventually.equal(deployer.address);
      });

      it("should properly permit authorization for specific functions", async function () {
        const [, nonDeployer] = signers;

        // Should enforce authorization before permitted.
        await L2_NovaRegistry.connect(nonDeployer)
          .requestExec(fakeStrategyAddress, "0x00", 0, 0, 0, [])
          .should.be.revertedWith("ds-auth-unauthorized");
        await L2_NovaRegistry.connect(nonDeployer)
          .requestExecWithTimeout(fakeStrategyAddress, "0x00", 0, 0, 0, [], 0)
          .should.be.revertedWith("ds-auth-unauthorized");
        await L2_NovaRegistry.connect(nonDeployer)
          .speedUpRequest(ethers.utils.solidityKeccak256([], []), 0)
          .should.be.revertedWith("ds-auth-unauthorized");
        await L2_NovaRegistry.connect(nonDeployer)
          .claimInputTokens(ethers.utils.solidityKeccak256([], []))
          .should.be.revertedWith("ds-auth-unauthorized");
        await L2_NovaRegistry.connect(nonDeployer)
          .unlockTokens(ethers.utils.solidityKeccak256([], []), 0)
          .should.be.revertedWith("ds-auth-unauthorized");
        await L2_NovaRegistry.connect(nonDeployer)
          .relockTokens(ethers.utils.solidityKeccak256([], []))
          .should.be.revertedWith("ds-auth-unauthorized");
        await L2_NovaRegistry.connect(nonDeployer)
          .withdrawTokens(ethers.utils.solidityKeccak256([], []))
          .should.be.revertedWith("ds-auth-unauthorized");
        await L2_NovaRegistry.connect(nonDeployer)
          .connectExecutionManager(ethers.constants.AddressZero)
          .should.be.revertedWith("ds-auth-unauthorized");

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash(
            "requestExec(address,bytes,uint256,uint256,uint256,(address,uint256)[])"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash(
            "requestExecWithTimeout(address,bytes,uint256,uint256,uint256,(address,uint256)[],uint256)"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash(
            "speedUpRequest(bytes32,uint256)"
          )
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("claimInputTokens(bytes32)")
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("unlockTokens(bytes32,uint256)")
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("relockTokens(bytes32)")
        );

        await SimpleDSGuard.permitAnySource(
          L2_NovaRegistry.interface.getSighash("withdrawTokens(bytes32)")
        );
      });

      it("should allow setting the owner to null", async function () {
        await SimpleDSGuard.setOwner(ethers.constants.AddressZero).should.not.be
          .reverted;

        await SimpleDSGuard.owner().should.eventually.equal(
          ethers.constants.AddressZero
        );
      });
    });

    describe("dsAuth", function () {
      it("should properly init the owner", async function () {
        const [deployer] = signers;

        await L2_NovaRegistry.owner().should.eventually.equal(deployer.address);
      });

      it("should allow connecting to the SimpleDSGuard", async function () {
        await L2_NovaRegistry.authority().should.eventually.equal(
          ethers.constants.AddressZero
        );

        await L2_NovaRegistry.setAuthority(SimpleDSGuard.address).should.not.be
          .reverted;

        await L2_NovaRegistry.authority().should.eventually.equal(
          SimpleDSGuard.address
        );
      });

      it("should allow setting the owner to null", async function () {
        await L2_NovaRegistry.setOwner(ethers.constants.AddressZero).should.not
          .be.reverted;

        await L2_NovaRegistry.owner().should.eventually.equal(
          ethers.constants.AddressZero
        );
      });
    });
  });

  describe("requestExec", function () {
    it("allows a simple request", async function () {
      const [user] = signers;

      const gasLimit = 420;
      const gasPrice = 69;
      const tip = 1;

      await MockETH.approve(L2_NovaRegistry.address, gasLimit * gasPrice + tip);

      await snapshotGasCost(
        L2_NovaRegistry.requestExec(
          fakeStrategyAddress,
          "0x00",
          gasLimit,
          gasPrice,
          tip,
          []
        )
      );

      const inputTokens = await L2_NovaRegistry.getRequestInputTokens(
        computeExecHash({
          nonce: 1,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice,
        })
      );

      inputTokens.length.should.equal(0);

      await MockETH.allowance(
        L2_NovaRegistry.address,
        user.address
      ).should.eventually.equal(0);
    });

    it("allows a simple request with one input token", async function () {
      const [user] = signers;

      const gasLimit = 100_000;
      const gasPrice = 10;
      const tip = 1337;

      const inputTokenAmount = 500;

      await MockETH.approve(
        L2_NovaRegistry.address,
        gasLimit * gasPrice + tip + inputTokenAmount
      );

      await snapshotGasCost(
        L2_NovaRegistry.requestExec(
          fakeStrategyAddress,
          "0x00",
          gasLimit,
          gasPrice,
          tip,
          [{ l2Token: MockETH.address, amount: inputTokenAmount }]
        )
      );

      const inputTokens = await L2_NovaRegistry.getRequestInputTokens(
        computeExecHash({
          nonce: 2,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice,
        })
      );

      inputTokens.length.should.equal(1);

      inputTokens[0].l2Token.should.equal(MockETH.address);
      inputTokens[0].amount.should.equal(inputTokenAmount);

      await MockETH.allowance(
        L2_NovaRegistry.address,
        user.address
      ).should.eventually.equal(0);
    });

    it("allows a simple request with 2 input tokens", async function () {
      const [user] = signers;

      const gasLimit = 100_000;
      const gasPrice = 10;
      const tip = 1337;

      const inputToken1Amount = 1000;
      const inputToken2Amount = 5000;

      await MockETH.approve(
        L2_NovaRegistry.address,
        gasLimit * gasPrice + tip + inputToken1Amount + inputToken2Amount
      );

      await snapshotGasCost(
        L2_NovaRegistry.requestExec(
          fakeStrategyAddress,
          "0x00",
          gasLimit,
          gasPrice,
          tip,
          [
            { l2Token: MockETH.address, amount: inputToken1Amount },
            { l2Token: MockETH.address, amount: inputToken2Amount },
          ]
        )
      );

      const inputTokens = await L2_NovaRegistry.getRequestInputTokens(
        computeExecHash({
          nonce: 3,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice,
        })
      );

      inputTokens.length.should.equal(2);

      inputTokens[0].l2Token.should.equal(MockETH.address);
      inputTokens[0].amount.should.equal(inputToken1Amount);

      inputTokens[1].l2Token.should.equal(MockETH.address);
      inputTokens[1].amount.should.equal(inputToken2Amount);

      await MockETH.allowance(
        L2_NovaRegistry.address,
        user.address
      ).should.eventually.equal(0);
    });

    it("does not allow for more than 5 input tokens", async function () {
      await L2_NovaRegistry.requestExec(fakeStrategyAddress, "0x00", 0, 0, 0, [
        { l2Token: ethers.constants.AddressZero, amount: 0 },
        { l2Token: ethers.constants.AddressZero, amount: 0 },
        { l2Token: ethers.constants.AddressZero, amount: 0 },
        { l2Token: ethers.constants.AddressZero, amount: 0 },
        { l2Token: ethers.constants.AddressZero, amount: 0 },
        { l2Token: ethers.constants.AddressZero, amount: 0 },
      ]).should.be.revertedWith("TOO_MANY_INPUTS");
    });
  });

  describe("requestExecWithTimeout", function () {
    it("should allow a simple request with minimum timeout", async function () {
      const unlockDelaySeconds =
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();

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
          nonce: 4,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 0,
        })
      ).should.eventually.equal(
        (await ethers.provider.getBlock("latest")).timestamp +
          unlockDelaySeconds.toNumber()
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
      await L2_NovaRegistry.unlockTokens(
        // This execHash is a real request we made in `allows a simple request`
        computeExecHash({
          nonce: 1,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 69,
        }),
        0
      ).should.be.revertedWith("DELAY_TOO_SMALL");
    });

    it("does not allow unlocking requests already scheduled to unlock", async function () {
      await L2_NovaRegistry.unlockTokens(
        // This execHash is a real request we made in `should allow a simple request with minimum timeout`
        computeExecHash({
          nonce: 4,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 0,
        }),
        0
      ).should.be.revertedWith("UNLOCK_ALREADY_SCHEDULED");
    });

    it("allows unlocking a valid request", async function () {
      await snapshotGasCost(
        L2_NovaRegistry.unlockTokens(
          // This is a valid execHash from `allows a simple request`
          computeExecHash({
            nonce: 1,
            strategy: fakeStrategyAddress,
            calldata: "0x00",
            gasPrice: 69,
          }),
          await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
        )
      );
    });

    it("allows unlocking a valid request with input tokens", async function () {
      await snapshotGasCost(
        L2_NovaRegistry.unlockTokens(
          // This is a valid execHash from `allows a simple request with 2 input tokens`
          computeExecHash({
            nonce: 3,
            strategy: fakeStrategyAddress,
            calldata: "0x00",
            gasPrice: 10,
          }),
          await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
        )
      );
    });
  });

  describe("relockTokens", function () {
    it("allows relocking tokens", async function () {
      const execHash = computeExecHash({
        // This execHash is a real request we made in `should allow a simple request with minimum timeout`
        nonce: 4,
        strategy: fakeStrategyAddress,
        calldata: "0x00",
        gasPrice: 0,
      });

      await snapshotGasCost(L2_NovaRegistry.relockTokens(execHash));

      await L2_NovaRegistry.unlockTokens(
        execHash,
        await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()
      ).should.not.be.reverted;
    });

    it("does not allow relocking random requests", async function () {
      await L2_NovaRegistry.relockTokens(
        ethers.utils.solidityKeccak256([], [])
      ).should.be.revertedWith("NOT_CREATOR");
    });
  });

  describe("withdrawTokens", function () {
    it("does not allow withdrawing from a random request", async function () {
      await L2_NovaRegistry.withdrawTokens(
        ethers.utils.solidityKeccak256([], [])
      ).should.be.revertedWith("NOT_UNLOCKED");
    });

    it("does not allow withdrawing from a request before the unlock delay", async function () {
      L2_NovaRegistry.withdrawTokens(
        // This is a valid execHash from `allows a simple request`
        computeExecHash({
          nonce: 1,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 69,
        })
      ).should.be.revertedWith("NOT_UNLOCKED");
    });

    it("allows withdrawing tokens from a simple request", async function () {
      const [user] = signers;

      await increaseTimeAndMine(
        // Forward time to be after the delay.
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).toNumber()
      );

      const balanceBefore = await MockETH.balanceOf(user.address);

      await snapshotGasCost(
        L2_NovaRegistry.withdrawTokens(
          computeExecHash({
            // This is a valid execHash from `allows a simple request`
            nonce: 1,
            strategy: fakeStrategyAddress,
            calldata: "0x00",
            gasPrice: 69,
          })
        )
      );

      const balanceAfter = await MockETH.balanceOf(user.address);

      // Balance should properly increase.
      balanceAfter.should.equal(
        // This is the gas limit, gas price and tip we used in `allows a simple request`
        balanceBefore.add(420 * 69 + 1)
      );
    });

    it("allows withdrawing from a request with input tokens", async function () {
      const [user] = signers;

      const balanceBefore = await MockETH.balanceOf(user.address);

      await snapshotGasCost(
        L2_NovaRegistry.withdrawTokens(
          // This is a valid execHash from `allows a simple request with 2 input tokens`
          computeExecHash({
            nonce: 3,
            strategy: fakeStrategyAddress,
            calldata: "0x00",
            gasPrice: 10,
          })
        )
      );

      const balanceAfter = await MockETH.balanceOf(user.address);

      // Balance should properly increase.
      balanceAfter.should.equal(
        // This is the gas limit, gas price, tip and input token amounts we used in `allows a simple request with 2 input tokens`
        balanceBefore.add(100_000 * 10 + 1337 + 1000 + 5000)
      );
    });

    it("does not allow withdrawing after tokens removed", async function () {
      await L2_NovaRegistry.withdrawTokens(
        // This is a valid execHash from `allows a simple request`
        computeExecHash({
          nonce: 1,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 69,
        })
      ).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("does not allow unlocking tokens after tokens removed", async function () {
      await L2_NovaRegistry.unlockTokens(
        computeExecHash({
          nonce: 1,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 69,
        }),
        999999999
      ).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("does not allow relocking tokens after tokens removed", async function () {
      await L2_NovaRegistry.relockTokens(
        computeExecHash({
          nonce: 1,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 69,
        })
      ).should.be.revertedWith("TOKENS_REMOVED");
    });
  });

  describe("speedUpRequest", function () {
    it("does not allow speeding up random requests", async function () {
      await L2_NovaRegistry.speedUpRequest(
        ethers.utils.solidityKeccak256([], []),
        999999999
      ).should.be.revertedWith("NOT_CREATOR");
    });

    it("does not allow speeding up withdrawn rquests", async function () {
      await L2_NovaRegistry.speedUpRequest(
        // This execHash is a real request we made in `allows a simple request`
        computeExecHash({
          nonce: 1,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 69,
        }),
        999999999
      ).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("does not allow slowing down a request", async function () {
      await L2_NovaRegistry.speedUpRequest(
        // This execHash is a real request we made in `allows a simple request with one input token`
        computeExecHash({
          nonce: 2,
          strategy: fakeStrategyAddress,
          calldata: "0x00",
          gasPrice: 10,
        }),
        9
      ).should.be.revertedWith("LESS_THAN_PREVIOUS_GAS_PRICE");
    });

    it("does now allow speeding up a request scheduled to unlock soon", async function () {
      const unlockDelay = await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS();
      const execHash = computeExecHash({
        // This execHash is a real request we made in `allows a simple request with one input token`
        nonce: 2,
        strategy: fakeStrategyAddress,
        calldata: "0x00",
        gasPrice: 10,
      });

      // Unlock the request's tokens with the min delay.
      await L2_NovaRegistry.unlockTokens(execHash, unlockDelay);

      // Forward time so the request is half way to expiring.
      await increaseTimeAndMine(unlockDelay.div(2).toNumber());

      await L2_NovaRegistry.speedUpRequest(execHash, 11).should.be.revertedWith(
        "UNLOCK_BEFORE_SWITCH"
      );
    });

    it("allows speeding up a simple request", async function () {
      const execHash = computeExecHash({
        // This execHash is a real request we made in `allows a simple request with one input token`
        nonce: 2,
        strategy: fakeStrategyAddress,
        calldata: "0x00",
        gasPrice: 10,
      });

      // Relock the tokens from the last test.
      await L2_NovaRegistry.relockTokens(execHash);

      await MockETH.approve(
        L2_NovaRegistry.address,
        // (gas price diff) * previousGasLimit
        (11 - 10) * 100_000
      );

      await snapshotGasCost(L2_NovaRegistry.speedUpRequest(execHash, 11));
    });
  });

  describe("execCompleted", function () {
    it("does not allow calling execCompleted if not messenger", async function () {
      console.log(ethers.utils.solidityKeccak256([], []));
      await L2_NovaRegistry.execCompleted(
        ethers.utils.solidityKeccak256([], []),
        ethers.constants.AddressZero,
        false,
        0
      ).should.revertedWith("OVM_XCHAIN: messenger contract unauthenticated");
    });

    it("does not allow completing a random request", async function () {
      const [user] = signers;

      await forceExecCompleted(
        fakeExecutionManagerAddress,
        MockCrossDomainMessenger,
        L2_NovaRegistry,

        {
          execHash: ethers.utils.solidityKeccak256([], []),

          rewardRecipient: user.address,

          reverted: false,

          gasUsed: 100,
        }
      ).should.be.revertedWith("NOT_CREATED");
    });

    it("does not allow completing a request with tokens removed", async function () {
      const [user] = signers;

      await forceExecCompleted(
        fakeExecutionManagerAddress,
        MockCrossDomainMessenger,
        L2_NovaRegistry,

        {
          execHash: computeExecHash({
            // This is a valid execHash from `allows a simple request`
            nonce: 1,
            strategy: fakeStrategyAddress,
            calldata: "0x00",
            gasPrice: 69,
          }),

          rewardRecipient: user.address,

          reverted: false,

          gasUsed: 100,
        }
      ).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("does now allow completing a resubmitted request with an alive uncle", async function () {
      const [, rewardRecipient] = signers;

      const execHash = computeExecHash({
        // This execHash is a resubmitted request that was uncled in `allows speeding up a simple request`
        nonce: 5,
        strategy: fakeStrategyAddress,
        calldata: "0x00",
        gasPrice: 11,
      });

      await forceExecCompleted(
        fakeExecutionManagerAddress,
        MockCrossDomainMessenger,
        L2_NovaRegistry,

        {
          execHash: execHash,

          rewardRecipient: rewardRecipient.address,

          reverted: true,

          gasUsed: 0,
        }
      ).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("allows completing a simple request", async function () {
      const [user, rewardRecipient] = signers;

      const gasLimit = 1337;
      const gasPrice = 69;
      const tip = 5;

      await MockETH.approve(L2_NovaRegistry.address, gasLimit * gasPrice + tip);

      L2_NovaRegistry.requestExec(
        fakeStrategyAddress,
        "0x00",
        gasLimit,
        gasPrice,
        tip,
        []
      );

      // Get the balances of the reward recipient and user before we call execCompleted.
      const preCompleteUserBalance = await MockETH.balanceOf(user.address);
      const preCompleteRecipientBalance = await MockETH.balanceOf(
        rewardRecipient.address
      );

      const fakeGasConsumed = 1000;
      await snapshotGasCost(
        forceExecCompleted(
          fakeExecutionManagerAddress,
          MockCrossDomainMessenger,
          L2_NovaRegistry,

          {
            execHash: computeExecHash({
              // Latest nonce.
              nonce: (await L2_NovaRegistry.systemNonce()).toNumber(),
              strategy: fakeStrategyAddress,
              calldata: "0x00",
              gasPrice,
            }),

            rewardRecipient: rewardRecipient.address,

            reverted: false,

            gasUsed: fakeGasConsumed,
          }
        )
      );

      // Ensure the balance of the user increased properly.
      await MockETH.balanceOf(user.address).should.eventually.equal(
        preCompleteUserBalance.add((gasLimit - fakeGasConsumed) * gasPrice)
      );

      // Ensure the balance of the reward recipient increased properly.
      await MockETH.balanceOf(rewardRecipient.address).should.eventually.equal(
        // Input tokens are claimed using `claimInputTokens`, not sent right after.
        preCompleteRecipientBalance.add(fakeGasConsumed * gasPrice).add(tip)
      );
    });

    it("allows completing a request that overflows gas usage", async function () {
      const [user, rewardRecipient] = signers;

      const gasLimit = 1337;
      const gasPrice = 69;
      const tip = 5;

      await MockETH.approve(L2_NovaRegistry.address, gasLimit * gasPrice + tip);

      L2_NovaRegistry.requestExec(
        fakeStrategyAddress,
        "0x00",
        gasLimit,
        gasPrice,
        tip,
        []
      );

      // Get the balances of the reward recipient and user before we call execCompleted.
      const preCompleteUserBalance = await MockETH.balanceOf(user.address);
      const preCompleteRecipientBalance = await MockETH.balanceOf(
        rewardRecipient.address
      );

      const fakeGasConsumed = gasLimit + 500;
      await snapshotGasCost(
        forceExecCompleted(
          fakeExecutionManagerAddress,
          MockCrossDomainMessenger,
          L2_NovaRegistry,

          {
            execHash: computeExecHash({
              // Latest nonce.
              nonce: (await L2_NovaRegistry.systemNonce()).toNumber(),
              strategy: fakeStrategyAddress,
              calldata: "0x00",
              gasPrice,
            }),

            rewardRecipient: rewardRecipient.address,

            reverted: false,

            gasUsed: fakeGasConsumed,
          }
        )
      );

      // Ensure the balance of the user remained the same.
      await MockETH.balanceOf(user.address).should.eventually.equal(
        preCompleteUserBalance
      );

      // Ensure the balance of the reward recipient increased properly.
      await MockETH.balanceOf(rewardRecipient.address).should.eventually.equal(
        // We use gasLimit instead of fakeGasConsumed here because fakeGasConsumed is over the limit.
        preCompleteRecipientBalance.add(gasLimit * gasPrice).add(tip)
      );
    });

    it("allows completing a request with input tokens", async function () {
      const [user, rewardRecipient] = signers;

      const gasLimit = 100_000;
      const gasPrice = 10;
      const tip = 1337;

      const inputTokenAmount = 500;

      await MockETH.approve(
        L2_NovaRegistry.address,
        gasLimit * gasPrice + tip + inputTokenAmount
      );

      await L2_NovaRegistry.requestExec(
        fakeStrategyAddress,
        "0x00",
        gasLimit,
        gasPrice,
        tip,
        [{ l2Token: MockETH.address, amount: inputTokenAmount }]
      );

      // Get the balances of the reward recipient and user before we call execCompleted.
      const preCompleteUserBalance = await MockETH.balanceOf(user.address);
      const preCompleteRecipientBalance = await MockETH.balanceOf(
        rewardRecipient.address
      );

      const fakeGasConsumed = 42069;
      await snapshotGasCost(
        forceExecCompleted(
          fakeExecutionManagerAddress,
          MockCrossDomainMessenger,
          L2_NovaRegistry,

          {
            execHash: computeExecHash({
              // Latest nonce.
              nonce: (await L2_NovaRegistry.systemNonce()).toNumber(),
              strategy: fakeStrategyAddress,
              calldata: "0x00",
              gasPrice,
            }),

            rewardRecipient: rewardRecipient.address,

            reverted: false,

            gasUsed: fakeGasConsumed,
          }
        )
      );

      // Ensure the balance of the user increased properly.
      await MockETH.balanceOf(user.address).should.eventually.equal(
        preCompleteUserBalance.add((gasLimit - fakeGasConsumed) * gasPrice)
      );

      // Ensure the balance of the reward recipient increased properly.
      await MockETH.balanceOf(rewardRecipient.address).should.eventually.equal(
        // Input tokens are claimed using `claimInputTokens`, not sent right after.
        preCompleteRecipientBalance.add(fakeGasConsumed * gasPrice).add(tip)
      );
    });

    it("allows completing a reverted request with input tokens", async function () {
      const [user, rewardRecipient] = signers;

      const gasLimit = 100_000;
      const gasPrice = 10;
      const tip = 1337;

      const inputTokenAmount = 510;

      await MockETH.approve(
        L2_NovaRegistry.address,
        gasLimit * gasPrice + tip + inputTokenAmount
      );

      await L2_NovaRegistry.requestExec(
        fakeStrategyAddress,
        "0x00",
        gasLimit,
        gasPrice,
        tip,
        [{ l2Token: MockETH.address, amount: inputTokenAmount }]
      );

      // Get the balances of the reward recipient and user before we call execCompleted.
      const preCompleteUserBalance = await MockETH.balanceOf(user.address);
      const preCompleteRecipientBalance = await MockETH.balanceOf(
        rewardRecipient.address
      );

      const fakeGasConsumed = 42069;
      await snapshotGasCost(
        forceExecCompleted(
          fakeExecutionManagerAddress,
          MockCrossDomainMessenger,
          L2_NovaRegistry,

          {
            execHash: computeExecHash({
              // Latest nonce.
              nonce: (await L2_NovaRegistry.systemNonce()).toNumber(),
              strategy: fakeStrategyAddress,
              calldata: "0x00",
              gasPrice,
            }),

            rewardRecipient: rewardRecipient.address,

            reverted: true,

            gasUsed: fakeGasConsumed,
          }
        )
      );

      // We need to simulate using Solidity's unsigned ints.
      const BNtip = BigNumber.from(tip);

      // Ensure the balance of the reward recipient increased properly.
      await MockETH.balanceOf(rewardRecipient.address).should.eventually.equal(
        preCompleteRecipientBalance
          .add(fakeGasConsumed * gasPrice)
          .add(BNtip.div(2))
      );

      // Ensure the balance of the user increased properly.
      await MockETH.balanceOf(user.address).should.eventually.equal(
        preCompleteUserBalance
          .add((gasLimit - fakeGasConsumed) * gasPrice)
          // Solidity rounds down so user may get slightly more as it uses the difference from the total.
          .add(BNtip.sub(BNtip.div(2)))
      );
    });

    it("allows completing an uncled request before it dies", async function () {
      const [, rewardRecipient] = signers;

      const fakeGasConsumed = 1;

      const execHash = computeExecHash({
        // This execHash is a request that was uncled in `allows speeding up a simple request`
        nonce: 2,
        strategy: fakeStrategyAddress,
        calldata: "0x00",
        gasPrice: 10,
      });

      await snapshotGasCost(
        forceExecCompleted(
          fakeExecutionManagerAddress,
          MockCrossDomainMessenger,
          L2_NovaRegistry,

          {
            execHash: execHash,

            rewardRecipient: rewardRecipient.address,

            reverted: true,

            gasUsed: fakeGasConsumed,
          }
        )
      );
    });

    it("does not allow completing a resubmitted request with an uncle that has no tokens", async function () {
      const [, rewardRecipient] = signers;

      const execHash = computeExecHash({
        // This execHash is a resubmitted request that was uncled in `allows speeding up a simple request`
        nonce: 5,
        strategy: fakeStrategyAddress,
        calldata: "0x00",
        gasPrice: 11,
      });

      await increaseTimeAndMine(
        // Forward time to be after the delay.
        (await L2_NovaRegistry.MIN_UNLOCK_DELAY_SECONDS()).toNumber()
      );

      await forceExecCompleted(
        fakeExecutionManagerAddress,
        MockCrossDomainMessenger,
        L2_NovaRegistry,

        {
          execHash: execHash,

          rewardRecipient: rewardRecipient.address,

          reverted: true,

          gasUsed: 0,
        }
      ).should.be.revertedWith("TOKENS_REMOVED");
    });

    it("allows completing a resubmitted request", async function () {});

    it("does not allow completing an already completed request", async function () {});
  });

  describe("claimInputTokens", function () {
    it("does not allow claiming a random request", async function () {
      await L2_NovaRegistry.claimInputTokens(
        ethers.utils.solidityKeccak256([], [])
      ).should.be.revertedWith("NO_RECIPIENT");
    });

    it("does not allow claiming a request not exected yet", async function () {});

    it("allows claiming input tokens for an executed request", async function () {});

    it("allows claiming input tokens for a reverted request", async function () {});

    it("does not allow claiming a request that is already claimed", async function () {});
  });
});
