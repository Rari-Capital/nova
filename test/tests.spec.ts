import chai from "chai";
import chaiAsPromised from "chai-as-promised";

import { getContractFactory } from "@eth-optimism/contracts";

import { Watcher } from "@eth-optimism/core-utils";

import {
  createFactory,
  createTestWallet,
  wait,
  waitForL1ToL2Tx,
} from "../utils/testUtils";
import { ethers, network } from "hardhat";

import {
  L2NovaRegistry__factory,
  L2NovaRegistry,
  ERC20,
  MockOVMETH__factory,
  MockCrossDomainMessenger__factory,
} from "../typechain";
import { L1NovaExecutionManager } from "../typechain/L1NovaExecutionManager";
import { L1NovaExecutionManager__factory } from "../typechain/factories/L1NovaExecutionManager__factory";
import { MockContract__factory } from "../typechain/factories/MockContract__factory";
import { Wallet } from "@ethersproject/wallet";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockContract } from "../typechain/MockContract";

chai.use(chaiAsPromised);
chai.should();

function computeExecHash({
  nonce,
  strategy,
  calldata,
  gasPrice,
}: {
  nonce: number;
  strategy: string;
  calldata: string;
  gasPrice: number;
}) {
  return ethers.utils.solidityKeccak256(
    ["uint72", "address", "bytes", "uint256"],
    [nonce, strategy, calldata, gasPrice]
  );
}

describe("Nova", function () {
  let l1Wallet: Wallet | SignerWithAddress;
  let l2Wallet: Wallet | SignerWithAddress;

  // Cross layer watcher:
  let watcher: Watcher;

  // Nova specific contracts:
  let l1_NovaExecutionManager: L1NovaExecutionManager;
  let l2_NovaRegistry: L2NovaRegistry;

  // OVM Contracts:
  let OVM_ETH: ERC20;

  before(async () => {
    l1Wallet = network.ovm
      ? createTestWallet("http://localhost:9545")
      : (await ethers.getSigners())[0];
    l2Wallet = network.ovm
      ? createTestWallet("http://localhost:8545")
      : (await ethers.getSigners())[0];

    // Get us some OVM_ETH:
    if (network.ovm) {
      OVM_ETH = getContractFactory("OVM_ETH")
        .connect(l2Wallet)
        .attach("0x4200000000000000000000000000000000000006") as ERC20;

      const OVM_L1ETHGateway = getContractFactory("OVM_L1ETHGateway")
        .connect(l1Wallet)
        .attach("0x998abeb3e57409262ae5b751f60747921b33613e");

      // Create a watcher:
      watcher = new Watcher({
        l1: {
          provider: l1Wallet.provider,
          messengerAddress: "0x59b670e9fA9D0A427751Af201D676719a970857b",
        },
        l2: {
          provider: l2Wallet.provider,
          messengerAddress: "0x4200000000000000000000000000000000000007",
        },
      });

      // Deposit ETH to our L2 wallet:
      await waitForL1ToL2Tx(
        OVM_L1ETHGateway.connect(l1Wallet).depositTo(l2Wallet.address, {
          value: ethers.utils.parseEther("5"),
        }),
        watcher
      );
    } else {
      OVM_ETH = await createFactory<MockOVMETH__factory>(
        false,
        "MockOVMETH",
        "mocks/"
      )
        .connect(l2Wallet)
        .deploy();

      const MockCrossDomainMessenger = await createFactory<MockCrossDomainMessenger__factory>(
        false,
        "MockCrossDomainMessenger",
        "mocks/"
      )
        .connect(l1Wallet)
        .deploy();

      // We don't actually use this watcher it's just a way to pass down the mssenger address.
      watcher = new Watcher({
        l1: {
          provider: l1Wallet.provider,
          messengerAddress: MockCrossDomainMessenger.address,
        },
        l2: {
          provider: l2Wallet.provider,
          messengerAddress: MockCrossDomainMessenger.address,
        },
      });
    }

    // Deploy registry on L2.
    l2_NovaRegistry = await createFactory<L2NovaRegistry__factory>(
      network.ovm,
      "L2_NovaRegistry"
    )
      .connect(l2Wallet)
      .deploy(OVM_ETH.address, watcher.l2.messengerAddress);

    // Deploy execution manager on L1.
    l1_NovaExecutionManager = await createFactory<L1NovaExecutionManager__factory>(
      false,
      "L1_NovaExecutionManager"
    )
      .connect(l1Wallet)
      .deploy(l2_NovaRegistry.address, watcher.l1.messengerAddress);

    // Tell the registry about the execution manager's L1 address.
    await wait(
      l2_NovaRegistry.connectExecutionManager(l1_NovaExecutionManager.address)
    );
  });

  describe("L2_NovaRegistry", function () {
    describe("requestExec", function () {
      it("should allow a valid request", async function () {
        // Approve 100 wei as gas for the first request.
        await wait(OVM_ETH.approve(l2_NovaRegistry.address, 100));

        // This will not revert because we have approved just enough wei.
        await l2_NovaRegistry
          .connect(l2Wallet)
          .requestExec(
            "0x0000000000000000000000000000000000000000",
            "0x00",
            10,
            10,
            [],
            []
          )
          .should.emit(l2_NovaRegistry, "Request")
          .withArgs(
            computeExecHash({
              nonce: 1,
              strategy: "0x0000000000000000000000000000000000000000",
              calldata: "0x00",
              gasPrice: 10,
            }),
            "0x0000000000000000000000000000000000000000"
          );

        // Ensure the registry transferred in the ETH.
        await OVM_ETH.balanceOf(
          l2_NovaRegistry.address
        ).should.eventually.equal(100);
      });

      it("should revert if not enough wei is approved to pay for gas", async function () {
        // This should revert as the 100 wei was already taken by the previous request.
        await l2_NovaRegistry
          .connect(l2Wallet)
          .requestExec(
            "0x0000000000000000000000000000000000000000",
            "0x00",
            10,
            10,
            [],
            []
          ).should.be.reverted;
      });
    });
  });

  describe("L1_NovaExecutionManager", function () {
    it("execCompletedMessageBytesLength should be correct", async function () {
      const execCompletedMessageBytesLength = (
        await l1_NovaExecutionManager.execCompletedMessageBytesLength()
      ).toNumber();

      // Encode a call to execCompleted
      const bytes = l2_NovaRegistry.interface.encodeFunctionData(
        "execCompleted",
        [
          ethers.utils.keccak256("0x00"),
          "0x0000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000",
          0,
          false,
        ]
      );

      // Length of the encoded data in a bytes array.
      const bytesLength = (bytes.length - 2) / 2;

      // The `execCompletedMessageBytesLength` variable should equal the proper bytesLength we just computed.
      execCompletedMessageBytesLength.should.equal(bytesLength);
    });

    describe("exec", function () {
      let mockContract: MockContract;

      before(async function () {
        mockContract = await createFactory<MockContract__factory>(
          false,
          "MockContract",
          "mocks/"
        )
          .connect(l1Wallet)
          .deploy();
      });

      it("should properly execute a request that soft reverts", async function () {
        await l1_NovaExecutionManager.exec(
          // Nonce
          0,
          // Strategy
          mockContract.address,
          // Calldata
          mockContract.interface.encodeFunctionData("thisFunctionWillRevert"),
          // xDomain Gas Limit
          100000
        ).should.not.be.reverted;
      });

      it("shouldn't allow double executing", async function () {
        await l1_NovaExecutionManager.exec(
          // Nonce
          0,
          // Strategy
          mockContract.address,
          // Calldata
          mockContract.interface.encodeFunctionData("thisFunctionWillRevert"),
          // xDomain Gas Limit
          100000
        ).should.be.reverted;
      });

      it("should properly handle a hard revert", async function () {
        await l1_NovaExecutionManager.exec(
          // Nonce
          0,
          // Strategy
          mockContract.address,
          // Calldata
          mockContract.interface.encodeFunctionData(
            "thisFunctionWillHardRevert"
          ),
          // xDomain Gas Limit
          100000
        ).should.be.reverted;
      });
    });
  });
});
