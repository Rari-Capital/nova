/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type {
  EvilExternalContract,
  EvilExternalContractInterface,
} from "../EvilExternalContract";

const _abi = [
  {
    inputs: [
      {
        internalType: "contract L1_NovaExecutionManager",
        name: "_executionManager",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
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
    name: "tryToStealRelayerTokensAndReturnTrueIfFailed",
    outputs: [
      {
        internalType: "bool",
        name: "stealingFailed",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x60a060405234801561001057600080fd5b506040516103593803806103598339818101604052602081101561003357600080fd5b5051606081901b6001600160601b0319166080526001600160a01b03166102f361006660003980608152506102f36000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c806367150c0e14610030575b600080fd5b6100696004803603604081101561004657600080fd5b5073ffffffffffffffffffffffffffffffffffffffff813516906020013561007d565b604080519115158252519081900360200190f35b60007f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16633996e60a84846040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050600060405180830381600087803b15801561011057600080fd5b505af1925050508015610121575060015b6101f85761012d610204565b8061013857506101ee565b7f0da2cef0baa299da43eb01d5677caedf73b609d06e98f70950db32c90f012a32816040516020018082805190602001908083835b602083106101aa57805182527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0909201916020918201910161016d565b6001836020036101000a03801982511681845116808217855250505050505090500191505060405160208183030381529060405280519060200120149150506101f8565b3d6000803e3d6000fd5b92915050565b60e01c90565b600060443d1015610214576102e3565b600481823e6308c379a061022882516101fe565b14610232576102e3565b6040517ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3d016004823e80513d67ffffffffffffffff816024840111818411171561028057505050506102e3565b8284019250825191508082111561029a57505050506102e3565b503d830160208284010111156102b2575050506102e3565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01681016020016040529150505b9056fea164736f6c6343000706000a";

export class EvilExternalContract__factory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    _executionManager: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<EvilExternalContract> {
    return super.deploy(
      _executionManager,
      overrides || {}
    ) as Promise<EvilExternalContract>;
  }
  getDeployTransaction(
    _executionManager: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(_executionManager, overrides || {});
  }
  attach(address: string): EvilExternalContract {
    return super.attach(address) as EvilExternalContract;
  }
  connect(signer: Signer): EvilExternalContract__factory {
    return super.connect(signer) as EvilExternalContract__factory;
  }
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): EvilExternalContractInterface {
    return new utils.Interface(_abi) as EvilExternalContractInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): EvilExternalContract {
    return new Contract(
      address,
      _abi,
      signerOrProvider
    ) as EvilExternalContract;
  }
}
