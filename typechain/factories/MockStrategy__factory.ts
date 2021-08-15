/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import {
  Signer,
  utils,
  BigNumberish,
  Contract,
  ContractFactory,
  Overrides,
} from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type { MockStrategy, MockStrategyInterface } from "../MockStrategy";

const _abi = [
  {
    inputs: [
      {
        internalType: "contract L1_NovaExecutionManager",
        name: "_executionManager",
        type: "address",
      },
      {
        internalType: "enum L1_NovaExecutionManager.StrategyRiskLevel",
        name: "_riskLevel",
        type: "uint8",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [],
    name: "ReentrancyFailed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [],
    name: "StealRelayerTokensFailed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [],
    name: "TransferFromRelayerFailedWithUnsupportedRiskLevel",
    type: "event",
  },
  {
    inputs: [],
    name: "counter",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "enum L1_NovaExecutionManager.StrategyRiskLevel",
        name: "_riskLevel",
        type: "uint8",
      },
    ],
    name: "registerSelfAsStrategy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "thisFunctionWillEmulateAMaliciousExternalContractTryingToStealRelayerTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "thisFunctionWillHardRevert",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "thisFunctionWillModifyState",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "thisFunctionWillNotRevert",
    outputs: [],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [],
    name: "thisFunctionWillRevert",
    outputs: [],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "thisFunctionWillTransferFromRelayer",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "thisFunctionWillTransferFromRelayerAndExpectUnsupportedRiskLevel",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "thisFunctionWillTryToReenter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x60c0604052600160005534801561001557600080fd5b50604051610eb9380380610eb98339818101604052604081101561003857600080fd5b508051602090910151600081600281111561004f57fe5b146100bf5760405163148db7b560e01b81526001600160a01b0383169063148db7b59083906004018082600281111561008457fe5b8152602001915050600060405180830381600087803b1580156100a657600080fd5b505af11580156100ba573d6000803e3d6000fd5b505050505b6001600160601b0319606083901b1660a05260405182906100df90610125565b6001600160a01b03909116815260405190819003602001906000f08015801561010c573d6000803e3d6000fd5b5060601b6001600160601b031916608052506101329050565b61035980610b6083390190565b60805160601c60a05160601c6109f161016f600039806101d4528061028f5280610307528061059f528061075752508061080452506109f16000f3fe608060405234801561001057600080fd5b50600436106100be5760003560e01c806361bc221a116100765780637ec662fb1161005b5780637ec662fb14610158578063976e9fc314610191578063a6d22b42146101ca576100be565b806361bc221a146101365780637261a02414610150576100be565b80633cdc8117116100a75780633cdc8117146100ed5780634d339b8f1461012657806355136eb41461012e576100be565b80630db12470146100c3578063148db7b5146100cd575b600080fd5b6100cb6101d2565b005b6100cb600480360360208110156100e357600080fd5b503560ff16610252565b6100cb6004803603604081101561010357600080fd5b5073ffffffffffffffffffffffffffffffffffffffff8135169060200135610305565b6100cb6104af565b6100cb610516565b61013e61074f565b60408051918252519081900360200190f35b6100cb61074d565b6100cb6004803603604081101561016e57600080fd5b5073ffffffffffffffffffffffffffffffffffffffff8135169060200135610755565b6100cb600480360360408110156101a757600080fd5b5073ffffffffffffffffffffffffffffffffffffffff8135169060200135610802565b6100cb6108f1565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663b7daba366040518163ffffffff1660e01b815260040160006040518083038186803b15801561023857600080fd5b505afa15801561024c573d6000803e3d6000fd5b50505050565b6040517f148db7b500000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000169063148db7b5908390600401808260028111156102c857fe5b8152602001915050600060405180830381600087803b1580156102ea57600080fd5b505af11580156102fe573d6000803e3d6000fd5b5050505050565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16633996e60a83836040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050600060405180830381600087803b15801561039657600080fd5b505af19250505080156103a7575060015b6104ab576103b3610902565b806103be57506104a1565b7fe2508fa01b9e4f23e3459c99dd3a283c74b16113047048a4a31022a2cbe2348e816040516020018082805190602001908083835b6020831061043057805182527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe090920191602091820191016103f3565b6001836020036101000a03801982511681845116808217855250505050505090500191505060405160208183030381529060405280519060200120141561049b576040517f73b0330f122ad3da06f5940b2b8c715238a5116cd2dc18b6b1615f3110aaadbc90600090a15b506104ab565b3d6000803e3d6000fd5b5050565b604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601260248201527f4e6f742061206861726420726576657274210000000000000000000000000000604482015290519081900360640190fd5b60408051600080825260208201928390527f59f7cdfd00000000000000000000000000000000000000000000000000000000835260248201818152604483018290526084830182905260a48301829052670de0b6b3a764000060c4840181905260c060648501908152845160e4860181905273ffffffffffffffffffffffffffffffffffffffff7f000000000000000000000000000000000000000000000000000000000000000016966359f7cdfd9686959094869485949193909161010488019190808383895b838110156105f65781810151838201526020016105de565b50505050905090810190601f1680156106235780820380516001836020036101000a031916815260200191505b50975050505050505050600060405180830381600087803b15801561064757600080fd5b505af1925050508015610658575060015b61074d57610664610902565b8061066f57506104a1565b7e711abff3c37e7c30f3e913ce7850c25aa3cc8a57fd1991769a71b2483c2333816040516020018082805190602001908083835b602083106106e057805182527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe090920191602091820191016106a3565b6001836020036101000a03801982511681845116808217855250505050505090500191505060405160208183030381529060405280519060200120141561074b576040517fe7845562ae9b7d11c87f4dc6a2ef0ff4d398fc954bb32c71d7c96ca4f34ae5bc90600090a15b505b565b60005481565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16633996e60a83836040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050600060405180830381600087803b1580156107e657600080fd5b505af11580156107fa573d6000803e3d6000fd5b505050505050565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff166367150c0e83836040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050602060405180830381600087803b15801561089357600080fd5b505af11580156108a7573d6000803e3d6000fd5b505050506040513d60208110156108bd57600080fd5b5051156104ab576040517fb598da545be582b79b3ce091463b8f4fb61dd8c05fd6448421b635ccc140507e90600090a15050565b600080546001019055565b60e01c90565b600060443d1015610912576109e1565b600481823e6308c379a061092682516108fc565b14610930576109e1565b6040517ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3d016004823e80513d67ffffffffffffffff816024840111818411171561097e57505050506109e1565b8284019250825191508082111561099857505050506109e1565b503d830160208284010111156109b0575050506109e1565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01681016020016040529150505b9056fea164736f6c6343000706000a60a060405234801561001057600080fd5b506040516103593803806103598339818101604052602081101561003357600080fd5b5051606081901b6001600160601b0319166080526001600160a01b03166102f361006660003980608152506102f36000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c806367150c0e14610030575b600080fd5b6100696004803603604081101561004657600080fd5b5073ffffffffffffffffffffffffffffffffffffffff813516906020013561007d565b604080519115158252519081900360200190f35b60007f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16633996e60a84846040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050600060405180830381600087803b15801561011057600080fd5b505af1925050508015610121575060015b6101f85761012d610204565b8061013857506101ee565b7f0da2cef0baa299da43eb01d5677caedf73b609d06e98f70950db32c90f012a32816040516020018082805190602001908083835b602083106101aa57805182527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0909201916020918201910161016d565b6001836020036101000a03801982511681845116808217855250505050505090500191505060405160208183030381529060405280519060200120149150506101f8565b3d6000803e3d6000fd5b92915050565b60e01c90565b600060443d1015610214576102e3565b600481823e6308c379a061022882516101fe565b14610232576102e3565b6040517ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3d016004823e80513d67ffffffffffffffff816024840111818411171561028057505050506102e3565b8284019250825191508082111561029a57505050506102e3565b503d830160208284010111156102b2575050506102e3565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01681016020016040529150505b9056fea164736f6c6343000706000a";

export class MockStrategy__factory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    _executionManager: string,
    _riskLevel: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<MockStrategy> {
    return super.deploy(
      _executionManager,
      _riskLevel,
      overrides || {}
    ) as Promise<MockStrategy>;
  }
  getDeployTransaction(
    _executionManager: string,
    _riskLevel: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(
      _executionManager,
      _riskLevel,
      overrides || {}
    );
  }
  attach(address: string): MockStrategy {
    return super.attach(address) as MockStrategy;
  }
  connect(signer: Signer): MockStrategy__factory {
    return super.connect(signer) as MockStrategy__factory;
  }
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): MockStrategyInterface {
    return new utils.Interface(_abi) as MockStrategyInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): MockStrategy {
    return new Contract(address, _abi, signerOrProvider) as MockStrategy;
  }
}
