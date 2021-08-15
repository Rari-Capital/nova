/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type {
  EchidnaL1NovaExecutionManager,
  EchidnaL1NovaExecutionManagerInterface,
} from "../EchidnaL1NovaExecutionManager";

const _abi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "strategy",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "l1Calldata",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "gasLimit",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "exec_should_not_affect_currentExecHash",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint128",
        name: "newCalldataByteGasEstimate",
        type: "uint128",
      },
    ],
    name: "should_always_allow_updating_the_calldata_byte_gas_estimate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint128",
        name: "newMissingGasEstimate",
        type: "uint128",
      },
    ],
    name: "should_always_allow_updating_the_missing_gas_estimate",
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
    name: "transferFromRelayer_should_always_be_not_executable",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x60c060405234801561001057600080fd5b50600060405161001f906100c2565b604051809103906000f08015801561003b573d6000803e3d6000fd5b506001600160601b0319606082901b1660a0526040519091506001908290600090610065906100cf565b80846001600160a01b03168152602001836001600160a01b031681526020018281526020019350505050604051809103906000f0801580156100ab573d6000803e3d6000fd5b5060601b6001600160601b031916608052506100dc565b6104d380610d7383390190565b6120ae8061124683390190565b60805160601c60a05160601c610c4161013260003950806101d55280610348528061043c528061050c528061059e5280610664528061071b52806108d352806109835280610a315280610ae15250610c416000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c8063294bb8a8146100515780633698ab9f1461013c578063a81ee44d14610175578063e8ff7d83146101a4575b600080fd5b61013a600480360360c081101561006757600080fd5b81359173ffffffffffffffffffffffffffffffffffffffff602082013516918101906060810160408201356401000000008111156100a457600080fd5b8201836020820111156100b657600080fd5b803590602001918460018302840111640100000000831117156100d857600080fd5b91908080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525092955050823593505050602081013573ffffffffffffffffffffffffffffffffffffffff1690604001356101d3565b005b61013a6004803603604081101561015257600080fd5b5073ffffffffffffffffffffffffffffffffffffffff8135169060200135610719565b61013a6004803603602081101561018b57600080fd5b50356fffffffffffffffffffffffffffffffff166108d1565b61013a600480360360208110156101ba57600080fd5b50356fffffffffffffffffffffffffffffffff16610a2f565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff166359f7cdfd8787878787876040518763ffffffff1660e01b8152600401808781526020018673ffffffffffffffffffffffffffffffffffffffff168152602001806020018581526020018473ffffffffffffffffffffffffffffffffffffffff168152602001838152602001828103825286818151815260200191508051906020019080838360005b838110156102ab578181015183820152602001610293565b50505050905090810190601f1680156102d85780820380516001836020036101000a031916815260200191505b50975050505050505050600060405180830381600087803b1580156102fc57600080fd5b505af192505050801561030d575060015b61043a57600061031c85610b45565b905042821080610340575073ffffffffffffffffffffffffffffffffffffffff8316155b8061039657507f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff168673ffffffffffffffffffffffffffffffffffffffff16145b806103e257507fffffffff0000000000000000000000000000000000000000000000000000000081167f3dbb202b00000000000000000000000000000000000000000000000000000000145b8061042e57507fffffffff0000000000000000000000000000000000000000000000000000000081167f23b872dd00000000000000000000000000000000000000000000000000000000145b61043457fe5b50610711565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff166371de9c106040518163ffffffff1660e01b815260040160206040518083038186803b1580156104a057600080fd5b505afa1580156104b4573d6000803e3d6000fd5b505050506040513d60208110156104ca57600080fd5b5051604080517feb714e19000000000000000000000000000000000000000000000000000000008152905173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000169163eb714e19916004808301926020929190829003018186803b15801561055257600080fd5b505afa158015610566573d6000803e3d6000fd5b505050506040513d602081101561057c57600080fd5b50511461058557fe5b3073ffffffffffffffffffffffffffffffffffffffff167f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff166341cd04206040518163ffffffff1660e01b815260040160206040518083038186803b15801561060257600080fd5b505afa158015610616573d6000803e3d6000fd5b505050506040513d602081101561062c57600080fd5b505173ffffffffffffffffffffffffffffffffffffffff161461064b57fe5b8473ffffffffffffffffffffffffffffffffffffffff167f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff166386b28c3c6040518163ffffffff1660e01b815260040160206040518083038186803b1580156106c857600080fd5b505afa1580156106dc573d6000803e3d6000fd5b505050506040513d60208110156106f257600080fd5b505173ffffffffffffffffffffffffffffffffffffffff161461071157fe5b505050505050565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16633996e60a83836040518363ffffffff1660e01b8152600401808373ffffffffffffffffffffffffffffffffffffffff16815260200182815260200192505050600060405180830381600087803b1580156107aa57600080fd5b505af19250505080156107bb575060015b6108cb576107c7610b52565b806107d257506108bc565b6000816040516020018082805190602001908083835b6020831061082557805182527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe090920191602091820191016107e8565b6001836020036101000a0380198251168184511680821785525050505050509050019150506040516020818303038152906040528051906020012090507f12f23d7716dd1a944157e91db7e5466415b0ae89675083fdd628b7311c6298748114806108af57507f0da2cef0baa299da43eb01d5677caedf73b609d06e98f70950db32c90f012a3281145b6108b557fe5b50506108c6565b3d6000803e3d6000fd5b6108cd565bfe5b5050565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff166317a459aa826040518263ffffffff1660e01b815260040180826fffffffffffffffffffffffffffffffff168152602001915050600060405180830381600087803b15801561095657600080fd5b505af115801561096a573d6000803e3d6000fd5b50505050806fffffffffffffffffffffffffffffffff167f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663a45421e76040518163ffffffff1660e01b815260040160206040518083038186803b1580156109e757600080fd5b505afa1580156109fb573d6000803e3d6000fd5b505050506040513d6020811015610a1157600080fd5b50516fffffffffffffffffffffffffffffffff1614610a2c57fe5b50565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff166328119244826040518263ffffffff1660e01b815260040180826fffffffffffffffffffffffffffffffff168152602001915050600060405180830381600087803b158015610ab457600080fd5b505af1158015610ac8573d6000803e3d6000fd5b50505050806fffffffffffffffffffffffffffffffff167f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663069d7a6f6040518163ffffffff1660e01b815260040160206040518083038186803b1580156109e757600080fd5b6020015190565b60e01c90565b600060443d1015610b6257610c31565b600481823e6308c379a0610b768251610b4c565b14610b8057610c31565b6040517ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3d016004823e80513d67ffffffffffffffff8160248401118184111715610bce5750505050610c31565b82840192508251915080821115610be85750505050610c31565b503d83016020828401011115610c0057505050610c31565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01681016020016040529150505b9056fea164736f6c6343000706000a608060405234801561001057600080fd5b506104b3806100206000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c80633dbb202b146100465780636e296e4514610113578063e542f64014610144575b600080fd5b6101116004803603606081101561005c57600080fd5b73ffffffffffffffffffffffffffffffffffffffff823516919081019060408101602082013564010000000081111561009457600080fd5b8201836020820111156100a657600080fd5b803590602001918460018302840111640100000000831117156100c857600080fd5b91908080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152509295505050903563ffffffff1691506101e79050565b005b61011b6101ec565b6040805173ffffffffffffffffffffffffffffffffffffffff9092168252519081900360200190f35b6101116004803603606081101561015a57600080fd5b73ffffffffffffffffffffffffffffffffffffffff823516919081019060408101602082013564010000000081111561019257600080fd5b8201836020820111156101a457600080fd5b803590602001918460018302840111640100000000831117156101c657600080fd5b91935091503573ffffffffffffffffffffffffffffffffffffffff16610208565b505050565b60005473ffffffffffffffffffffffffffffffffffffffff1681565b600080547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff838116919091178255604051829187169086908690808383808284376040519201945060009350909150508083038183865af19150503d80600081146102a5576040519150601f19603f3d011682016040523d82523d6000602084013e6102aa565b606091505b50600080547fffffffffffffffffffffffff00000000000000000000000000000000000000001690559092509050816102e28261038e565b90610385576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825283818151815260200191508051906020019080838360005b8381101561034a578181015183820152602001610332565b50505050905090810190601f1680156103775780820380516001836020036101000a031916815260200191505b509250505060405180910390fd5b50505050505050565b60606044825110156103d4575060408051808201909152601d81527f5472616e73616374696f6e2072657665727465642073696c656e746c7900000060208201526104a1565b60048201805190926024019060208110156103ee57600080fd5b810190808051604051939291908464010000000082111561040e57600080fd5b90830190602082018581111561042357600080fd5b825164010000000081118282018810171561043d57600080fd5b82525081516020918201929091019080838360005b8381101561046a578181015183820152602001610452565b50505050905090810190601f1680156104975780820380516001836020036101000a031916815260200191505b5060405250505090505b91905056fea164736f6c6343000706000a60e060405260028054610c3560861b6001600160801b0319909116600d176001600160801b03161790557ffeedfacecafebeeffeedfacecafebeeffeedfacecafebeeffeedfacecafebeef6006553480156200005a57600080fd5b50604051620020ae380380620020ae8339810160408190526200007d91620000f2565b600180546001600160a01b031916339081179091556040518391907f4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b90600090a2606090811b6001600160601b031990811660805293901b90921660a0525060e01b6001600160e01b03191660c05262000165565b60008060006060848603121562000107578283fd5b835162000114816200014c565b602085015190935062000127816200014c565b604085015190925063ffffffff8116811462000141578182fd5b809150509250925092565b6001600160a01b03811681146200016257600080fd5b50565b60805160601c60a05160601c60c05160e01c611f04620001aa60003980611413528061164d52508061030252806113315250806105f452806112f35250611f046000f3fe608060405234801561001057600080fd5b50600436106101825760003560e01c806351211924116100d85780638da5cb5b1161008c578063b7daba3611610066578063b7daba36146102d0578063bf7e214f146102d8578063eb714e19146102e057610182565b80638da5cb5b146102ab578063a45421e7146102b3578063a6d4b502146102bb57610182565b806371de9c10116100bd57806371de9c10146102885780637a9e5e4b1461029057806386b28c3c146102a357610182565b8063512119241461026057806359f7cdfd1461027557610182565b806317a459aa1161013a578063380174e011610114578063380174e0146102305780633996e60a1461024557806341cd04201461025857610182565b806317a459aa146101ea5780631e7660a0146101fd578063281192441461021d57610182565b806313af40351161016b57806313af4035146101ba578063148db7b5146101cf57806316be836c146101e257610182565b8063069d7a6f146101875780630d1fdd34146101a5575b600080fd5b61018f6102e8565b60405161019c9190611e78565b60405180910390f35b6101ad610300565b60405161019c9190611abc565b6101cd6101c83660046118db565b610324565b005b6101cd6101dd366004611949565b610432565b6101ad6105f2565b6101cd6101f8366004611968565b610616565b61021061020b3660046118db565b61070f565b60405161019c9190611bbd565b6101cd61022b366004611968565b610724565b610238610829565b60405161019c9190611bd1565b6101cd6102533660046118fe565b610862565b6101ad610c9d565b610268610cb9565b60405161019c9190611b81565b6101cd610283366004611998565b610d78565b6102686114b9565b6101cd61029e3660046118db565b6114dd565b6101ad6115e7565b6101ad611603565b61018f61161f565b6102c361164b565b60405161019c9190611e95565b6101cd610c32565b6101ad61166f565b61026861168b565b6002546fffffffffffffffffffffffffffffffff1681565b7f000000000000000000000000000000000000000000000000000000000000000081565b610352336000357fffffffff0000000000000000000000000000000000000000000000000000000016611691565b6103bd57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a45440000000000000000000000000000000000000000604482015290519081900360640190fd5b600180547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff83811691909117918290556040519116907f4ffd725fc4a22075e9ec71c59edf9c38cdeb588a91b24fc5b61388c5be41282b90600090a250565b610460336000357fffffffff0000000000000000000000000000000000000000000000000000000016611691565b6104cb57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a45440000000000000000000000000000000000000000604482015290519081900360640190fd5b3360009081526003602052604081205460ff1660028111156104e957fe5b14610529576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611cf7565b60405180910390fd5b600081600281111561053757fe5b141561056f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611e0a565b33600090815260036020526040902080548291907fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff001660018360028111156105b357fe5b02179055507f0d34da4cb8cb7b390f99942c84e2a40502ce8af0740de2790ab346d69b486b8e816040516105e79190611bbd565b60405180910390a150565b7f000000000000000000000000000000000000000000000000000000000000000081565b610644336000357fffffffff0000000000000000000000000000000000000000000000000000000016611691565b6106af57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a45440000000000000000000000000000000000000000604482015290519081900360640190fd5b600280546fffffffffffffffffffffffffffffffff8084167001000000000000000000000000000000000291161790556040517fabbdd4ac28cf4c177dfe6040161376471a0d8abeafae674e8a953218d2bc31b4906105e7908390611e78565b60036020526000908152604090205460ff1681565b610752336000357fffffffff0000000000000000000000000000000000000000000000000000000016611691565b6107bd57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a45440000000000000000000000000000000000000000604482015290519081900360640190fd5b600280547fffffffffffffffffffffffffffffffff00000000000000000000000000000000166fffffffffffffffffffffffffffffffff83161790556040517f4ca5451bbfb8d7f0ba4b6a4faed2872dbcb07253f32a52bd5456ce8b067ffadf906105e7908390611e78565b6040518060400160405280601681526020017f5f5f4e4f56415f5f484152445f5f5245564552545f5f0000000000000000000081525081565b610890336000357fffffffff0000000000000000000000000000000000000000000000000000000016611691565b6108fb57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a45440000000000000000000000000000000000000000604482015290519081900360640190fd5b60055473ffffffffffffffffffffffffffffffffffffffff16331461094c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611c1b565b6006547ffeedfacecafebeeffeedfacecafebeeffeedfacecafebeeffeedfacecafebeef14156109a8576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611c89565b60023360009081526003602052604090205460ff1660028111156109c857fe5b146109ff576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611d9c565b600454604051600091829173ffffffffffffffffffffffffffffffffffffffff868116927f23b872dd0000000000000000000000000000000000000000000000000000000092610a59929091169033908890602401611b0b565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529181526020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167fffffffff00000000000000000000000000000000000000000000000000000000909416939093179092529051610ae29190611aa0565b6000604051808303816000865af19150503d8060008114610b1f576040519150601f19603f3d011682016040523d82523d6000602084013e610b24565b606091505b5091509150816040518060400160405280601681526020017f5f5f4e4f56415f5f484152445f5f5245564552545f5f0000000000000000000081525090610b98576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105209190611bd1565b50805115610c9757805160201415610c325780806020019051810190610bbe9190611929565b6040518060400160405280601681526020017f5f5f4e4f56415f5f484152445f5f5245564552545f5f0000000000000000000081525090610c2c576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105209190611bd1565b50610c97565b604080518082018252601681527f5f5f4e4f56415f5f484152445f5f5245564552545f5f00000000000000000000602082015290517f08c379a00000000000000000000000000000000000000000000000000000000081526105209190600401611bd1565b50505050565b60045473ffffffffffffffffffffffffffffffffffffffff1681565b604080518082018252601681527f5f5f4e4f56415f5f484152445f5f5245564552545f5f0000000000000000000060208201529051610cfb9190602401611bd1565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529190526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f08c379a0000000000000000000000000000000000000000000000000000000001781529051902081565b60005a905081421115610db7576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611dd3565b6006547ffeedfacecafebeeffeedfacecafebeeffeedfacecafebeeffeedfacecafebeef14610e12576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611be4565b610e40336000357fffffffff0000000000000000000000000000000000000000000000000000000016611691565b610e76576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611cc0565b73ffffffffffffffffffffffffffffffffffffffff8316610ec3576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611c52565b73ffffffffffffffffffffffffffffffffffffffff8716301415610f13576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611e41565b6000610f5487878080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152506117e092505050565b90507fffffffff0000000000000000000000000000000000000000000000000000000081167f23b872dd000000000000000000000000000000000000000000000000000000001415610fd2576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611d2e565b7fffffffff0000000000000000000000000000000000000000000000000000000081167f3dbb202b00000000000000000000000000000000000000000000000000000000141561104e576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611d2e565b60006110958a8a8a8a8080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920191909152503a92508c91506117e79050565b6006819055600480547fffffffffffffffffffffffff000000000000000000000000000000000000000090811633179091556005805473ffffffffffffffffffffffffffffffffffffffff8d16921682179055604051919250600091829190611101908c908c90611a90565b6000604051808303816000865af19150503d806000811461113e576040519150601f19603f3d011682016040523d82523d6000602084013e611143565b606091505b509150915081806112195750604080518082018252601681527f5f5f4e4f56415f5f484152445f5f5245564552545f5f00000000000000000000602082015290516111919190602401611bd1565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0818403018152919052602080820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f08c379a000000000000000000000000000000000000000000000000000000000178152915190912082519183019190912014155b806112585750600273ffffffffffffffffffffffffffffffffffffffff8c1660009081526003602052604090205460ff16600281111561125557fe5b14155b61128e576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161052090611d65565b7ffeedfacecafebeeffeedfacecafebeeffeedfacecafebeeffeedfacecafebeef60065560005a6002546040519188036fffffffffffffffffffffffffffffffff808316360270010000000000000000000000000000000090930416919091010191507f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1690633dbb202b907f0000000000000000000000000000000000000000000000000000000000000000907f9d21cd1500000000000000000000000000000000000000000000000000000000906113889089908e908a15908990602401611b8a565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529181526020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167fffffffff000000000000000000000000000000000000000000000000000000009485161790525160e085901b909216825261143b92917f000000000000000000000000000000000000000000000000000000000000000090600401611b3c565b600060405180830381600087803b15801561145557600080fd5b505af1158015611469573d6000803e3d6000fd5b50505050837fd118217a540bf32db22ebd89e392054a9d0f5e30e6bfa753a87baa44ec0a60c6338515846040516114a293929190611add565b60405180910390a250505050505050505050505050565b7ffeedfacecafebeeffeedfacecafebeeffeedfacecafebeeffeedfacecafebeef81565b61150b336000357fffffffff0000000000000000000000000000000000000000000000000000000016611691565b61157657604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a45440000000000000000000000000000000000000000604482015290519081900360640190fd5b600080547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff838116919091178083556040519116917f2f658b440c35314f52658ea8a740e05b284cdc84dc9ae01e891f21b8933e7cad91a250565b60055473ffffffffffffffffffffffffffffffffffffffff1681565b60015473ffffffffffffffffffffffffffffffffffffffff1681565b60025470010000000000000000000000000000000090046fffffffffffffffffffffffffffffffff1681565b7f000000000000000000000000000000000000000000000000000000000000000081565b60005473ffffffffffffffffffffffffffffffffffffffff1681565b60065481565b600073ffffffffffffffffffffffffffffffffffffffff83163014156116b9575060016117da565b60015473ffffffffffffffffffffffffffffffffffffffff848116911614156116e4575060016117da565b60005473ffffffffffffffffffffffffffffffffffffffff168061170c5760009150506117da565b604080517fb700961300000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff86811660048301523060248301527fffffffff000000000000000000000000000000000000000000000000000000008616604483015291519183169163b700961391606480820192602092909190829003018186803b1580156117aa57600080fd5b505afa1580156117be573d6000803e3d6000fd5b505050506040513d60208110156117d457600080fd5b50519150505b92915050565b6020015190565b60008585858585604051602001808681526020018573ffffffffffffffffffffffffffffffffffffffff1660601b815260140184805190602001908083835b6020831061186357805182527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe09092019160209182019101611826565b51815160209384036101000a7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff018019909216911617905292019485525083810192909252506040805180840383018152928101905281519101209998505050505050505050565b80356118d681611ed2565b919050565b6000602082840312156118ec578081fd5b81356118f781611ed2565b9392505050565b60008060408385031215611910578081fd5b823561191b81611ed2565b946020939093013593505050565b60006020828403121561193a578081fd5b815180151581146118f7578182fd5b60006020828403121561195a578081fd5b8135600381106118f7578182fd5b600060208284031215611979578081fd5b81356fffffffffffffffffffffffffffffffff811681146118f7578182fd5b600080600080600080600060c0888a0312156119b2578283fd5b8735965060208801356119c481611ed2565b9550604088013567ffffffffffffffff808211156119e0578485fd5b818a0191508a601f8301126119f3578485fd5b813581811115611a01578586fd5b8b6020828501011115611a12578586fd5b60208301975080965050505060608801359250611a31608089016118cb565b915060a0880135905092959891949750929550565b60008151808452611a5e816020860160208601611ea6565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b6000828483379101908152919050565b60008251611ab2818460208701611ea6565b9190910192915050565b73ffffffffffffffffffffffffffffffffffffffff91909116815260200190565b73ffffffffffffffffffffffffffffffffffffffff9390931683529015156020830152604082015260600190565b73ffffffffffffffffffffffffffffffffffffffff9384168152919092166020820152604081019190915260600190565b600073ffffffffffffffffffffffffffffffffffffffff8516825260606020830152611b6b6060830185611a46565b905063ffffffff83166040830152949350505050565b90815260200190565b93845273ffffffffffffffffffffffffffffffffffffffff92909216602084015215156040830152606082015260800190565b6020810160038310611bcb57fe5b91905290565b6000602082526118f76020830184611a46565b60208082526011908201527f414c52454144595f455845435554494e47000000000000000000000000000000604082015260600190565b60208082526014908201527f4e4f545f43555252454e545f5354524154454759000000000000000000000000604082015260600190565b6020808252600e908201527f4e4545445f524543495049454e54000000000000000000000000000000000000604082015260600190565b60208082526013908201527f4e4f5f4143544956455f455845435554494f4e00000000000000000000000000604082015260600190565b6020808252600c908201527f554e415554484f52495a45440000000000000000000000000000000000000000604082015260600190565b60208082526012908201527f414c52454144595f524547495354455245440000000000000000000000000000604082015260600190565b6020808252600f908201527f554e534146455f43414c4c444154410000000000000000000000000000000000604082015260600190565b6020808252600b908201527f484152445f524556455254000000000000000000000000000000000000000000604082015260600190565b60208082526016908201527f554e535550504f525445445f5249534b5f4c4556454c00000000000000000000604082015260600190565b6020808252600d908201527f504153545f444541444c494e4500000000000000000000000000000000000000604082015260600190565b60208082526012908201527f494e56414c49445f5249534b5f4c4556454c0000000000000000000000000000604082015260600190565b6020808252600f908201527f554e534146455f53545241544547590000000000000000000000000000000000604082015260600190565b6fffffffffffffffffffffffffffffffff91909116815260200190565b63ffffffff91909116815260200190565b60005b83811015611ec1578181015183820152602001611ea9565b83811115610c975750506000910152565b73ffffffffffffffffffffffffffffffffffffffff81168114611ef457600080fd5b5056fea164736f6c6343000706000a";

export class EchidnaL1NovaExecutionManager__factory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<EchidnaL1NovaExecutionManager> {
    return super.deploy(
      overrides || {}
    ) as Promise<EchidnaL1NovaExecutionManager>;
  }
  getDeployTransaction(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(overrides || {});
  }
  attach(address: string): EchidnaL1NovaExecutionManager {
    return super.attach(address) as EchidnaL1NovaExecutionManager;
  }
  connect(signer: Signer): EchidnaL1NovaExecutionManager__factory {
    return super.connect(signer) as EchidnaL1NovaExecutionManager__factory;
  }
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): EchidnaL1NovaExecutionManagerInterface {
    return new utils.Interface(_abi) as EchidnaL1NovaExecutionManagerInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): EchidnaL1NovaExecutionManager {
    return new Contract(
      address,
      _abi,
      signerOrProvider
    ) as EchidnaL1NovaExecutionManager;
  }
}
